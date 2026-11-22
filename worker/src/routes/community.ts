import { isKiezSlug, KIEZE } from "@wohin/contract";
import { isAdmin } from "../lib/admin";
import { apiError, badRequest, json, readJson, type RouteContext } from "../lib/http";
import { ipHash } from "../lib/ip";
import { checkText } from "../lib/word-filter";
import { awardBadges, badgeView, BADGES, currentProfile, defaultNickname, ensureProfile, normalizeNickname, type BadgeKey, type Identity } from "../community/profiles";

/**
 * Community profile, "Hat das gestimmt?" confirmations and the Kiez leaderboard (community/profiles.ts).
 * Everything a guest can make others see (nickname, correction) passes the word filter.
 */

/** Per profile and per hashed IP, rolling 24 hours. */
export const CONFIRM_LIMITS = { perProfilePerDay: 60, perIpPerDay: 200 } as const;
/** Minimum time between two nickname changes. */
export const NICKNAME_COOLDOWN_MS = 10 * 60 * 1000;
export const LEADERBOARD_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

async function hashOf(env: Env, request: Request, now: number): Promise<string | null> {
  try {
    return await ipHash(env.DB, request, now);
  } catch {
    return null;
  }
}

function identityError(identity: Exclude<Identity, { ok: true }>): Response {
  return identity.reason === "disabled"
    ? apiError("internal", "Profiles are not configured.", 503)
    : apiError("rate_limited", "Too many new profiles from this network, try again tomorrow.", 429);
}

type ContributionRow = {
  id: string;
  status: string;
  restaurant_ref: string | null;
  restaurant_id: string | null;
  restaurant_name: string;
  is_new_restaurant: number;
  dish_count: number;
  kiez: string | null;
  created_at: number;
};

