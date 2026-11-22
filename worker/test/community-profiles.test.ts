import { env } from "cloudflare:workers";
import { KIEZE } from "@wohin/contract";
import { beforeEach, describe, expect, it } from "vitest";
import { readDevice, signDevice } from "../src/lib/device";
import { defaultNickname, PROFILE_LIMITS } from "../src/community/profiles";
import { CONFIRM_LIMITS } from "../src/routes/community";
import { api, ipOf, resetData, seedRestaurant } from "./fixtures";
import { upload } from "./community-fixtures";

const ADMIN = { authorization: "Bearer test-admin-token" };

beforeEach(resetData);

const cookieOf = (res: { headers: Headers }) => res.headers.get("set-cookie")!.split(";")[0]!;

/** The review runs in waitUntil; poll the public status like the app does. */
async function settled(id: string) {
  for (let i = 0; i < 50; i++) {
    const res = await api(`/api/submissions/${id}`);
    if (res.body.submission.status !== "pending") return res.body.submission;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("review did not finish");
}

const vote = (dishId: string, body: object, init: { cookie?: string; ip?: string } = {}) =>
  api(`/api/dishes/${dishId}/confirmations`, { method: "POST", body, ip: init.ip, headers: init.cookie ? { cookie: init.cookie } : {} });

const read = (cookie: string) => readDevice(new Request("https://app.test/api/me", { headers: { cookie } }), env);

describe("signed device cookie", () => {
  it("accepts only ids signed with the secret", async () => {
    const value = await signDevice("wohin-dev-device-cookie-secret", "abcdef12-3456");
    expect(await read(`wohin_device=${value}`)).toBe("abcdef12-3456");
    expect(await read(`other=1; wohin_device=${value}`)).toBe("abcdef12-3456");
    expect(await read(`wohin_device=${value.replace("abcdef12", "abcdef13")}`)).toBeNull();
    expect(await read("wohin_device=abcdef12-3456")).toBeNull();
    expect(await readDevice(new Request("https://app.test/api/me", { headers: { cookie: `wohin_device=${value}` } }), { APP_ENV: "production" })).toBeNull();
  });
});

describe("community profile", () => {
  it("answers a guest profile without writing, and a scan creates the profile with a signed cookie and the first-scan badge", async () => {
    const guest = await api("/api/me");
    expect(guest.body).toMatchObject({ profile: null, badges: [], stats: { scans: 0 } });
    expect(guest.headers.get("set-cookie")).toBeNull();
    expect(await env.DB.prepare("SELECT count(*) AS n FROM profiles").first("n")).toBe(0);

    const r = await seedRestaurant({ name: "Bowl Haus", kiez: "kreuzberg" });
    const res = await upload({ restaurantId: r.id }, { ip: ipOf("profile-scan") });
    expect(res.status).toBe(202);
    expect(res.headers.get("set-cookie")).toMatch(/^wohin_device=[0-9a-f-]{36}\.[\w-]{43}; Path=\/api; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure$/);
    expect(res.body.newBadges).toEqual([{ key: "first_scan", title: "Erster Scan", text: expect.any(String) }]);
    const cookie = cookieOf(res);
    await settled(res.body.submission.id);

    const me = await api("/api/me", { headers: { cookie } });
    expect(me.body.profile).toMatchObject({ nickname: defaultNickname(me.body.profile.id), nicknameCustom: false, account: null });
    expect(me.body.stats).toEqual({ scans: 1, publishedScans: 1, restaurantsAdded: 0, dishesOnline: 4, confirmations: 0 });
    expect(me.body.scans).toMatchObject([{ status: "published", kiez: "kreuzberg", restaurant: { id: r.id, name: "Bowl Haus" }, dishCount: 4 }]);
    expect(me.body.badges).toMatchObject([{ key: "first_scan", seen: false }]);
    expect(me.body.lockedBadges.map((b: { key: string }) => b.key)).toEqual(["first_restaurant", "ten_confirmations"]);

    expect((await api("/api/me/badges/seen", { method: "POST", body: { badges: ["first_scan", "bogus"] }, headers: { cookie } })).status).toBe(200);
    expect((await api("/api/me", { headers: { cookie } })).body.badges).toMatchObject([{ key: "first_scan", seen: true }]);
  });

  it("awards first_restaurant for a new place and keeps the Kiez of the pin", async () => {
    const res = await upload({ newRestaurant: { name: "Neue Bowl Bar", lat: 52.5246, lng: 13.4027 } }, { ip: ipOf("new-place") });
    expect(res.body.newBadges.map((b: { key: string }) => b.key).toSorted()).toEqual(["first_restaurant", "first_scan"]);
    await settled(res.body.submission.id);
    expect(await env.DB.prepare("SELECT kiez FROM submissions").first("kiez")).toBe("mitte");
  });

  it("uses the app's Kiez hint only for restaurants D1 does not know", async () => {
    const known = await seedRestaurant({ kiez: "moabit" });
    for (const fields of [
      { restaurantId: "seed-only", restaurantName: "Nur im Seed", kiez: "wedding" },
      { restaurantId: "seed-other", restaurantName: "Ohne Hinweis", kiez: "hamburg" },
      { restaurantId: known.id, kiez: "wedding" },
    ]) {
      await settled((await upload(fields, { ip: ipOf("hint") })).body.submission.id);
    }
    const { results } = await env.DB.prepare("SELECT restaurant_name, kiez FROM submissions ORDER BY created_at").all();
    expect(results.map((r) => r.kiez)).toEqual(["wedding", null, "moabit"]);
  });

  it("changes the nickname with validation, word filter and a cooldown", async () => {
    const created = await api("/api/me", { method: "PATCH", body: { nickname: "  Kiez   Scout " }, ip: ipOf("nick") });
    expect(created).toMatchObject({ status: 200, body: { nickname: "Kiez Scout", nicknameCustom: true } });
    const cookie = cookieOf(created);
    expect((await api("/api/me", { headers: { cookie } })).body.profile.nickname).toBe("Kiez Scout");
    expect((await api("/api/me", { method: "PATCH", body: { nickname: "Neuer Name" }, headers: { cookie } })).status).toBe(429);

    expect((await api("/api/me", { method: "PATCH", body: { nickname: "x" }, ip: ipOf("nick2") })).status).toBe(400);
    expect((await api("/api/me", { method: "PATCH", body: { nickname: "<script>" }, ip: ipOf("nick2") })).status).toBe(400);
    expect((await api("/api/me", { method: "PATCH", body: { nickname: "Fotze 1" }, ip: ipOf("nick2") })).status).toBe(422);
  });

  it("keeps a legacy unsigned device id (camera scans) and signs it, but never for an id that already has a profile", async () => {
    const legacy = await vote("d-legacy", { verdict: "yes" }, { cookie: "wohin_device=legacy-device-1234", ip: ipOf("legacy") });
    expect(legacy.headers.get("set-cookie")).toMatch(/^wohin_device=legacy-device-1234\.[\w-]{43};/);
    expect(await read(cookieOf(legacy))).toBe("legacy-device-1234");
    expect((await api("/api/me", { headers: { cookie: cookieOf(legacy) } })).body.stats.confirmations).toBe(1);

    const hijack = await vote("d-legacy-2", { verdict: "yes" }, { cookie: "wohin_device=legacy-device-1234", ip: ipOf("legacy") });
    expect(cookieOf(hijack)).not.toContain("legacy-device-1234");
  });

  it("caps new profiles per network", async () => {
    for (let i = 0; i < PROFILE_LIMITS.newPerIpPerDay; i++) expect((await vote(`d-${i}`, { verdict: "yes" }, { ip: ipOf("farm") })).status).toBe(200);
    expect(await vote("d-x", { verdict: "yes" }, { ip: ipOf("farm") })).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
  });
});

describe("Hat das gestimmt?", () => {
  it("counts one changeable verdict per profile and shows the caller's own", async () => {
    const a = await vote("dish-1", { verdict: "yes", dishName: "Hähnchen-Bowl", restaurantId: "r-1" }, { ip: ipOf("voter-a") });
    expect(a.body).toMatchObject({ dishId: "dish-1", yes: 1, no: 0, mine: { verdict: "yes", correction: null }, newBadges: [] });
    const cookieA = cookieOf(a);
    const b = await vote("dish-1", { verdict: "no", correction: "Kostet jetzt 12,90 €" }, { ip: ipOf("voter-b") });
    expect(b.body).toMatchObject({ yes: 1, no: 1, mine: { verdict: "no", correction: "Kostet jetzt 12,90 €" } });

    // Changing the vote does not double count.
    expect((await vote("dish-1", { verdict: "no", correction: "Ohne Reis" }, { cookie: cookieA })).body).toMatchObject({ yes: 0, no: 2 });
    expect((await api("/api/dishes/dish-1/confirmations", { headers: { cookie: cookieA } })).body).toMatchObject({ yes: 0, no: 2, mine: { verdict: "no", correction: "Ohne Reis" } });
    expect((await api("/api/dishes/dish-1/confirmations")).body).toMatchObject({ yes: 0, no: 2, mine: null });

    const me = await api("/api/me", { headers: { cookie: cookieA } });
    expect(me.body.confirmations).toMatchObject([{ dishId: "dish-1", dishName: "Hähnchen-Bowl", restaurantId: "r-1", verdict: "no", correction: "Ohne Reis" }]);

    const corrections = await api("/api/admin/confirmations?verdict=no", { headers: ADMIN });
    expect(corrections.body.items).toHaveLength(2);
    expect(corrections.body.items[0]).toMatchObject({ dishId: "dish-1", no: 2, yes: 0 });
    expect((await api("/api/admin/confirmations")).status).toBe(403);
  });

  it("validates the verdict, the dish id and the correction text", async () => {
    expect((await vote("dish-1", { verdict: "maybe" })).status).toBe(400);
    expect((await vote("dish 1", { verdict: "yes" })).status).toBe(400);
    expect((await vote("dish-1", { verdict: "no", correction: "du Wichser" })).status).toBe(422);
    // A correction on a yes is dropped.
    expect((await vote("dish-1", { verdict: "yes", correction: "egal" }, { ip: ipOf("drop") })).body.mine).toEqual({ verdict: "yes", correction: null });
  });

  it("awards the ten-confirmations badge once and limits votes per profile", async () => {
    const first = await vote("v-0", { verdict: "yes" }, { ip: ipOf("power") });
    const cookie = cookieOf(first);
    let badges: string[] = [];
    for (let i = 1; i < 10; i++) badges = (await vote(`v-${i}`, { verdict: "yes" }, { cookie, ip: ipOf("power") })).body.newBadges.map((b: { key: string }) => b.key);
    expect(badges).toEqual(["ten_confirmations"]);
    expect((await vote("v-10", { verdict: "yes" }, { cookie, ip: ipOf("power") })).body.newBadges).toEqual([]);

    await env.DB.prepare("UPDATE dish_confirmations SET updated_at = ?").bind(Date.now()).run();
    for (let i = 11; i < CONFIRM_LIMITS.perProfilePerDay; i++) await vote(`v-${i}`, { verdict: "yes" }, { cookie, ip: ipOf("power") });
    expect((await vote("v-last", { verdict: "yes" }, { cookie, ip: ipOf("power") })).status).toBe(429);
  });
});

async function scanner(name: string, scans: number, kiez: string, ageDays = 0) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare("INSERT INTO profiles (id, nickname, created_at, last_seen_at) VALUES (?, ?, ?, ?)").bind(id, name, now, now).run();
  for (let i = 0; i < scans; i++) {
    await env.DB.prepare(
      `INSERT INTO submissions (id, status, restaurant_name, photo_key, photo_sha256, photo_type, photo_bytes, device_id, kiez, dish_count, created_at)
       VALUES (?, 'published', 'X', 'k', ?, 'image/jpeg', 1, ?, ?, 3, ?)`,
    )
      .bind(crypto.randomUUID(), crypto.randomUUID(), id, kiez, now - ageDays * 86_400_000 - i)
      .run();
  }
  return id;
}

