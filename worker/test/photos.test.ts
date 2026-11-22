import { env, exports } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBudgetCache } from "../src/lib/ai-usage";
import {
  deletePhoto,
  guestPhotoKey,
  KV_MAX_VALUE_BYTES,
  kvPhotoStore,
  photoStore,
  PRIVATE_PHOTO_TTL_SECONDS,
  r2PhotoStore,
  storePhoto,
} from "../src/lib/photo-store";
import { dailyWriteLimit, DEFAULT_DAILY_WRITE_LIMIT, releaseWrite, reserveWrite, storageUsage, writesLeft } from "../src/lib/storage-budget";
import { api, ipOf, resetData, seedRestaurant } from "./fixtures";
import { jpegWithExif, upload } from "./community-fixtures";

const ADMIN = { authorization: "Bearer test-admin-token" };
const DAY = new Date().toISOString().slice(0, 10);
const bytes = (...b: number[]) => new Uint8Array(b);

/** Uses up today's soft write budget, as if 900 photos had been stored already. */
async function exhaustBudget() {
  await env.DB.prepare("INSERT INTO storage_ops (day, op, count) VALUES (?, 'write', ?) ON CONFLICT (day, op) DO UPDATE SET count = excluded.count")
    .bind(DAY, dailyWriteLimit(env.PHOTO_DAILY_WRITE_LIMIT))
    .run();
}

async function keysUnder(prefix: string) {
  return (await env.PHOTOS.list({ prefix })).keys;
}

beforeEach(async () => {
  await resetData();
  await env.DB.prepare("DELETE FROM scans").run();
});
afterEach(resetBudgetCache);

