import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postEvents as ingestEvents } from "../src/routes/events";
import { resetNumbersCache } from "../src/routes/numbers";
import { recordUsage, resetBudgetCache } from "../src/lib/ai-usage";
import { IP_LIMITS_PER_MINUTE } from "../src/lib/rate-limit";
import { kvPhotoStore } from "../src/lib/photo-store";
import { api, ipOf, RARELY_OPEN, resetData, seedDish, seedRestaurant } from "./fixtures";

const names = async (qs: string): Promise<string[]> =>
  (await api(`/api/dishes/top?${qs}`)).body.dishes.map((d: { name: string }) => d.name);
const postEvent = (ip: string) => api("/api/events", { method: "POST", body: { events: [{ name: "app_open" }] }, ip });
const postEvents = (...events: unknown[]) => api("/api/events", { method: "POST", body: { events } });
const eventRateLimitWindow = () => Math.floor(Date.now() / 60_000);

beforeEach(async () => {
  await resetData();
  resetNumbersCache();
});
afterEach(() => {
  vi.useRealTimers();
  resetBudgetCache();
});

describe("health and routing", () => {
  it("answers health, 404 for unknown API paths and 405 for wrong methods", async () => {
    expect(await api("/api/health")).toMatchObject({ status: 200, body: { ok: true, env: "dev" } });
    expect(await api("/api/nope")).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    expect((await api("/api/kieze", { method: "POST", body: {} })).status).toBe(405);
  });

  it("lists the original and expanded Kieze with published restaurant counts", async () => {
    await seedRestaurant({ kiez: "kreuzberg" });
    await seedRestaurant({ kiez: "kreuzberg", published: false });
    await seedRestaurant({ kiez: "marzahn" });
    const res = await api("/api/kieze");
    expect(res.status).toBe(200);
    expect(res.body.kieze.find((k: { slug: string }) => k.slug === "kreuzberg").restaurantCount).toBe(1);
    expect(res.body.kieze).toContainEqual({ slug: "marzahn", name: "Marzahn", wave: 5, restaurantCount: 1 });
  });
});

describe("GET /api/dishes/top", () => {
  it("finds the best protein dishes under 12 EUR near you, published only", async () => {
    const near = await seedRestaurant({ name: "Near", lat: 52.52, lng: 13.405 });
    const far = await seedRestaurant({ name: "Far", lat: 52.45, lng: 13.3 });
    const hidden = await seedRestaurant({ name: "Hidden", published: false });
    await seedDish({ restaurantId: near.id, name: "Chicken bowl", priceCents: 1150, proteinG: 45, withSource: true });
    await seedDish({ restaurantId: near.id, name: "Tofu bowl", priceCents: 990, proteinG: 28 });
    await seedDish({ restaurantId: near.id, name: "Steak", priceCents: 2400, proteinG: 60 });
    await seedDish({ restaurantId: near.id, name: "Draft", priceCents: 900, proteinG: 80, published: false });
    await seedDish({ restaurantId: near.id, name: "No price", priceCents: null, proteinG: 70 });
    await seedDish({ restaurantId: far.id, name: "Far bowl", priceCents: 1000, proteinG: 50 });
    await seedDish({ restaurantId: hidden.id, name: "Hidden bowl", priceCents: 1000, proteinG: 90 });

    const res = await api("/api/dishes/top?maxPriceCents=1200&lat=52.5201&lng=13.4051&radiusM=2000&sort=protein");
    expect(res.status).toBe(200);
    expect(res.body.dishes.map((d: { name: string }) => d.name)).toEqual(["Chicken bowl", "Tofu bowl"]);
    const [best] = res.body.dishes;
    expect(best).toMatchObject({
      priceCents: 1150,
      proteinPerEuro: 3.9,
      openNow: true,
      restaurant: { id: near.id, name: "Near", kiez: "mitte" },
      nutrition: { proteinG: { value: 45, min: 36, max: 54 }, source: "ai", confidence: "medium" },
      menuSource: { kind: "website_pdf", url: "https://example.com/menu.pdf", fetchedAt: "2026-11-21T00:00:00.000Z" },
    });
    expect(best.distanceM).toBeLessThan(50);

    // Without a radius every published dish counts, sorted by protein per euro.
    const all = await api("/api/dishes/top?sort=protein_per_euro&limit=3");
    expect(all.body.dishes.map((d: { name: string }) => d.name)).toEqual(["Far bowl", "Chicken bowl", "Tofu bowl"]);
    expect(all.body.dishes[0].distanceM).toBeNull();
  });

  it("filters by Kiez, kcal, protein and open now", async () => {
    vi.setSystemTime(new Date("2026-11-18T12:30:00+01:00"));
    const mitte = await seedRestaurant({ kiez: "mitte" });
    const closed = await seedRestaurant({ kiez: "mitte", openingHours: RARELY_OPEN });
    const neukoelln = await seedRestaurant({ kiez: "neukoelln" });
    await seedDish({ restaurantId: mitte.id, name: "Light", kcal: 450, proteinG: 35 });
    await seedDish({ restaurantId: mitte.id, name: "Heavy", kcal: 1100, proteinG: 50 });
    await seedDish({ restaurantId: mitte.id, name: "Low protein", kcal: 400, proteinG: 10 });
    await seedDish({ restaurantId: closed.id, name: "Closed", kcal: 400, proteinG: 40 });
    await seedDish({ restaurantId: neukoelln.id, name: "Neukölln", kcal: 400, proteinG: 40 });

    expect(await names("kiez=mitte&maxKcal=700&minProteinG=20")).toEqual(["Closed", "Light"]);
    expect(await names("kiez=mitte&maxKcal=700&minProteinG=20&openNow=1")).toEqual(["Light"]);
    expect(await names("kiez=neukoelln")).toEqual(["Neukölln"]);
  });

  it("rejects bad filters", async () => {
    expect((await api("/api/dishes/top?kiez=atlantis")).status).toBe(400);
    expect((await api("/api/dishes/top?radiusM=100")).body.error.code).toBe("bad_request");
  });
});