describe("Kiez leaderboard", () => {
  it("ranks published scans per Kiez for the week and all time", async () => {
    await scanner("Alte Linse", 5, "mitte", 10);
    await scanner("Neue Bohne", 2, "mitte");
    await scanner("Kreuzberg Kid", 3, "kreuzberg");
    await env.DB.prepare(
      `INSERT INTO submissions (id, status, restaurant_name, photo_key, photo_sha256, photo_type, photo_bytes, device_id, kiez, created_at)
       SELECT 'rej', 'rejected', 'X', 'k', 'h', 'image/jpeg', 1, id, 'mitte', ? FROM profiles WHERE nickname = 'Kreuzberg Kid'`,
    )
      .bind(Date.now())
      .run();

    const week = await api("/api/leaderboard?kiez=mitte&period=week");
    expect(week.body.entries).toEqual([{ rank: 1, nickname: "Neue Bohne", scans: 2, dishes: 6, isMe: false }]);
    const all = await api("/api/leaderboard?kiez=mitte&period=all");
    expect(all.body.entries.map((e: { nickname: string }) => e.nickname)).toEqual(["Alte Linse", "Neue Bohne"]);
    const berlin = await api("/api/leaderboard?period=all");
    expect(berlin.body.entries.map((e: { scans: number }) => e.scans)).toEqual([5, 3, 2]);
    expect(berlin.body.kieze).toEqual(KIEZE.map((k) => ({ slug: k.slug, name: k.name })));

    expect((await api("/api/leaderboard?kiez=hamburg")).status).toBe(400);
    expect((await api("/api/leaderboard?period=year")).status).toBe(400);
  });

  it("marks the caller and reports their count when they are not ranked", async () => {
    const r = await seedRestaurant({ kiez: "neukoelln" });
    const res = await upload({ restaurantId: r.id }, { ip: ipOf("ranked") });
    await settled(res.body.submission.id);
    const cookie = cookieOf(res);
    const board = await api("/api/leaderboard?kiez=neukoelln", { headers: { cookie } });
    expect(board.body.entries).toMatchObject([{ rank: 1, scans: 1, isMe: true }]);
    expect(board.body.me).toBeNull();
    expect((await api("/api/leaderboard?kiez=mitte", { headers: { cookie } })).body.me).toEqual({ rank: null, scans: 0 });
  });
});
