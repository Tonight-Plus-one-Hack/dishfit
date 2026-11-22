import { isAdmin } from "../lib/admin";
import { apiError, badRequest, json, notFound, readJson, type RouteContext } from "../lib/http";
import { deletePhoto, guestPhotoKey, photoResponse, photoStore, storePhoto } from "../lib/photo-store";
import { writesLeft } from "../lib/storage-budget";
import { ipHash } from "../lib/ip";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, sha256Hex } from "../community/image";
import { checkPhotoUpload, readPhotoForm, readUploadedPhoto } from "../community/upload";
import { COMMUNITY_PHOTO_TTL_SECONDS } from "../lib/community-photo-retention";
import { applyOutcome, reviewSubmission, type ReviewRecord } from "../community/review";
import { stableUuid } from "../../../pipeline/src/export/publish.ts";
import { kiezAt } from "../../../pipeline/src/kiez.ts";
import { isKiezSlug } from "@wohin/contract";
import { readDevice } from "../lib/device";
import { awardBadges, BADGES, ensureProfile } from "../community/profiles";

/**
 * Community menu scans (worker/src/community): upload, status for the guest, the team queue.
 * The photo lives in the photo store (lib/photo-store.ts) under photos/<device>/<uuid> and expires after 12 months (lib/community-photo-retention.ts).
 * GET /api/submissions/:id/photo serves it to everyone only once the submission is published; before that
 * (and after a rejection) only the guest's own device and the admin queue can read it.
 */

export type SubmissionStatus = "pending" | "review" | "published" | "rejected";

export type SubmissionView = {
  id: string;
  status: SubmissionStatus;
  reason: string | null;
  restaurant: { id: string | null; name: string; isNew: boolean };
  dishCount: number;
  createdAt: string;
  decidedAt: string | null;
};

/** Per hashed IP and per device cookie: generous for a café's shared wifi, tight for scripts. */
export const SUBMISSION_LIMITS = { perHour: 5, perDay: 20 } as const;
/** The signed device profile cookie (lib/device.ts); submissions.device_id holds the profile id. */
export { DEVICE_COOKIE } from "../lib/device";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** The multipart body may carry a little more than the photo (fields, boundaries). */

type Row = {
  id: string;
  status: SubmissionStatus;
  reason: string | null;
  restaurant_id: string | null;
  restaurant_ref: string | null;
  restaurant_name: string;
  is_new_restaurant: number;
  dish_count: number;
  created_at: number;
  decided_at: number | null;
};

function view(r: Row): SubmissionView {
  return {
    id: r.id,
    status: r.status,
    reason: r.status === "rejected" ? r.reason : null,
    // The id the app sent (its own data may use other ids than D1), else the community restaurant's id once approved.
    restaurant: { id: r.restaurant_ref ?? r.restaurant_id, name: r.restaurant_name, isNew: r.is_new_restaurant === 1 },
    dishCount: r.dish_count,
    createdAt: new Date(r.created_at).toISOString(),
    decidedAt: r.decided_at === null ? null : new Date(r.decided_at).toISOString(),
  };
}

const flag = (v: string | undefined) => v?.trim().toLowerCase() === "true";

/** Cloudflare Turnstile siteverify; true when the token is valid. */
async function turnstileOk(secret: string | undefined, token: string, request: Request): Promise<boolean> {
  if (!secret || !token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

/** Why uploads are paused right now: no photo store on this deploy, or today's write budget is used up. */
export type UploadsPaused = "unavailable" | "daily_limit";

export const STORAGE_LIMIT_MESSAGE = "Daily photo limit reached, uploads continue tomorrow.";

async function uploadsPaused(env: Env, now: number): Promise<UploadsPaused | null> {
  if (!photoStore(env)) return "unavailable";
  return (await writesLeft(env, now)) > 0 ? null : "daily_limit";
}

/** GET /api/submissions/config: what the upload form needs. */
export async function submissionConfig({ env }: RouteContext): Promise<Response> {
  const paused = await uploadsPaused(env, Date.now());
  return json({
    uploadsEnabled: paused === null,
    uploadsPaused: paused,
    turnstileSiteKey: flag(env.TURNSTILE_ENABLED) ? env.TURNSTILE_SITE_KEY || null : null,
    maxBytes: MAX_PHOTO_BYTES,
    acceptedTypes: PHOTO_TYPES,
  });
}

/**
 * The D1 ids an app restaurant id can stand for: the id itself, and for the app's pipeline seed ids
 * ("osm-node-123") the id the pipeline publishes that restaurant under (stableUuid("osm:node/123"),
 * pipeline/src/export/publish.ts).
 */
export function restaurantIdCandidates(id: string): string[] {
  const m = /^osm-(node|way|relation)-(\d+)$/.exec(id);
  return m ? [id, stableUuid(`osm:${m[1]}/${m[2]}`)] : [id];
}

type NewRestaurant = { name: string; lat: number; lng: number; address: string | null };

function parseNewRestaurant(raw: string): NewRestaurant | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof v.name === "string" ? v.name.trim() : "";
    const lat = Number(v.lat);
    const lng = Number(v.lng);
    const address = typeof v.address === "string" ? v.address.trim().slice(0, 200) : "";
    if (name.length < 2 || name.length > 120) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { name, lat, lng, address: address || null };
  } catch {
    return null;
  }
}