describe("restaurants and dishes", () => {
  it("lists restaurants by dish count or nearest first, and returns one with its dishes", async () => {
    const a = await seedRestaurant({ name: "A", lat: 52.53, lng: 13.41 });
    const b = await seedRestaurant({ name: "B", lat: 52.5201, lng: 13.4051 });
    await seedRestaurant({ name: "C without coordinates", lat: null, lng: null });
    await seedRestaurant({ name: "Draft", published: false });
    await seedDish({ restaurantId: a.id, name: "Bowl A1" });
    await seedDish({ restaurantId: a.id, name: "Bowl A2" });
    await seedDish({ restaurantId: b.id, name: "Bowl" });
    await seedDish({ restaurantId: b.id, name: "Draft dish", published: false });

    const byDishes = await api("/api/restaurants");
    expect(byDishes.body.restaurants.map((r: { name: string; dishCount: number }) => [r.name, r.dishCount])).toEqual([
      ["A", 2],
      ["B", 1],
      ["C without coordinates", 0],
    ]);
    const near = await api("/api/restaurants?lat=52.52&lng=13.405");
    expect(near.body.restaurants.map((r: { name: string; distanceM: number | null }) => [r.name, r.distanceM === null])).toEqual([
      ["B", false],
      ["A", false],
      ["C without coordinates", true],
    ]);
    // A radius needs coordinates.
    const within = await api("/api/restaurants?lat=52.52&lng=13.405&radiusM=5000");
    expect(within.body.restaurants.map((r: { name: string }) => r.name)).toEqual(["B", "A"]);
    expect(near.body.restaurants[2].location).toBeNull();

    const one = await api(`/api/restaurants/${b.id}`);
    expect(one.status).toBe(200);
    expect(one.body.restaurant).toMatchObject({ id: b.id, name: "B", location: { lat: 52.5201, lng: 13.4051 } });
    expect(Object.keys(one.body.restaurant).toSorted()).toEqual(["address", "googlePlaceId", "id", "kiez", "location", "name", "openingHours", "websiteUrl"]);
    expect(one.body.dishes.map((d: { name: string }) => d.name)).toEqual(["Bowl"]);
    expect(one.body.openNow).toBe(true);
    expect((await api(`/api/restaurants/${a.id}-missing`)).status).toBe(404);
  });

  it("returns a dish with its restaurant, never an unpublished one", async () => {
    const r = await seedRestaurant();
    const dish = await seedDish({ restaurantId: r.id, aiImageKey: "ai/bowl-1.webp" });
    const draft = await seedDish({ restaurantId: r.id, published: false });
    const res = await api(`/api/dishes/${dish}`);
    expect(res.body).toMatchObject({ dish: { id: dish, image: { kind: "ai", key: "ai/bowl-1.webp" } }, restaurant: { id: r.id } });
    expect((await api(`/api/dishes/${draft}`)).status).toBe(404);
  });
});

