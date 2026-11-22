/**
 * Photo storage behind one small interface, so the backend can change without touching the routes.
 * Production stores photos in Workers KV (binding PHOTOS), which the Workers Free plan includes; an R2
 * bucket fits the same interface (r2PhotoStore) for when R2 is enabled on the account.
 *
 * Keys:
 *   photos/<deviceId>/<uuid>          expiring private camera scans and community menu photos
 *   ai/<file>                         KI-Bild files (optional; the web app bundles its own copies)
 *   share-cards/<version>-<format>    share cards drawn on request (Workers Paid only, SHARE_CARD_RENDER=on-request)
 *
 * Every write goes through storePhoto(), which reserves one write of the daily budget first
 * (lib/storage-budget.ts). Reads and deletes are not guarded.
 */
import { PHOTO_TYPES } from "../community/image";
import { countDelete, releaseWrite, reserveWrite, type StorageBudgetEnv } from "./storage-budget";

export type PhotoMetadata = { contentType: string };

export type StoredPhoto = { bytes: ArrayBuffer; contentType: string };

export interface PhotoStore {
  readonly backend: "kv" | "r2";
  /** ttlSeconds: delete automatically after this long (KV expirationTtl, at least 60 s); none keeps it until deleted. */
  put(key: string, bytes: Uint8Array, options: { contentType: string; ttlSeconds?: number }): Promise<void>;
  get(key: string): Promise<StoredPhoto | null>;
  delete(key: string): Promise<void>;
}

/** KV's largest value is 25 MiB; uploads stop at 5 MB long before (community/image.ts MAX_PHOTO_BYTES). */
export const KV_MAX_VALUE_BYTES = 25 * 1024 * 1024;
/** KV refuses expirationTtl below 60 seconds. */
export const KV_MIN_TTL_SECONDS = 60;
/** Private photos (camera scans) delete themselves after 30 days. */
export const PRIVATE_PHOTO_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Use the shortest KV cache TTL so a cached miss after an upload expires promptly. */
const KV_READ_CACHE_TTL_SECONDS = 30;

export function kvPhotoStore(kv: KVNamespace): PhotoStore {
  return {
    backend: "kv",
    async put(key, bytes, { contentType, ttlSeconds }) {
      if (bytes.byteLength > KV_MAX_VALUE_BYTES) throw new RangeError(`Photo of ${bytes.byteLength} bytes exceeds the KV value limit.`);
      const metadata: PhotoMetadata = { contentType };
      await kv.put(key, bytes, {
        metadata,
        ...(ttlSeconds === undefined ? {} : { expirationTtl: Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlSeconds)) }),
      });
    },
    async get(key) {
      const { value, metadata } = await kv.getWithMetadata<PhotoMetadata>(key, { type: "arrayBuffer", cacheTtl: KV_READ_CACHE_TTL_SECONDS });
      if (!value) return null;
      return { bytes: value, contentType: metadata?.contentType ?? "application/octet-stream" };
    },
    async delete(key) {
      await kv.delete(key);
    },
  };
}

/** R2 has no per-object TTL: the expiry is kept in customMetadata and an expired object reads as missing. */
export function r2PhotoStore(bucket: R2Bucket, now: () => number = Date.now): PhotoStore {
  return {
    backend: "r2",
    async put(key, bytes, { contentType, ttlSeconds }) {
      const customMetadata: Record<string, string> = ttlSeconds === undefined ? {} : { expiresAt: String(now() + ttlSeconds * 1000) };
      await bucket.put(key, bytes, { httpMetadata: { contentType }, customMetadata });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      const expiresAt = Number(object.customMetadata?.expiresAt ?? Number.NaN);
      if (Number.isFinite(expiresAt) && expiresAt <= now()) return null;
      return { bytes: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? "application/octet-stream" };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}

export type PhotoEnv = { PHOTOS?: KVNamespace };

/** The photo store of this deploy, or null when it has no PHOTOS binding (routes answer a clear state then). */
export function photoStore(env: PhotoEnv): PhotoStore | null {
  return env.PHOTOS ? kvPhotoStore(env.PHOTOS) : null;
}

/** A photo key for a guest's photo: photos/<deviceId>/<uuid>; "anon" when there is no device profile. */
export function guestPhotoKey(deviceId: string | null): string {
  const owner = deviceId && /^[A-Za-z0-9-]{1,64}$/.test(deviceId) ? deviceId : "anon";
  return `photos/${owner}/${crypto.randomUUID()}`;
}

export type StoreResult = { ok: true } | { ok: false; reason: "unavailable" | "daily_limit" };

/**
 * Writes a photo within the daily write budget: reserves one write first and gives it back when the
 * write fails. "daily_limit" means the soft guard said no; "unavailable" that there is no store or KV refused.
 */
export async function storePhoto(
  env: PhotoEnv & StorageBudgetEnv,
  key: string,
  bytes: Uint8Array,
  options: { contentType: string; ttlSeconds?: number },
  now = Date.now(),
): Promise<StoreResult> {
  const store = photoStore(env);
  if (!store) return { ok: false, reason: "unavailable" };
  if (!(await reserveWrite(env, now))) return { ok: false, reason: "daily_limit" };
  try {
    await store.put(key, bytes, options);
    return { ok: true };
  } catch (error) {
    // KV answers an error once the account's real daily limit is used up; keep the counter honest.
    await releaseWrite(env, now).catch(() => undefined);
    console.warn("[photos] put failed", error instanceof Error ? error.message : "error");
    return { ok: false, reason: "unavailable" };
  }
}

/** Deletes a photo and reports storage failures so callers can keep the reference for a retry. */
export async function deletePhoto(env: PhotoEnv & StorageBudgetEnv, key: string, now = Date.now()): Promise<boolean> {
  const store = photoStore(env);
  if (!store) return false;
  try {
    await store.delete(key);
    await countDelete(env, now).catch(() => undefined);
    return true;
  } catch (error) {
    console.warn("[photos] delete failed", error instanceof Error ? error.message : "error");
    return false;
  }
}

/** A photo response that cannot be sniffed into anything else: only the three photo types keep their type. */
export function photoResponse(bytes: ArrayBuffer, contentType: string, cacheControl: string): Response {
  const type = (PHOTO_TYPES as readonly string[]).includes(contentType) ? contentType : "application/octet-stream";
  return new Response(bytes, { headers: { "content-type": type, "cache-control": cacheControl, "x-content-type-options": "nosniff" } });
}