describe("photo store (KV)", () => {
  it("round-trips bytes with their content type and deletes them", async () => {
    const store = kvPhotoStore(env.PHOTOS);
    await store.put("photos/t/1", bytes(1, 2, 3), { contentType: "image/webp" });
    expect(await store.get("photos/t/1")).toEqual({ bytes: bytes(1, 2, 3).buffer, contentType: "image/webp" });
    await store.delete("photos/t/1");
    expect(await store.get("photos/t/1")).toBeNull();
    expect(await store.get("photos/t/missing")).toBeNull();
  });

  it("sets a KV expiration for private photos and none for the rest", async () => {
    const store = kvPhotoStore(env.PHOTOS);
    const before = Math.floor(Date.now() / 1000);
    await store.put("photos/ttl/private", bytes(1), { contentType: "image/jpeg", ttlSeconds: PRIVATE_PHOTO_TTL_SECONDS });
    await store.put("photos/ttl/public", bytes(1), { contentType: "image/jpeg" });
    // KV refuses TTLs under 60 s; the store rounds them up instead of failing the upload.
    await store.put("photos/ttl/short", bytes(1), { contentType: "image/jpeg", ttlSeconds: 5 });
    const keys = Object.fromEntries((await keysUnder("photos/ttl/")).map((k) => [k.name.split("/").at(-1), k.expiration ?? null]));
    expect(keys.private).toBeGreaterThanOrEqual(before + PRIVATE_PHOTO_TTL_SECONDS);
    expect(keys.private).toBeLessThanOrEqual(before + PRIVATE_PHOTO_TTL_SECONDS + 5);
    expect(keys.public).toBeNull();
    expect(keys.short).toBeGreaterThanOrEqual(before + 60);
  });

  it("refuses values over KV's 25 MiB limit before calling KV", async () => {
    await expect(kvPhotoStore(env.PHOTOS).put("photos/t/huge", new Uint8Array(KV_MAX_VALUE_BYTES + 1), { contentType: "image/jpeg" })).rejects.toThrow(RangeError);
  });

  it("is null without a PHOTOS binding", () => {
    expect(photoStore({})).toBeNull();
    expect(photoStore(env)?.backend).toBe("kv");
  });

  it("keys guests' photos by device, with anon for no or odd ids", () => {
    expect(guestPhotoKey("dev-1")).toMatch(/^photos\/dev-1\/[0-9a-f-]{36}$/);
    expect(guestPhotoKey(null)).toMatch(/^photos\/anon\/[0-9a-f-]{36}$/);
    expect(guestPhotoKey("../x")).toMatch(/^photos\/anon\//);
    expect(guestPhotoKey("dev-1")).not.toBe(guestPhotoKey("dev-1"));
  });
});

describe("photo store (R2 adapter, for when R2 comes back)", () => {
  it("round-trips, emulates the TTL with customMetadata, and deletes", async () => {
    let now = 1_000_000;
    const store = r2PhotoStore(env.TEST_R2, () => now);
    await store.put("photos/r2/private", bytes(7, 8), { contentType: "image/png", ttlSeconds: 60 });
    await store.put("photos/r2/public", bytes(9), { contentType: "image/webp" });
    expect(await store.get("photos/r2/private")).toEqual({ bytes: bytes(7, 8).buffer, contentType: "image/png" });
    now += 61_000;
    expect(await store.get("photos/r2/private")).toBeNull();
    expect((await store.get("photos/r2/public"))?.contentType).toBe("image/webp");
    await store.delete("photos/r2/public");
    expect(await store.get("photos/r2/public")).toBeNull();
  });
});

describe("daily write budget", () => {
  it("parses the limit with a safe default", () => {
    expect(dailyWriteLimit(undefined)).toBe(DEFAULT_DAILY_WRITE_LIMIT);
    expect(dailyWriteLimit("")).toBe(DEFAULT_DAILY_WRITE_LIMIT);
    expect(dailyWriteLimit("nope")).toBe(DEFAULT_DAILY_WRITE_LIMIT);
    expect(dailyWriteLimit("-1")).toBe(DEFAULT_DAILY_WRITE_LIMIT);
    expect(dailyWriteLimit("1.5")).toBe(DEFAULT_DAILY_WRITE_LIMIT);
    expect(dailyWriteLimit("0")).toBe(0);
    expect(dailyWriteLimit("250")).toBe(250);
  });

  it("hands out writes up to the limit per UTC day, gives them back, and resets the next day", async () => {
    const budget = { DB: env.DB, PHOTO_DAILY_WRITE_LIMIT: "3" };
    const day1 = Date.UTC(2026, 10, 21, 23, 0);
    const day2 = Date.UTC(2026, 10, 22, 0, 30);
    const reserved = await Promise.all([1, 2, 3, 4].map(() => reserveWrite(budget, day1)));
    expect(reserved.filter(Boolean)).toHaveLength(3);
    expect(await writesLeft(budget, day1)).toBe(0);
    await releaseWrite(budget, day1);
    expect(await writesLeft(budget, day1)).toBe(1);
    expect(await reserveWrite(budget, day1)).toBe(true);
    expect(await reserveWrite(budget, day1)).toBe(false);
    expect(await reserveWrite(budget, day2)).toBe(true);
    expect(await writesLeft(budget, day2)).toBe(2);
    expect(await reserveWrite({ DB: env.DB, PHOTO_DAILY_WRITE_LIMIT: "0" }, day2)).toBe(false);
  });

  it("storePhoto writes only within the budget and counts deletes", async () => {
    const tight = { ...env, PHOTO_DAILY_WRITE_LIMIT: "1" };
    expect(await storePhoto(tight, "photos/b/1", bytes(1), { contentType: "image/jpeg" })).toEqual({ ok: true });
    expect(await storePhoto(tight, "photos/b/2", bytes(2), { contentType: "image/jpeg" })).toEqual({ ok: false, reason: "daily_limit" });
    expect((await keysUnder("photos/b/")).map((k) => k.name)).toEqual(["photos/b/1"]);
    expect(await deletePhoto(tight, "photos/b/1")).toBe(true);
    expect(await storageUsage(tight)).toEqual({ day: DAY, writes: 1, deletes: 1, writeLimit: 1 });
    expect(await storePhoto({ DB: env.DB }, "photos/b/3", bytes(3), { contentType: "image/jpeg" })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("gives the reserved write back when KV refuses it", async () => {
    const failing = { put: async () => Promise.reject(new Error("KV put() limit exceeded for the day.")) } as unknown as KVNamespace;
    expect(await storePhoto({ DB: env.DB, PHOTOS: failing }, "photos/b/x", bytes(1), { contentType: "image/jpeg" })).toEqual({ ok: false, reason: "unavailable" });
    expect((await storageUsage(env)).writes).toBe(0);
  });

  it("shows today's usage to the admin only", async () => {
    expect((await api("/api/admin/storage-usage")).status).toBe(403);
    await storePhoto(env, "photos/b/admin", bytes(1), { contentType: "image/jpeg" });
    expect(await api("/api/admin/storage-usage", { headers: ADMIN })).toMatchObject({ status: 200, body: { day: DAY, writes: 1, deletes: 0, writeLimit: 900 } });
  });
});

// ---------------------------------------------------------------------------
// Private camera scan photos
// ---------------------------------------------------------------------------

async function scan(kind: "plate" | "menu", opts: { cookie?: string; ip?: string } = {}) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("photo", new File([jpegWithExif()], "x.jpg", { type: "image/jpeg" }));
  const headers: Record<string, string> = { "cf-connecting-ip": opts.ip ?? ipOf(`scan-${crypto.randomUUID()}`) };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await exports.default.fetch(new Request("https://app.test/api/scans", { method: "POST", body: form, headers }));
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? opts.cookie ?? "";
  return { status: res.status, cookie, device: /^wohin_device=([\w-]+)/.exec(cookie)?.[1] ?? "", body: (await res.json()) as any };
}

async function raw(path: string, init: { cookie?: string; method?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  return exports.default.fetch(new Request(`https://app.test${path}`, { method: init.method ?? "GET", headers }));
}

describe("private scan photos", () => {
  it("keeps a plate photo for 30 days under photos/<device>/ and serves it to that device only", async () => {
    const before = Date.now();
    const res = await scan("plate");
    expect(res.status).toBe(200);
    const { id, photo } = res.body.scan;
    expect(photo.url).toBe(`/api/scans/${id}/photo`);
    const expires = Date.parse(photo.expiresAt);
    expect(expires).toBeGreaterThanOrEqual(before + PRIVATE_PHOTO_TTL_SECONDS * 1000);
    expect(expires).toBeLessThanOrEqual(Date.now() + PRIVATE_PHOTO_TTL_SECONDS * 1000);

    const keys = await keysUnder(`photos/${res.device}/`);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.expiration).toBeGreaterThan(Math.floor(before / 1000) + PRIVATE_PHOTO_TTL_SECONDS - 5);

    const own = await raw(photo.url, { cookie: res.cookie });
    expect(own.status).toBe(200);
    expect(own.headers.get("content-type")).toBe("image/jpeg");
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect(own.headers.get("x-content-type-options")).toBe("nosniff");
    const body = new TextDecoder().decode(await own.arrayBuffer());
    expect(body).toContain("PIXELS");
    expect(body).not.toContain("GPS");

    expect((await raw(photo.url)).status).toBe(404);
    const other = await scan("plate");
    expect((await raw(photo.url, { cookie: other.cookie })).status).toBe(404);
    expect((await raw(photo.url, { cookie: "wohin_device=someone-else-1234" })).status).toBe(404);
    expect((await raw(photo.url, { cookie: `wohin_device=${res.device}` })).status).toBe(404);
    expect((await raw(`/api/scans/${id}`, { method: "DELETE", cookie: `wohin_device=${res.device}` })).status).toBe(404);
    expect((await raw(photo.url, { cookie: `wohin_device=${res.device}.${"A".repeat(43)}` })).status).toBe(404);
  });

  it("deletes the photo alone and keeps the reading", async () => {
    const res = await scan("menu");
    const { id, photo } = res.body.scan;
    expect((await raw(photo.url, { method: "DELETE" })).status).toBe(404);
    const other = await scan("menu");
    expect((await raw(photo.url, { method: "DELETE", cookie: other.cookie })).status).toBe(404);

    expect((await raw(photo.url, { method: "DELETE", cookie: res.cookie })).status).toBe(200);
    expect(await keysUnder(`photos/${res.device}/`)).toEqual([]);
    expect((await raw(photo.url, { cookie: res.cookie })).status).toBe(404);
    expect((await raw(photo.url, { method: "DELETE", cookie: res.cookie })).status).toBe(404);
    const list = await api("/api/scans?kind=menu", { headers: { cookie: res.cookie } });
    expect(list.body.scans).toMatchObject([{ id, photo: null, menu: { dishes: expect.any(Array) } }]);
  });

  it("deletes the photo with the scan", async () => {
    const res = await scan("plate");
    expect(await keysUnder(`photos/${res.device}/`)).toHaveLength(1);
    expect((await raw(`/api/scans/${res.body.scan.id}`, { method: "DELETE", cookie: res.cookie })).status).toBe(200);
    expect(await keysUnder(`photos/${res.device}/`)).toEqual([]);
    expect((await raw(res.body.scan.photo.url, { cookie: res.cookie })).status).toBe(404);
  });

  it("treats an expired photo as gone", async () => {
    const res = await scan("menu");
    await env.DB.prepare("UPDATE scans SET photo_expires_at = ? WHERE id = ?").bind(Date.now() - 1, res.body.scan.id).run();
    expect((await raw(res.body.scan.photo.url, { cookie: res.cookie })).status).toBe(404);
    const list = await api("/api/scans?kind=menu", { headers: { cookie: res.cookie } });
    expect(list.body.scans[0].photo).toBeNull();
  });

  it("still reads the photo past the daily write budget, without keeping it", async () => {
    await exhaustBudget();
    const res = await scan("plate");
    expect(res.status).toBe(200);
    expect(res.body.scan).toMatchObject({ kind: "plate", photo: null });
    expect(await keysUnder(`photos/${res.device}/`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Community menu photos
// ---------------------------------------------------------------------------

async function settled(id: string) {
  for (let i = 0; i < 50; i++) {
    const res = await api(`/api/submissions/${id}`);
    if (res.body.submission.status !== "pending") return res.body.submission;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("review did not finish");
}

describe("community menu photos", () => {
  it("serves a published photo to everyone with cache headers and expires it within twelve months", async () => {
    const r = await seedRestaurant({ name: "Hähnchen-Bowl Haus" });
    const before = Math.floor(Date.now() / 1000);
    const res = await upload({ restaurantId: r.id }, { ip: ipOf("photo-public") });
    const id = res.body.submission.id;
    expect(await settled(id)).toMatchObject({ status: "published" });
    const device = /^wohin_device=([0-9a-f-]{36})\./.exec(res.headers.get("set-cookie")!)![1];
    const keys = await keysUnder(`photos/${device}/`);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.expiration).toBeGreaterThanOrEqual(before + 31_536_000);
    expect(keys[0]!.expiration).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000) + 31_536_000);

    const photo = await raw(`/api/submissions/${id}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(photo.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(new TextDecoder().decode(await photo.arrayBuffer())).not.toContain("GPS");

    await env.DB.prepare("UPDATE submissions SET status = 'rejected' WHERE id = ?").bind(id).run();
    expect((await raw(`/api/submissions/${id}/photo`)).status).toBe(404);
  });

  it("shows a photo under review only to the guest's own device and the team", async () => {
    // A new restaurant always goes to the team queue.
    const res = await upload({ newRestaurant: { name: "Neue Bowl Bar", lat: 52.5246, lng: 13.4027 } }, { ip: ipOf("photo-review") });
    const id = res.body.submission.id;
    expect(await settled(id)).toMatchObject({ status: "review" });
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;

    expect((await raw(`/api/submissions/${id}/photo`)).status).toBe(404);
    expect((await raw(`/api/submissions/${id}/photo`, { cookie: "wohin_device=someone-else-1234" })).status).toBe(404);
    const own = await raw(`/api/submissions/${id}/photo`, { cookie });
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect((await raw(`/api/admin/submissions/${id}/photo`, { headers: ADMIN })).status).toBe(200);
    expect((await raw("/api/submissions/nope/photo")).status).toBe(404);
  });

  it("pauses uploads with a clear code once the daily write budget is used up", async () => {
    await exhaustBudget();
    expect((await api("/api/submissions/config")).body).toMatchObject({ uploadsEnabled: false, uploadsPaused: "daily_limit" });
    const r = await seedRestaurant();
    expect(await upload({ restaurantId: r.id }, { ip: ipOf("photo-limit") })).toMatchObject({ status: 503, body: { error: { code: "storage_limit" } } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions").first("n")).toBe(0);
  });
});