describe("POST /api/events", () => {
  it("stores valid events and drops invalid ones", async () => {
    const res = await api("/api/events", {
      method: "POST",
      body: {
        events: [
          { name: "app_open", anonId: "device-abc123", at: "2026-11-21T18:00:00.000Z" },
          { name: "dish_view", props: { dishId: "d1", fromMap: true } },
          { name: "not_an_event" },
          { name: "filter_change", props: { nested: { no: 1 } } },
          { name: "menu_tap", anonId: "!" },
          { name: "menu_tap", at: "not-a-date" },
          { name: "share_tap", props: { text: "a".repeat(1001) } },
        ],
      },
    });
    expect(res).toMatchObject({ status: 202, body: { accepted: 2 } });
    const rows = await env.DB.prepare("SELECT name, anon_id, client_at, props FROM events ORDER BY name").all();
    expect(rows.results).toEqual([
      { name: "app_open", anon_id: "device-abc123", client_at: Date.UTC(2026, 10, 21, 18), props: "{}" },
      { name: "dish_view", anon_id: null, client_at: null, props: '{"dishId":"d1","fromMap":true}' },
    ]);
    expect((await api("/api/events", { method: "POST", body: { events: [] } })).status).toBe(400);
    expect((await api("/api/events", { method: "POST", body: { events: [{ name: "nope" }] } })).status).toBe(400);
  });

  it("stores one event per device and name on each UTC day, including across separate requests", async () => {
    const midnight = Date.UTC(2026, 10, 22);
    vi.setSystemTime(midnight - 1);
    const event = { name: "menu_tap", anonId: "daily-device", at: "2026-11-21T16:00:00.000Z" };
    // A row written before deduplication shipped also occupies its device's slot.
    await env.DB.prepare(
      "INSERT INTO events (id, name, anon_id, created_at) VALUES ('legacy', ?, ?, ?)",
    ).bind(event.name, event.anonId, midnight - 2).run();
    expect(await postEvents(event)).toMatchObject({ status: 202, body: { accepted: 1 } });

    vi.setSystemTime(midnight);
    const responses = await Promise.all([postEvents(event, event), postEvents(event)]);
    expect(responses.map(({ status, body }) => [status, body.accepted])).toEqual([[202, 2], [202, 1]]);
    expect(await postEvents({ ...event, name: "share_tap" }, { ...event, anonId: "other-device" }))
      .toMatchObject({ status: 202, body: { accepted: 2 } });
    const rows = await env.DB.prepare("SELECT name, anon_id, created_at FROM events ORDER BY created_at, name, anon_id").all();
    expect(rows.results).toEqual([
      { name: "menu_tap", anon_id: "daily-device", created_at: midnight - 2 },
      { name: "menu_tap", anon_id: "daily-device", created_at: midnight },
      { name: "menu_tap", anon_id: "other-device", created_at: midnight },
      { name: "share_tap", anon_id: "daily-device", created_at: midnight },
    ]);
  });

  it("deduplicates on both sides of a configured measurement start", async () => {
    const start = Date.UTC(2026, 10, 22, 12);
    const post = (at: number) => {
      vi.setSystemTime(at);
      const request = new Request("https://app.test/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events: [{ name: "app_open", anonId: "window-device" }] }),
      });
      return ingestEvents({ env: { ...env, NUMBERS_SINCE: new Date(start).toISOString() }, request } as never);
    };
    for (const at of [start + 60_000, start - 1_800_000, start + 120_000, start - 3_600_000]) {
      expect((await post(at)).status).toBe(202);
    }
    const rows = await env.DB.prepare("SELECT created_at FROM events ORDER BY created_at").all();
    expect(rows.results).toEqual([{ created_at: start - 1_800_000 }, { created_at: start + 60_000 }]);
  });

  it("answers excluded devices exactly like stored ones", async () => {
    await env.DB.prepare("INSERT INTO numbers_excluded (anon_id, created_at) VALUES ('team-device', 1)").run();
    const excluded = await postEvents({ name: "app_open", anonId: "team-device" });
    const stored = await postEvents({ name: "app_open", anonId: "other-device" });
    expect(excluded.body).toEqual(stored.body);
    const rows = await env.DB.prepare("SELECT anon_id FROM events").all();
    expect(rows.results).toEqual([{ anon_id: "other-device" }]);
  });

  it(`limits each IP to ${IP_LIMITS_PER_MINUTE.LIMIT_EVENTS} event posts per minute`, async () => {
    // Miniflare resets its counters at wall-clock minute boundaries. Retry a
    // burst that spans two windows with a fresh IP so its count starts at zero.
    for (let attempt = 0; attempt < 2; attempt++) {
      const window = eventRateLimitWindow();
      const ip = ipOf(`events-burst-${attempt}`);
      for (let i = 0; i < IP_LIMITS_PER_MINUTE.LIMIT_EVENTS; i++) expect((await postEvent(ip)).status).toBe(202);
      const overflow = await postEvent(ip);
      if (eventRateLimitWindow() !== window) continue;

      expect(overflow).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });
      expect((await postEvent(ipOf("events-other"))).status).toBe(202);
      return;
    }
    throw new Error("Could not complete an event burst in one rate-limit window");
  }, 30_000);
});