/** GET /api/me: the caller's profile with contributions, stats and badges; a guest profile without a cookie. */
export async function getMe({ request, env }: RouteContext): Promise<Response> {
  const profile = await currentProfile(env, request);
  if (!profile) {
    return json({
      profile: null,
      stats: { scans: 0, publishedScans: 0, restaurantsAdded: 0, dishesOnline: 0, confirmations: 0 },
      badges: [],
      lockedBadges: Object.entries(BADGES).map(([key, b]) => ({ key, ...b })),
      scans: [],
      confirmations: [],
    });
  }
  const now = Date.now();
  await awardBadges(env.DB, profile.id, now);
  const [stats, scans, confirmations, badges] = await env.DB.batch([
    env.DB.prepare(
      `SELECT count(*) AS scans,
              coalesce(sum(status = 'published'), 0) AS published,
              coalesce(sum(is_new_restaurant = 1 AND status != 'rejected'), 0) AS restaurants,
              coalesce(sum(CASE WHEN status = 'published' THEN dish_count ELSE 0 END), 0) AS dishes,
              (SELECT count(*) FROM dish_confirmations WHERE profile_id = ?1) AS confirmations
         FROM submissions WHERE device_id = ?1`,
    ).bind(profile.id),
    env.DB.prepare(
      `SELECT id, status, restaurant_ref, restaurant_id, restaurant_name, is_new_restaurant, dish_count, kiez, created_at
         FROM submissions WHERE device_id = ? ORDER BY created_at DESC LIMIT 50`,
    ).bind(profile.id),
    env.DB.prepare(
      `SELECT dish_ref, dish_name, restaurant_ref, verdict, correction, updated_at
         FROM dish_confirmations WHERE profile_id = ? ORDER BY updated_at DESC LIMIT 50`,
    ).bind(profile.id),
    env.DB.prepare("SELECT badge, earned_at, seen_at FROM profile_badges WHERE profile_id = ? ORDER BY earned_at").bind(profile.id),
  ]);
  const s = stats!.results[0] as { scans: number; published: number; restaurants: number; dishes: number; confirmations: number };
  const earned = (badges!.results as { badge: string; earned_at: number; seen_at: number | null }[]).map(badgeView);
  const earnedKeys = new Set(earned.map((b) => b.key));
  return json({
    profile: {
      id: profile.id,
      nickname: profile.nickname,
      nicknameCustom: profile.nickname_custom === 1,
      since: new Date(profile.created_at).toISOString(),
      // The magic-link upgrade fills this; until then every profile is a device profile.
      account: profile.account_id ? { id: profile.account_id } : null,
    },
    stats: { scans: s.scans, publishedScans: s.published, restaurantsAdded: s.restaurants, dishesOnline: s.dishes, confirmations: s.confirmations },
    badges: earned,
    lockedBadges: Object.entries(BADGES)
      .filter(([key]) => !earnedKeys.has(key as BadgeKey))
      .map(([key, b]) => ({ key, ...b })),
    scans: (scans!.results as ContributionRow[]).map((r) => ({
      id: r.id,
      status: r.status,
      restaurant: { id: r.restaurant_ref ?? r.restaurant_id, name: r.restaurant_name, isNew: r.is_new_restaurant === 1 },
      kiez: r.kiez,
      dishCount: r.dish_count,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    confirmations: (confirmations!.results as { dish_ref: string; dish_name: string | null; restaurant_ref: string | null; verdict: string; correction: string | null; updated_at: number }[]).map(
      (c) => ({
        dishId: c.dish_ref,
        dishName: c.dish_name,
        restaurantId: c.restaurant_ref,
        verdict: c.verdict,
        correction: c.correction,
        at: new Date(c.updated_at).toISOString(),
      }),
    ),
  });
}

/** PATCH /api/me { nickname }: a custom nickname (empty resets to the generated one). */
export async function patchMe({ request, env, url }: RouteContext): Promise<Response> {
  const body = (await readJson(request, 1024)) as { nickname?: unknown } | null;
  if (!body || !("nickname" in body)) return badRequest("Send a nickname.");
  const reset = body.nickname === "" || body.nickname === null;
  const nickname = reset ? null : normalizeNickname(body.nickname);
  if (!reset && !nickname) return badRequest("Der Name braucht 2-24 Zeichen: Buchstaben, Ziffern, Leerzeichen, Punkt, Strich.");
  if (nickname && !checkText(nickname).ok) return apiError("bad_request", "Bitte wähle einen anderen Namen.", 422);
  const now = Date.now();
  const identity = await ensureProfile(env, request, url, await hashOf(env, request, now), now);
  if (!identity.ok) return identityError(identity);
  const row = await env.DB.prepare("SELECT nickname_updated_at FROM profiles WHERE id = ?").bind(identity.id).first<{ nickname_updated_at: number | null }>();
  if (row?.nickname_updated_at && now - row.nickname_updated_at < NICKNAME_COOLDOWN_MS) {
    return json({ error: { code: "rate_limited", message: "Du kannst deinen Namen gleich wieder ändern." } }, 429, identity.headers);
  }
  const final = nickname ?? defaultNickname(identity.id);
  await env.DB.prepare("UPDATE profiles SET nickname = ?, nickname_custom = ?, nickname_updated_at = ? WHERE id = ?")
    .bind(final, nickname ? 1 : 0, now, identity.id)
    .run();
  return json({ nickname: final, nicknameCustom: nickname !== null }, 200, identity.headers);
}

/** POST /api/me/badges/seen { badges: ["first_scan"] }: the thank-you moment was shown. */
export async function badgesSeen({ request, env }: RouteContext): Promise<Response> {
  const profile = await currentProfile(env, request);
  if (!profile) return apiError("not_found", "No profile yet.", 404);
  const body = (await readJson(request, 1024)) as { badges?: unknown } | null;
  const keys = Array.isArray(body?.badges) ? body.badges.filter((b): b is BadgeKey => typeof b === "string" && b in BADGES) : [];
  if (keys.length === 0) return badRequest("Send badges.");
  await env.DB.prepare("UPDATE profile_badges SET seen_at = ? WHERE profile_id = ? AND seen_at IS NULL AND badge IN (SELECT value FROM json_each(?))")
    .bind(Date.now(), profile.id, JSON.stringify(keys))
    .run();
  return json({ ok: true });
}

type Tally = { yes: number; no: number };

async function tally(db: D1Database, dishRef: string): Promise<Tally> {
  const row = await db
    .prepare("SELECT coalesce(sum(verdict = 'yes'), 0) AS yes, coalesce(sum(verdict = 'no'), 0) AS no FROM dish_confirmations WHERE dish_ref = ?")
    .bind(dishRef)
    .first<Tally>();
  return { yes: row?.yes ?? 0, no: row?.no ?? 0 };
}

const validDishRef = (id: string | undefined): id is string => !!id && id.length <= 64 && /^[\w:.-]+$/.test(id);

/** GET /api/dishes/:id/confirmations: "von N bestätigt" plus the caller's own verdict. */
export async function getConfirmations({ request, env, params }: RouteContext): Promise<Response> {
  if (!validDishRef(params.id)) return badRequest("Unknown dish id.");
  const profile = await currentProfile(env, request);
  const [counts, mine] = await Promise.all([
    tally(env.DB, params.id),
    profile
      ? env.DB.prepare("SELECT verdict, correction FROM dish_confirmations WHERE dish_ref = ? AND profile_id = ?").bind(params.id, profile.id).first<{ verdict: "yes" | "no"; correction: string | null }>()
      : null,
  ]);
  return json({ dishId: params.id, ...counts, mine: mine ?? null });
}

/**
 * POST /api/dishes/:id/confirmations { verdict: "yes" | "no", correction?, dishName?, restaurantId? }:
 * one verdict per profile and dish, changeable. Creates the device profile on the first vote.
 */
export async function postConfirmation({ request, env, url, params }: RouteContext): Promise<Response> {
  if (!validDishRef(params.id)) return badRequest("Unknown dish id.");
  const body = (await readJson(request, 2048)) as { verdict?: unknown; correction?: unknown; dishName?: unknown; restaurantId?: unknown } | null;
  if (!body || (body.verdict !== "yes" && body.verdict !== "no")) return badRequest('verdict must be "yes" or "no".');
  const correction = body.verdict === "no" && typeof body.correction === "string" ? body.correction.replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
  if (correction && !checkText(correction).ok) return apiError("bad_request", "Bitte formuliere die Korrektur anders.", 422);
  const dishName = typeof body.dishName === "string" ? body.dishName.trim().slice(0, 120) || null : null;
  const restaurantRef = typeof body.restaurantId === "string" && body.restaurantId.length <= 64 ? body.restaurantId : null;

  const now = Date.now();
  const hash = await hashOf(env, request, now);
  const identity = await ensureProfile(env, request, url, hash, now);
  if (!identity.ok) return identityError(identity);

  const recent = await env.DB.prepare(
    `SELECT (SELECT count(*) FROM dish_confirmations WHERE profile_id = ?1 AND updated_at >= ?2) AS profile,
            (SELECT count(*) FROM dish_confirmations WHERE ip_hash = ?3 AND updated_at >= ?2) AS ip`,
  )
    .bind(identity.id, now - DAY_MS, hash ?? "")
    .first<{ profile: number; ip: number }>();
  if ((recent?.profile ?? 0) >= CONFIRM_LIMITS.perProfilePerDay || (hash && (recent?.ip ?? 0) >= CONFIRM_LIMITS.perIpPerDay)) {
    return json({ error: { code: "rate_limited", message: "Genug bestätigt für heute, danke!" } }, 429, identity.headers);
  }

  await env.DB.prepare(
    `INSERT INTO dish_confirmations (dish_ref, profile_id, verdict, correction, dish_name, restaurant_ref, ip_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (dish_ref, profile_id) DO UPDATE SET verdict = excluded.verdict, correction = excluded.correction,
       dish_name = coalesce(excluded.dish_name, dish_name), restaurant_ref = coalesce(excluded.restaurant_ref, restaurant_ref),
       ip_hash = excluded.ip_hash, updated_at = excluded.updated_at`,
  )
    .bind(params.id, identity.id, body.verdict, correction, dishName, restaurantRef, hash, now, now)
    .run();
  const newBadges = await awardBadges(env.DB, identity.id, now);
  return json(
    {
      dishId: params.id,
      ...(await tally(env.DB, params.id)),
      mine: { verdict: body.verdict, correction },
      newBadges: newBadges.map((key) => ({ key, ...BADGES[key] })),
    },
    200,
    identity.headers,
  );
}

/**
 * GET /api/leaderboard?kiez=mitte&period=week|all: scanners ranked by published menu photos in a Kiez
 * (the last 7 days or all time). Only published photos count, so votes or rejected uploads cannot farm it.
 */
export async function leaderboard({ request, env, url }: RouteContext): Promise<Response> {
  const kiez = url.searchParams.get("kiez") ?? "";
  if (kiez && !isKiezSlug(kiez)) return badRequest("Unknown kiez.");
  const period = url.searchParams.get("period") ?? "week";
  if (period !== "week" && period !== "all") return badRequest('period must be "week" or "all".');
  const since = period === "week" ? Date.now() - WEEK_MS : 0;
  const profile = await currentProfile(env, request);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.nickname, count(*) AS scans, sum(s.dish_count) AS dishes, max(s.created_at) AS last_at
       FROM submissions s JOIN profiles p ON p.id = s.device_id
      WHERE s.status = 'published' AND s.created_at >= ?1 AND (?2 = '' OR s.kiez = ?2)
      GROUP BY p.id ORDER BY scans DESC, dishes DESC, last_at ASC LIMIT ?3`,
  )
    .bind(since, kiez, LEADERBOARD_SIZE)
    .all<{ id: string; nickname: string; scans: number; dishes: number; last_at: number }>();
  const entries = results.map((r, i) => ({ rank: i + 1, nickname: r.nickname, scans: r.scans, dishes: r.dishes, isMe: r.id === profile?.id }));
  let me: { rank: number | null; scans: number } | null = null;
  if (profile && !entries.some((e) => e.isMe)) {
    const mine = await env.DB.prepare(
      `SELECT count(*) AS scans FROM submissions WHERE device_id = ?1 AND status = 'published' AND created_at >= ?2 AND (?3 = '' OR kiez = ?3)`,
    )
      .bind(profile.id, since, kiez)
      .first<number>("scans");
    me = { rank: null, scans: mine ?? 0 };
  }
  return json({ kiez: kiez || null, period, kieze: KIEZE.map((k) => ({ slug: k.slug, name: k.name })), entries, me });
}

/** GET /api/admin/confirmations?verdict=no: corrections from guests, newest first (ADMIN_TOKEN). */
export async function listConfirmations({ request, env, url }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return apiError("forbidden", "Admin token required.", 403);
  const verdict = url.searchParams.get("verdict") ?? "no";
  if (verdict !== "yes" && verdict !== "no") return badRequest("Unknown verdict.");
  const { results } = await env.DB.prepare(
    `SELECT dish_ref, dish_name, restaurant_ref, correction, updated_at,
            (SELECT count(*) FROM dish_confirmations y WHERE y.dish_ref = c.dish_ref AND y.verdict = 'yes') AS yes,
            (SELECT count(*) FROM dish_confirmations n WHERE n.dish_ref = c.dish_ref AND n.verdict = 'no') AS no
       FROM dish_confirmations c WHERE verdict = ? ORDER BY updated_at DESC LIMIT 100`,
  )
    .bind(verdict)
    .all<{ dish_ref: string; dish_name: string | null; restaurant_ref: string | null; correction: string | null; updated_at: number; yes: number; no: number }>();
  return json({
    items: results.map((r) => ({ dishId: r.dish_ref, dishName: r.dish_name, restaurantId: r.restaurant_ref, correction: r.correction, yes: r.yes, no: r.no, at: new Date(r.updated_at).toISOString() })),
  });
}
