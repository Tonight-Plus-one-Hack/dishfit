/**
 * Community profiles: an anonymous device profile per signed device cookie (lib/device.ts), its
 * contributions (#33's submissions with device_id = profile id, "Hat das gestimmt?" confirmations),
 * badges for the thank-you moments and the Kiez leaderboard of scanners.
 *
 * Accounts later (magic link): add an `accounts` table, set profiles.account_id on sign-in and issue
 * the account's profile id in the device cookie on every signed-in device; merging two device
 * profiles is `UPDATE submissions SET device_id`, `UPDATE dish_confirmations SET profile_id`
 * and `INSERT OR IGNORE` of the badges. See upgradeHook() below.
 */
import { deviceSecret, newDeviceCookieHeader, readDevice, readDeviceCookie } from "../lib/device";

export const BADGES = {
  first_scan: { title: "Erster Scan", text: "Deine erste Speisekarte ist eingereicht. Danke!" },
  first_restaurant: { title: "Entdecker:in", text: "Du hast dein erstes Restaurant hinzugefügt." },
  ten_confirmations: { title: "Faktenchecker:in", text: "10 Gerichte bestätigt. Das hilft allen." },
} as const;
export type BadgeKey = keyof typeof BADGES;

/** New profiles per hashed IP and day: generous for a shared wifi, tight for cookie-dropping scripts. */
export const PROFILE_LIMITS = { newPerIpPerDay: 20 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const ADJECTIVES = ["Knackige", "Würzige", "Frische", "Bunte", "Sonnige", "Flinke", "Kluge", "Mutige", "Ruhige", "Wache", "Scharfe", "Grüne"];
const FOODS = ["Linse", "Bowl", "Gurke", "Bohne", "Feige", "Möhre", "Paprika", "Avocado", "Quinoa", "Olive", "Tomate", "Kichererbse"];

/** A friendly default nickname, stable per profile id, e.g. "Würzige Linse 42". */
export function defaultNickname(id: string): string {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${FOODS[(h >>> 8) % FOODS.length]} ${(h >>> 16) % 90 + 10}`;
}

export type ProfileRow = {
  id: string;
  nickname: string;
  nickname_custom: number;
  nickname_updated_at: number | null;
  account_id: string | null;
  created_at: number;
};

export type Identity =
  | { ok: true; id: string; created: boolean; headers: Record<string, string> }
  | { ok: false; reason: "disabled" | "rate_limited" };

/**
 * The caller's profile, created on the first contribution. Reads never create one (GET /api/me
 * answers an empty guest profile instead), so a visit costs no write.
 */
export async function ensureProfile(env: Env, request: Request, url: URL, ipHash: string | null, now: number): Promise<Identity> {
  const secret = deviceSecret(env);
  if (!secret) return { ok: false, reason: "disabled" };
  const cookie = await readDeviceCookie(request, env);
  let existing: string | null = null;
  if (cookie?.signed) {
    const row = await env.DB.prepare("UPDATE profiles SET last_seen_at = ? WHERE id = ? RETURNING id").bind(now, cookie.id).first<{ id: string }>();
    if (row) return { ok: true, id: cookie.id, created: false, headers: {} };
    // A valid cookie whose profile is gone (e.g. a fresh local database): recreate it under the same id.
    existing = cookie.id;
  } else if (cookie) {
    // A legacy unsigned id (set by the camera scans before profiles existed): keep it, so the device's private
    // scans stay listed, and sign it now. Never for an id that already has a profile: that one needs its signature.
    const taken = await env.DB.prepare("SELECT 1 AS x FROM profiles WHERE id = ?").bind(cookie.id).first("x");
    if (!taken) existing = cookie.id;
  }
  if (ipHash) {
    const recent = await env.DB.prepare("SELECT count(*) AS n FROM profiles WHERE created_ip_hash = ? AND created_at >= ?")
      .bind(ipHash, now - DAY_MS)
      .first<number>("n");
    if ((recent ?? 0) >= PROFILE_LIMITS.newPerIpPerDay) return { ok: false, reason: "rate_limited" };
  }
  const id = existing ?? crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO profiles (id, nickname, created_ip_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
  )
    .bind(id, defaultNickname(id), ipHash, now, now)
    .run();
  const resign = !existing || !cookie?.signed;
  return { ok: true, id, created: true, headers: resign ? { "set-cookie": await newDeviceCookieHeader(env, id, url) } : {} };
}

/** The caller's existing profile row, or null (no cookie, forged cookie, no row). */
export async function currentProfile(env: Env, request: Request): Promise<ProfileRow | null> {
  const id = await readDevice(request, env);
  if (!id) return null;
  return env.DB.prepare("SELECT id, nickname, nickname_custom, nickname_updated_at, account_id, created_at FROM profiles WHERE id = ?").bind(id).first<ProfileRow>();
}

/**
 * Awards every badge the profile qualifies for and has not got yet; returns the ones that are new.
 * Rejected photos do not count; a badge stays once earned.
 */
export async function awardBadges(db: D1Database, profileId: string, now: number): Promise<BadgeKey[]> {
  const rules: [BadgeKey, string][] = [
    ["first_scan", "SELECT count(*) >= 1 FROM submissions WHERE device_id = ?1 AND status != 'rejected'"],
    ["first_restaurant", "SELECT count(*) >= 1 FROM submissions WHERE device_id = ?1 AND is_new_restaurant = 1 AND status != 'rejected'"],
    ["ten_confirmations", "SELECT count(*) >= 10 FROM dish_confirmations WHERE profile_id = ?1"],
  ];
  const results = await db.batch<{ badge: string }>(
    rules.map(([badge, condition]) =>
      db
        .prepare(`INSERT INTO profile_badges (profile_id, badge, earned_at) SELECT ?1, ?2, ?3 WHERE (${condition}) ON CONFLICT DO NOTHING RETURNING badge`)
        .bind(profileId, badge, now),
    ),
  );
  return results.flatMap((r) => r.results.map((row) => row.badge as BadgeKey));
}

export type BadgeView = { key: BadgeKey; title: string; text: string; earnedAt: string; seen: boolean };

export const badgeView = (b: { badge: string; earned_at: number; seen_at: number | null }): BadgeView => ({
  key: b.badge as BadgeKey,
  ...BADGES[b.badge as BadgeKey],
  earnedAt: new Date(b.earned_at).toISOString(),
  seen: b.seen_at !== null,
});

/** Nickname rules: 2-24 letters, digits, spaces, dot, dash, underscore; word filter on top (caller). */
export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 24) return null;
  return /^[\p{L}\p{N} ._-]+$/u.test(name) ? name : null;
}

/**
 * The documented hook for the passwordless upgrade (not wired yet): after a magic-link sign-in,
 * point this device's profile at the account. Additive by design: no column or id changes.
 */
export async function upgradeHook(db: D1Database, profileId: string, accountId: string): Promise<void> {
  await db.prepare("UPDATE profiles SET account_id = ? WHERE id = ? AND account_id IS NULL").bind(accountId, profileId).run();
}