describe("public traction numbers", () => {
  it("counts distinct post-launch devices in each group and removes a team's past and future activity", async () => {
    const since = Date.parse("2026-11-21T22:00:00.000Z");
    vi.setSystemTime(since + 2 * 86_400_000);
    const team = "team-device";
    const insert = env.DB.prepare("INSERT INTO events (id, name, anon_id, created_at) VALUES (?, ?, ?, ?)");
    const rows: [string, string | null, number][] = [
      ["app_open", "first-device", since],
      ["app_open", "first-device", since + 86_400_000],
      ["dish_view", "first-device", since],
      ["restaurant_view", "first-device", since],
      ["filter_change", "second-device", since],
      ["menu_tap", "first-device", since],
      ["directions_tap", "first-device", since],
      ["menu_tap", "second-device", since],
      ["share_tap", "second-device", since],
      ["share_tap", "second-device", since + 86_400_000],
      ["app_open", "old-device", since - 1],
      ["filter_change", "old-device", since - 1],
      ["menu_tap", "old-device", since - 1],
      ["share_tap", "old-device", since - 1],
      ["filter_change", "future-device", Date.now() + 86_400_000],
      ["dish_view", null, since],
      ...["app_open", "dish_view", "directions_tap", "share_tap"].map(
        (name): [string, string, number] => [name, team, since],
      ),
    ];
    await env.DB.batch(rows.map(([name, anonId, at], i) => insert.bind(`number-${i}`, name, anonId, at)));

    const before = await api("/api/numbers");
    expect(before).toMatchObject({ status: 200, body: { engaged: 3, decided: 3, shared: 2, visitors: 2 } });

    const exclude = (token?: string, anonId = team) => api("/api/admin/numbers/exclude", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: { anonId },
    });
    expect((await exclude()).status).toBe(403);
    expect((await exclude("wrong-token")).status).toBe(403);
    expect((await exclude("test-admin-token", "bad")).status).toBe(400);
    expect(await exclude("test-admin-token")).toMatchObject({ status: 200, body: { ok: true } });
    expect(await exclude("test-admin-token")).toMatchObject({ status: 200, body: { ok: true } });
    const teamRows = async () =>
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE anon_id = ?").bind(team).first<{ n: number }>())!.n;
    const teamRowsBefore = await teamRows();
    expect(await api("/api/events", { method: "POST", body: { events: [{ name: "app_open", anonId: team }] } }))
      .toMatchObject({ status: 202, body: { accepted: 1 } });
    expect(await teamRows()).toBe(teamRowsBefore);

    const cachedAt = Date.parse(before.body.generatedAt);
    vi.setSystemTime(cachedAt + 29_000);
    expect((await api("/api/numbers")).body).toEqual(before.body);

    vi.setSystemTime(cachedAt + 31_000);
    const requestedAt = Date.now();
    const after = await api("/api/numbers");
    expect(after.body).toEqual({
      engaged: 2, decided: 2, shared: 1, visitors: 1,
      since: new Date(since).toISOString(), generatedAt: expect.any(String),
    });
    expect(Date.parse(after.body.generatedAt)).toBeGreaterThanOrEqual(requestedAt);
    expect(Date.parse(after.body.generatedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("serves the team form with a no-store response and a matching CSP nonce", async () => {
    const page = await api("/api/team", { headers: { "accept-language": "en-GB,en;q=0.9,de;q=0.8" } });
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-language")).toBe("en");
    expect(page.body).toContain("<h1>Exclude a team device from analytics</h1>");
    const nonce = page.body.match(/<script nonce="([^"]+)">/)?.[1];
    expect(nonce).toBeTruthy();
    const directives = Object.fromEntries(
      page.headers.get("content-security-policy")!.split(";").map((d) => {
        const [name, ...sources] = d.trim().split(/\s+/);
        return [name, sources];
      }),
    );
    expect(directives["script-src"]).toEqual([`'nonce-${nonce}'`]);
  });
});

describe("GET /api/images/ai (AI dish images from the photo store)", () => {
  it("serves stored images and 404s unknown or malformed keys", async () => {
    await kvPhotoStore(env.PHOTOS).put("ai/bowl-1.webp", new Uint8Array([1, 2, 3]), { contentType: "image/webp" });
    const res = await api("/api/images/ai/bowl-1.webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.body).toEqual(new Uint8Array([1, 2, 3]));
    expect((await api("/api/images/ai/missing.webp")).status).toBe(404);
    expect((await api("/api/images/ai/..%2Fsecret.webp")).status).toBe(404);
  });
});

describe("GET /api/admin/ai-usage", () => {
  const ADMIN = { authorization: "Bearer test-admin-token" };

  it("needs the admin token", async () => {
    expect((await api("/api/admin/ai-usage")).status).toBe(403);
    expect((await api("/api/admin/ai-usage", { headers: { authorization: "Bearer test-admin-toke" } })).status).toBe(403);
    expect((await api("/api/admin/ai-usage", { headers: { authorization: "test-admin-token" } })).status).toBe(403);
    expect((await api("/api/admin/ai-usage", { headers: ADMIN })).status).toBe(200);
  });

  it("sums cost per model and per Kiez, with today's budget", async () => {
    await recordUsage(env.DB, [
      { purpose: "nutrition", provider: "anthropic", model: "claude-sonnet-5-5", status: 200, inputTokens: 1_000_000, outputTokens: 10_000, kiez: "mitte" },
      { purpose: "image_generate", provider: "openai", model: "gpt-image-2.6", status: 200, units: 1, usd: 0.04, kiez: "mitte" },
      { purpose: "places_search", provider: "google_places", model: "text_search", status: 500, units: 1, usd: 0.032, kiez: "kreuzberg" },
      { purpose: "nutrition_check", provider: "anthropic", model: "mystery-model", status: 200, inputTokens: 1000, outputTokens: 0 },
    ]);
    const res = await api("/api/admin/ai-usage", { headers: ADMIN });
    expect(res.status).toBe(200);
    expect(res.body.byModel.map((m: { model: string; usd: number; priced: boolean }) => [m.model, m.usd, m.priced])).toEqual([
      ["claude-sonnet-5-5", 2.1, true],
      ["gpt-image-2.6", 0.04, true],
      ["text_search", 0.032, true],
      ["mystery-model", 0, false],
    ]);
    expect(res.body.totalUsd).toBe(2.172);
    expect(res.body.byKiez).toEqual([
      { kiez: "mitte", calls: 2, usd: 2.14 },
      { kiez: "kreuzberg", calls: 1, usd: 0.032 },
      { kiez: null, calls: 1, usd: 0 },
    ]);
    // The unpriced call counts at the highest listed input rate ($4 per million) in the budget.
    expect(res.body.today).toMatchObject({ usd: 2.176, budgetUsd: 5, exhausted: false });
    expect(res.body.lastHour).toEqual({ calls: 4, failed: 1, failedShare: 0.25, warning: true });
  });
});
