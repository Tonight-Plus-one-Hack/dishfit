import { budgetExhausted, costMicros, dailyBudgetUsd, recordUsage, startOfUtcDay, type UsageRecord } from "../lib/ai-usage";
import { apiError, badRequest, json, notFound, type RouteContext } from "../lib/http";
import { ipHash } from "../lib/ip";
import { checkPhotoUpload, readPhotoForm, readUploadedPhoto } from "../community/upload";
import { NotRecognizedError, readScan, scanModel, type ScanEnv, type ScanKind, type ScanReading } from "../scans/estimate";
import { ModelError, type ModelUsage } from "../community/model";
import { DEVICE_COOKIE, deviceSecret, newDeviceCookieHeader, readDevice, readDeviceCookie } from "../lib/device";
import { deletePhoto, guestPhotoKey, photoResponse, photoStore, PRIVATE_PHOTO_TTL_SECONDS, storePhoto } from "../lib/photo-store";

/**
 * Private camera scans: POST a menu or plate photo, get the AI reading back with ranges.
 * Rows belong to the device cookie the community upload (PR #33) also sets. The photo of a successful
 * scan is kept privately for 30 days (photos/<device>/<uuid> in the photo store, KV expirationTtl) and
 * only that device can load or delete it; past the daily write budget the scan still works without it.
 * Sharing a menu with the community goes through POST /api/submissions.
 */

/** Per device cookie and per hashed IP, counted over every attempt (also failed ones). */
export const SCAN_LIMITS = { perHour: 6, perDay: 20 } as const;
/** Scans stop for the day once their own spend reaches this (env SCAN_DAILY_BUDGET_USD); the global AI budget applies too. */
export const DEFAULT_SCAN_DAILY_BUDGET_USD = 1;
/** The device cookie is shared with the community profile (lib/device.ts): signed, or a legacy unsigned id. */
export { DEVICE_COOKIE };
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCAN_UNAVAILABLE = "Der Foto-Scan ist gerade nicht verfügbar. Versuch es später noch einmal.";

type Env2 = Env & ScanEnv & { SCAN_DAILY_BUDGET_USD?: string };

/** The private photo of a scan: its URL (this device only) and when it deletes itself. */
export type ScanPhoto = { url: string; expiresAt: string };

export type ScanView = { id: string; kind: ScanKind; createdAt: string; mode: string; costUsd: number; photo: ScanPhoto | null } & ScanReading;

type Row = {
  id: string;
  kind: ScanKind;
  mode: string;
  result: string;
  cost_micros: number;
  created_at: number;
  photo_key: string | null;
  photo_expires_at: number | null;
};

const hasPhoto = (r: Pick<Row, "photo_key" | "photo_expires_at">, now: number) => r.photo_key !== null && (r.photo_expires_at ?? 0) > now;

const view = (r: Row, now = Date.now()): ScanView => ({
  id: r.id,
  createdAt: new Date(r.created_at).toISOString(),
  mode: r.mode,
  costUsd: r.cost_micros / 1e6,
  photo: hasPhoto(r, now) ? { url: `/api/scans/${r.id}/photo`, expiresAt: new Date(r.photo_expires_at!).toISOString() } : null,
  ...(JSON.parse(r.result) as ScanReading),
});

async function overLimit(db: D1Database, column: "ip_hash" | "device_id", value: string | null, now: number): Promise<boolean> {
  if (!value) return false;
  const row = await db
    .prepare(`SELECT sum(created_at >= ?) AS hour, count(*) AS day FROM scans WHERE ${column} = ? AND created_at >= ?`)
    .bind(now - HOUR_MS, value, now - DAY_MS)
    .first<{ hour: number | null; day: number }>();
  return (row?.hour ?? 0) >= SCAN_LIMITS.perHour || (row?.day ?? 0) >= SCAN_LIMITS.perDay;
}

export function scanBudgetUsd(value: string | undefined): number {
  const parsed = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SCAN_DAILY_BUDGET_USD;
}