async function overLimit(db: D1Database, column: "ip_hash" | "device_id", value: string | null, now: number): Promise<boolean> {
  if (!value) return false;
  const row = await db
    .prepare(`SELECT sum(created_at >= ?) AS hour, count(*) AS day FROM submissions WHERE ${column} = ? AND created_at >= ?`)
    .bind(now - HOUR_MS, value, now - DAY_MS)
    .first<{ hour: number | null; day: number }>();
  return (row?.hour ?? 0) >= SUBMISSION_LIMITS.perHour || (row?.day ?? 0) >= SUBMISSION_LIMITS.perDay;
}

/** POST /api/submissions: a guest's menu photo for an existing or a new restaurant. */
export async function postSubmission({ request, env, ctx, url }: RouteContext): Promise<Response> {
  const now = Date.now();
  const paused = await uploadsPaused(env, now);
  if (paused === "unavailable") return apiError("unavailable", "Photo uploads are not available.", 503);
  if (paused === "daily_limit") return apiError("storage_limit", STORAGE_LIMIT_MESSAGE, 503);
  const invalidUpload = checkPhotoUpload(request);
  if (invalidUpload) return invalidUpload;

  const existingDevice = await readDevice(request, env);
  let hash: string | null = null;
  try {
    hash = await ipHash(env.DB, request, now);
  } catch {
    hash = null;
  }
  if ((await overLimit(env.DB, "ip_hash", hash, now)) || (await overLimit(env.DB, "device_id", existingDevice, now))) {
    return apiError("rate_limited", "Too many uploads, try again later.", 429);
  }

  const form = await readPhotoForm(request);
  if (form instanceof Response) return form;
  if (form.get("consent") !== "1") return badRequest("Consent is required.");

  if (flag(env.TURNSTILE_ENABLED)) {
    const token = String(form.get("turnstileToken") ?? form.get("cf-turnstile-response") ?? "");
    if (!(await turnstileOk(env.TURNSTILE_SECRET_KEY, token, request))) return apiError("forbidden", "Security check failed.", 403);
  }

  const photo = await readUploadedPhoto(form);
  if (photo instanceof Response) return photo;
  const { bytes, type } = photo;

  // The restaurant: an existing id (with its name as a hint for ids we do not have) or a new place.
  const restaurantId = String(form.get("restaurantId") ?? "").trim().slice(0, 64);
  const newRaw = String(form.get("newRestaurant") ?? "").trim();
  // The Kiez the photo counts for on the leaderboard; the app's hint only for restaurants D1 does not have.
  const kiezHint = String(form.get("kiez") ?? "").trim();
  let restaurant: { id: string | null; ref: string | null; name: string; isNew: boolean; place: NewRestaurant | null; kiez: string | null };
  if (newRaw) {
    const place = parseNewRestaurant(newRaw);
    if (!place) return badRequest("newRestaurant needs a name (2-120 characters), lat and lng.");
    restaurant = { id: null, ref: null, name: place.name, isNew: true, place, kiez: kiezAt({ lat: place.lat, lng: place.lng }) };
  } else if (restaurantId) {
    const row = await env.DB.prepare("SELECT id, name, kiez FROM restaurants WHERE id IN (SELECT value FROM json_each(?)) AND published_at IS NOT NULL LIMIT 1")
      .bind(JSON.stringify(restaurantIdCandidates(restaurantId)))
      .first<{ id: string; name: string; kiez: string }>();
    const hint = String(form.get("restaurantName") ?? "").trim().slice(0, 120);
    if (!row && !hint) return badRequest("Unknown restaurantId; send restaurantName with it.");
    restaurant = { id: row?.id ?? null, ref: restaurantId, name: row?.name ?? hint, isNew: false, place: null, kiez: row?.kiez ?? (isKiezSlug(kiezHint) ? kiezHint : null) };
  } else {
    return badRequest("Send restaurantId or newRestaurant.");
  }

  // The guest's device profile (created on the first contribution); without one the photo still counts for the team.
  const identity = await ensureProfile(env, request, url, hash, now);
  const deviceId = identity.ok ? identity.id : null;
  const setCookie: Record<string, string> = identity.ok ? identity.headers : {};

  const id = crypto.randomUUID();
  const key = guestPhotoKey(deviceId);
  const photoHash = await sha256Hex(bytes);
  const stored = await storePhoto(env, key, bytes, { contentType: type, ttlSeconds: COMMUNITY_PHOTO_TTL_SECONDS });
  if (!stored.ok) {
    const res = stored.reason === "daily_limit" ? apiError("storage_limit", STORAGE_LIMIT_MESSAGE, 503) : apiError("unavailable", "Photo storage is not available.", 503);
    for (const [name, value] of Object.entries(setCookie)) res.headers.append(name, value);
    return res;
  }
  await env.DB.prepare(
    `INSERT INTO submissions (id, status, restaurant_id, restaurant_ref, restaurant_name, is_new_restaurant, new_lat, new_lng, new_address,
       photo_key, photo_sha256, photo_type, photo_bytes, ip_hash, device_id, created_at, kiez)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      restaurant.id,
      restaurant.ref,
      restaurant.name,
      restaurant.isNew ? 1 : 0,
      restaurant.place?.lat ?? null,
      restaurant.place?.lng ?? null,
      restaurant.place?.address ?? null,
      key,
      photoHash,
      type,
      bytes.length,
      hash,
      deviceId,
      now,
      restaurant.kiez,
    )
    .run()
    .catch(async (error: unknown) => {
      await deletePhoto(env, key);
      throw error;
    });

  ctx.waitUntil(reviewSubmission(env, id, { photo: bytes }));
  const newBadges = deviceId ? await awardBadges(env.DB, deviceId, now) : [];
  const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first<Row>();
  return json({ submission: view(row!), newBadges: newBadges.map((badge) => ({ key: badge, ...BADGES[badge] })) }, 202, setCookie);
}

/** GET /api/submissions/:id: status only; the photo has its own route below. */
export async function getSubmission({ env, params }: RouteContext): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?")
    .bind(params.id ?? "")
    .first<Row>();
  return row ? json({ submission: view(row) }) : notFound("Submission not found");
}

/**
 * GET /api/submissions/:id/photo: the menu photo of a published submission, for everyone.
 * Before publication and after a rejection only the guest's own device sees it; anyone else gets 404.
 */
export async function submissionPublicPhoto({ request, env, params }: RouteContext): Promise<Response> {
  const row = await env.DB.prepare("SELECT status, photo_key, device_id, created_at FROM submissions WHERE id = ?")
    .bind(params.id ?? "")
    .first<{ status: SubmissionStatus; photo_key: string; device_id: string | null; created_at: number }>();
  if (!row || Date.now() >= row.created_at + COMMUNITY_PHOTO_TTL_SECONDS * 1000) return notFound("Photo not found");
  const isPublic = row.status === "published";
  if (!isPublic) {
    const device = await readDevice(request, env);
    if (!device || device !== row.device_id) return notFound("Photo not found");
  }
  const object = await photoStore(env)?.get(row.photo_key);
  if (!object) return notFound("Photo not found");
  // KV caches the bytes at the edge. HTTP caches must revalidate so moderation is checked on each request.
  return photoResponse(object.bytes, object.contentType, isPublic ? "public, max-age=0, must-revalidate" : "private, no-store");
}

/** GET /api/community/dishes?restaurantId=: published dishes from guests' photos, newest first. */
export async function communityDishes({ env, url }: RouteContext): Promise<Response> {
  const restaurantId = url.searchParams.get("restaurantId")?.trim();
  if (!restaurantId) return badRequest("restaurantId is required.");
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.name, d.description, d.price_cents, d.kcal, d.protein_g, d.carbs_g, d.fat_g, d.community_added_at
       FROM dishes d JOIN submissions s ON s.id = d.community_submission_id
      WHERE (d.restaurant_id IN (SELECT value FROM json_each(?1)) OR s.restaurant_ref = ?2) AND d.published_at IS NOT NULL
      ORDER BY d.community_added_at DESC, d.name LIMIT 50`,
  )
    .bind(JSON.stringify(restaurantIdCandidates(restaurantId)), restaurantId)
    .all<{ id: string; name: string; description: string | null; price_cents: number | null; kcal: number; protein_g: number; carbs_g: number; fat_g: number; community_added_at: number }>();
  return json({
    dishes: results.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      priceCents: d.price_cents,
      kcal: d.kcal,
      proteinG: d.protein_g,
      carbsG: d.carbs_g,
      fatG: d.fat_g,
      addedAt: new Date(d.community_added_at).toISOString(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Team queue (ADMIN_TOKEN)
// ---------------------------------------------------------------------------

const forbidden = () => apiError("forbidden", "Admin token required.", 403);

/** GET /api/admin/submissions?status=review: the team queue with the agent's notes and prepared dishes. */
export async function listSubmissions({ request, env, url }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return forbidden();
  const status = url.searchParams.get("status") ?? "review";
  if (!["pending", "review", "published", "rejected"].includes(status)) return badRequest("Unknown status.");
  const { results } = await env.DB.prepare("SELECT * FROM submissions WHERE status = ? ORDER BY created_at ASC LIMIT 100")
    .bind(status)
    .all<Row & { team_note: string | null; review: string | null; cost_micros: number; confidence: string | null; new_lat: number | null; new_lng: number | null; new_address: string | null }>();
  return json({
    items: results.map((r) => {
      const review = r.review ? (JSON.parse(r.review) as ReviewRecord) : null;
      return {
        ...view(r),
        teamNote: r.team_note,
        confidence: r.confidence,
        costUsd: r.cost_micros / 1e6,
        newPlace: r.is_new_restaurant ? { lat: r.new_lat, lng: r.new_lng, address: r.new_address } : null,
        reading: review?.reading ?? null,
        dishes: (review?.dishes ?? []).map((d) => ({ name: d.name, priceCents: d.priceCents, kcal: d.nutrition.totals.kcal, proteinG: d.nutrition.totals.protein, flags: d.flags })),
      };
    }),
  });
}

/** GET /api/admin/submissions/:id/photo: the private photo, for the team only. */
export async function submissionPhoto({ request, env, params }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return forbidden();
  const row = await env.DB.prepare("SELECT photo_key, photo_type, created_at FROM submissions WHERE id = ?")
    .bind(params.id ?? "")
    .first<{ photo_key: string; photo_type: string; created_at: number }>();
  if (!row || Date.now() >= row.created_at + COMMUNITY_PHOTO_TTL_SECONDS * 1000) return notFound("Photo not found");
  const object = await photoStore(env)?.get(row.photo_key);
  if (!object) return notFound("Photo not found");
  return photoResponse(object.bytes, row.photo_type, "private, no-store");
}

/** POST /api/admin/submissions/:id/decision { decision: "publish" | "reject", reason? } */
export async function decideSubmission({ request, env, params }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return forbidden();
  const body = (await readJson(request, 4096)) as { decision?: string; reason?: string } | null;
  if (!body || (body.decision !== "publish" && body.decision !== "reject")) return badRequest('decision must be "publish" or "reject".');
  const sub = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?")
    .bind(params.id ?? "")
    .first<Row & { review: string | null; photo_key: string; photo_sha256: string; photo_type: string; new_lat: number | null; new_lng: number | null; new_address: string | null }>();
  if (!sub) return notFound("Submission not found");
  if (sub.status !== "review") return apiError("bad_request", `Submission is ${sub.status}.`, 409);
  const record = (sub.review ? JSON.parse(sub.review) : { mode: "none", reading: null, dishes: [] }) as ReviewRecord;
  if (body.decision === "publish" && record.dishes.length === 0) return badRequest("No prepared dishes to publish; reject or re-run the review.");
  const reason = (body.reason ?? "").trim().slice(0, 200) || "Vom Team abgelehnt.";
  record.decision =
    body.decision === "publish"
      ? { outcome: "publish", confidence: record.decision?.confidence ?? "medium", reason: null, notes: record.decision?.notes ?? [] }
      : { outcome: "reject", confidence: "high", reason, notes: record.decision?.notes ?? [] };
  await applyOutcome(env.DB, sub, record, "team", Date.now());
  const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(sub.id).first<Row>();
  return json({ submission: view(row!) });
}