async function scanBudgetSpent(env: Env2, now: number): Promise<boolean> {
  const budget = scanBudgetUsd(env.SCAN_DAILY_BUDGET_USD);
  if (budget <= 0) return true;
  const row = await env.DB.prepare("SELECT coalesce(sum(cost_micros), 0) AS micros FROM scans WHERE created_at >= ?")
    .bind(startOfUtcDay(now))
    .first<{ micros: number }>();
  if ((row?.micros ?? 0) / 1e6 >= budget) return true;
  return budgetExhausted(env.DB, dailyBudgetUsd(env.AI_DAILY_BUDGET_USD), now);
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** POST /api/scans (multipart: kind=menu|plate, photo): the AI reading of one photo. */
export async function postScan({ request, env: rawEnv, url }: RouteContext): Promise<Response> {
  const env: Env2 = rawEnv;
  const now = Date.now();
  const invalidUpload = checkPhotoUpload(request);
  if (invalidUpload) return invalidUpload;

  const identity = await readDeviceCookie(request, env);
  const existingDevice = identity?.id ?? null;
  const deviceId = existingDevice ?? crypto.randomUUID();
  const setCookie: Record<string, string> = existingDevice ? {} : { "set-cookie": await newDeviceCookieHeader(env, deviceId, url) };
  const signedDevice = identity ? identity.signed : Boolean(deviceSecret(env));
  let hash: string | null = null;
  try {
    hash = await ipHash(env.DB, request, now);
  } catch {
    hash = null;
  }
  if ((await overLimit(env.DB, "ip_hash", hash, now)) || (await overLimit(env.DB, "device_id", existingDevice, now))) {
    return json({ error: { code: "rate_limited", message: "Zu viele Scans, versuch es später noch einmal." } }, 429, setCookie);
  }

  const form = await readPhotoForm(request);
  if (form instanceof Response) return form;
  const kind = form.get("kind");
  if (kind !== "menu" && kind !== "plate") return badRequest('kind must be "menu" or "plate".');
  const photo = await readUploadedPhoto(form);
  if (photo instanceof Response) return photo;
  const { bytes, type } = photo;

  const model = scanModel(env);
  if (!model) return json({ error: { code: "unavailable", message: SCAN_UNAVAILABLE } }, 503, setCookie);
  if (model.provider !== "mock" && (await scanBudgetSpent(env, now))) {
    return json({ error: { code: "unavailable", message: "Das Tageslimit für KI-Scans ist erreicht. Morgen geht es weiter." } }, 503, setCookie);
  }

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO scans (id, kind, status, device_id, ip_hash, mode, created_at) VALUES (?, ?, 'pending', ?, ?, ?, ?)")
    .bind(id, kind, deviceId, hash, model.provider, now)
    .run();

  const ledger = async (usage: ModelUsage | null): Promise<number> => {
    if (!usage || model.provider === "mock") return 0;
    const record: UsageRecord = { purpose: `scan_${kind}`, provider: model.provider, ...usage };
    await recordUsage(env.DB, [record], now);
    return costMicros(record) ?? 0;
  };

  try {
    const { reading, usage } = await readScan(model, kind, { mediaType: type, base64: base64(bytes) });
    const micros = await ledger(usage);
    await env.DB.prepare("UPDATE scans SET status = 'done', result = ?, cost_micros = ? WHERE id = ?").bind(JSON.stringify(reading), micros, id).run();
    if (signedDevice) await keepPhoto(env, id, deviceId, bytes, type);
    const row = await env.DB.prepare("SELECT * FROM scans WHERE id = ?").bind(id).first<Row>();
    return json({ scan: view(row!) }, 200, setCookie);
  } catch (error) {
    const usage = error instanceof NotRecognizedError || error instanceof ModelError ? error.usage : null;
    const micros = await ledger(usage);
    const notRecognized = error instanceof NotRecognizedError;
    const message = notRecognized ? error.message : SCAN_UNAVAILABLE;
    await env.DB.prepare("UPDATE scans SET status = 'failed', error = ?, cost_micros = ? WHERE id = ?").bind(message, micros, id).run();
    if (!notRecognized) console.warn("[scans] failed", model.provider, error instanceof ModelError ? error.message : "request failed");
    return json({ error: { code: notRecognized ? "bad_request" : "unavailable", message } }, notRecognized ? 422 : 503, setCookie);
  }
}

/** Keeps the photo of a successful scan for 30 days; skipped without a store or past the daily write budget. */
async function keepPhoto(env: Env2, scanId: string, deviceId: string, bytes: Uint8Array, type: string): Promise<void> {
  const now = Date.now();
  const key = guestPhotoKey(deviceId);
  try {
    const stored = await storePhoto(env, key, bytes, { contentType: type, ttlSeconds: PRIVATE_PHOTO_TTL_SECONDS }, now);
    if (!stored.ok) return;
    const saved = await env.DB.prepare("UPDATE scans SET photo_key = ?, photo_type = ?, photo_expires_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(key, type, now + PRIVATE_PHOTO_TTL_SECONDS * 1000, scanId)
      .run()
      .catch(async (error: unknown) => {
        await deletePhoto(env, key);
        throw error;
      });
    if (!saved.meta.changes) await deletePhoto(env, key);
  } catch (error) {
    console.warn("[scans] photo could not be attached", error instanceof Error ? error.message : "error");
  }
}

/** GET /api/scans?kind=menu: this device's saved scans, newest first. */
export async function listScans({ request, env, url }: RouteContext): Promise<Response> {
  const device = await readDeviceCookie(request, env);
  if (!device) return json({ scans: [] }, 200, { "cache-control": "private, no-store" });
  const kind = url.searchParams.get("kind");
  if (kind !== null && kind !== "menu" && kind !== "plate") return badRequest('kind must be "menu" or "plate".');
  const { results } = await env.DB.prepare(
    `SELECT * FROM scans WHERE device_id = ?1 AND status = 'done' AND deleted_at IS NULL
      AND (?2 IS NULL OR kind = ?2) AND (?3 OR photo_key IS NULL) ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(device.id, kind, Number(device.signed))
    .all<Row>();
  const now = Date.now();
  return json({ scans: results.map((r) => view(r, now)) }, 200, { "cache-control": "private, no-store" });
}

const deleteUnavailable = () => apiError("unavailable", "Das Foto konnte gerade nicht gelöscht werden. Versuch es noch einmal.", 503);

/** DELETE /api/scans/:id: forget one scan of this device, its photo included. */
export async function deleteScan({ request, env, params }: RouteContext): Promise<Response> {
  const device = await readDeviceCookie(request, env);
  const id = params.id ?? "";
  const now = Date.now();
  const row = device
    ? await env.DB.prepare("SELECT photo_key, photo_expires_at FROM scans WHERE id = ? AND device_id = ? AND deleted_at IS NULL")
        .bind(id, device.id).first<Pick<Row, "photo_key" | "photo_expires_at">>()
    : null;
  if (!device || !row || (row.photo_key && !device.signed)) return notFound("Scan not found");
  if (row.photo_key && hasPhoto(row, now) && !(await deletePhoto(env, row.photo_key, now))) return deleteUnavailable();
  await env.DB.prepare("UPDATE scans SET deleted_at = ?, result = NULL, photo_key = NULL, photo_type = NULL, photo_expires_at = NULL WHERE id = ?").bind(now, id).run();
  return json({ ok: true });
}

/** The scan's photo row for its own device: null for another device, a deleted scan, or no live photo. */
async function ownPhoto(request: Request, env: Env, id: string, now: number): Promise<{ photo_key: string; photo_type: string; photo_expires_at: number } | null> {
  const device = await readDevice(request, env);
  if (!device) return null;
  const row = await env.DB.prepare("SELECT photo_key, photo_type, photo_expires_at FROM scans WHERE id = ? AND device_id = ? AND deleted_at IS NULL")
    .bind(id, device)
    .first<{ photo_key: string | null; photo_type: string | null; photo_expires_at: number | null }>();
  return row && hasPhoto(row, now) ? (row as { photo_key: string; photo_type: string; photo_expires_at: number }) : null;
}

/** GET /api/scans/:id/photo: the scan's private photo, only for the device that took it. */
export async function scanPhoto({ request, env, params }: RouteContext): Promise<Response> {
  const row = await ownPhoto(request, env, params.id ?? "", Date.now());
  const object = row ? await photoStore(env)?.get(row.photo_key) : null;
  if (!row || !object) return notFound("Photo not found");
  return photoResponse(object.bytes, row.photo_type, "private, no-store");
}

/** DELETE /api/scans/:id/photo: deletes the photo now and keeps the reading. */
export async function deleteScanPhoto({ request, env, params }: RouteContext): Promise<Response> {
  const id = params.id ?? "";
  const row = await ownPhoto(request, env, id, Date.now());
  if (!row) return notFound("Photo not found");
  if (!(await deletePhoto(env, row.photo_key))) return deleteUnavailable();
  await env.DB.prepare("UPDATE scans SET photo_key = NULL, photo_type = NULL, photo_expires_at = NULL WHERE id = ? AND photo_key = ?").bind(id, row.photo_key).run();
  return json({ ok: true });
}
