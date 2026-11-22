import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBudgetCache } from "../src/lib/ai-usage";
import { reviewSubmission } from "../src/community/review";
import { postSubmission, restaurantIdCandidates, submissionConfig, SUBMISSION_LIMITS } from "../src/routes/submissions";
import { aiImage } from "../src/routes/media";
import { kvPhotoStore } from "../src/lib/photo-store";
import { stableUuid } from "../../pipeline/src/export/publish.ts";
import { api, ipOf, resetData, seedDish, seedRestaurant } from "./fixtures";
import { jpegWithExif, upload } from "./community-fixtures";

const ADMIN = { authorization: "Bearer test-admin-token" };

beforeEach(resetData);
afterEach(resetBudgetCache);

/** The review runs in waitUntil; poll the public status like the app does. */
async function settled(id: string) {
  for (let i = 0; i < 50; i++) {
    const res = await api(`/api/submissions/${id}`);
    if (res.body.submission.status !== "pending") return res.body.submission;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("review did not finish");
}

describe("POST /api/submissions", () => {
  it("stores the photo privately without Exif, reviews it (mock) and publishes the dishes with a Community marker", async () => {
    const r = await seedRestaurant({ name: "Hähnchen-Bowl Haus" });
    const res = await upload({ restaurantId: r.id }, { ip: ipOf("publish") });
    expect(res.status).toBe(202);
    expect(res.body.submission).toMatchObject({ status: "pending", restaurant: { id: r.id, name: "Hähnchen-Bowl Haus", isNew: false } });
    expect(res.headers.get("set-cookie")).toMatch(/^wohin_device=[0-9a-f-]{36}\.[\w-]{43}; Path=\/api; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure$/);

    const done = await settled(res.body.submission.id);
    expect(done).toMatchObject({ status: "published", reason: null, dishCount: 4 });

    const row = await env.DB.prepare("SELECT photo_key, photo_type, review_mode, decided_by FROM submissions WHERE id = ?").bind(done.id).first<{ photo_key: string; photo_type: string; review_mode: string; decided_by: string }>();
    expect(row).toMatchObject({ photo_type: "image/jpeg", review_mode: "mock", decided_by: "agent" });
    const device = res.headers.get("set-cookie")!.match(/^wohin_device=([0-9a-f-]{36})\./)![1];
    expect(row!.photo_key).toMatch(new RegExp(`^photos/${device}/[0-9a-f-]{36}$`));
    const stored = new TextDecoder().decode((await kvPhotoStore(env.PHOTOS).get(row!.photo_key))!.bytes);
    expect(stored).not.toContain("GPS");
    expect(stored).toContain("PIXELS");

    const menu = await api(`/api/restaurants/${r.id}`);
    expect(menu.body.dishes).toHaveLength(4);
    const bowl = menu.body.dishes.find((d: { name: string }) => d.name === "Hähnchen-Bowl");
    expect(bowl).toMatchObject({ priceCents: 1190, nutrition: { source: "ai" }, community: { addedAt: expect.any(String) } });
    expect(bowl.nutrition.proteinG.value).toBeGreaterThan(25);
    expect(bowl.nutrition.method).toContain("Community");

    const community = await api(`/api/community/dishes?restaurantId=${r.id}`);
    expect(community.body.dishes.map((d: { name: string }) => d.name).toSorted()).toEqual(["Falafel-Teller", "Hähnchen-Bowl", "Lachs-Poke", "Rote Linsensuppe"]);
  });

  it("stops serving an old community photo through public and admin URLs while its KV key still exists", async () => {
    const r = await seedRestaurant({ name: "Pho Saigon" });
    const id = await pending(r.id);
    await env.DB.prepare("UPDATE submissions SET status = 'published', created_at = ? WHERE id = ?")
      .bind(Date.now() - 31_536_000_000, id).run();
    expect(await kvPhotoStore(env.PHOTOS).get(`t/${id}`)).not.toBeNull();
    expect((await api(`/api/submissions/${id}/photo`)).status).toBe(404);
    expect((await api(`/api/admin/submissions/${id}/photo`, { headers: ADMIN })).status).toBe(404);
  });

  it("maps the app's pipeline seed ids (osm-node-123) to the published D1 restaurant", async () => {
    const id = restaurantIdCandidates("osm-node-89274696")[1]!;
    expect(restaurantIdCandidates("osm-node-89274696")).toEqual(["osm-node-89274696", stableUuid("osm:node/89274696")]);
    await seedRestaurant({ id, name: "Aapka" });
    const res = await upload({ restaurantId: "osm-node-89274696", restaurantName: "Aapka" }, { ip: ipOf("seed-id") });
    expect(res.body.submission.restaurant).toEqual({ id: "osm-node-89274696", name: "Aapka", isNew: false });
    expect(await env.DB.prepare("SELECT restaurant_id FROM submissions").first("restaurant_id")).toBe(id);
    expect(await settled(res.body.submission.id)).toMatchObject({ status: "published", dishCount: 4 });
    expect((await api("/api/community/dishes?restaurantId=osm-node-89274696")).body.dishes).toHaveLength(4);
  });

  it("rejects the same photo a second time with a reason", async () => {
    const r = await seedRestaurant({ name: "Doppelt" });
    const photo = jpegWithExif("same");
    const first = await upload({ restaurantId: r.id, photo }, { ip: ipOf("dup") });
    await settled(first.body.submission.id);
    const second = await upload({ restaurantId: r.id, photo }, { ip: ipOf("dup") });
    expect(await settled(second.body.submission.id)).toMatchObject({ status: "rejected", reason: "Dieses Foto wurde schon eingereicht." });
  });

  it("rejects a menu that is already online", async () => {
    const r = await seedRestaurant({ name: "Schon Da" });
    for (const name of ["Hähnchen-Bowl", "Falafel-Teller", "Rote Linsensuppe", "Lachs-Poke"]) await seedDish({ restaurantId: r.id, name });
    const res = await upload({ restaurantId: r.id }, { ip: ipOf("online") });
    expect(await settled(res.body.submission.id)).toMatchObject({ status: "rejected", reason: "Diese Speisekarte ist schon online." });
  });

  it("queues a new restaurant for the team; it reaches the map only after approval", async () => {
    const res = await upload({ newRestaurant: { name: "Neue Bowl Bar", lat: 52.5246, lng: 13.4027, address: "Torstraße 1" } }, { ip: ipOf("new") });
    expect(res.status).toBe(202);
    const queued = await settled(res.body.submission.id);
    expect(queued).toMatchObject({ status: "review", restaurant: { id: null, name: "Neue Bowl Bar", isNew: true } });
    expect((await api("/api/restaurants")).body.restaurants).toHaveLength(0);

    expect((await api("/api/admin/submissions")).status).toBe(403);
    const page = await api("/api/admin/queue");
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.body).toContain("Community-Queue");
    const queue = await api("/api/admin/submissions?status=review", { headers: ADMIN });
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({ teamNote: expect.stringContaining("Neues Restaurant"), newPlace: { address: "Torstraße 1" } });
    expect(queue.body.items[0].dishes).toHaveLength(4);

    const photo = await api(`/api/admin/submissions/${queued.id}/photo`, { headers: ADMIN });
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect((await api(`/api/admin/submissions/${queued.id}/photo`)).status).toBe(403);

    const decided = await api(`/api/admin/submissions/${queued.id}/decision`, { method: "POST", body: { decision: "publish" }, headers: ADMIN });
    expect(decided.body.submission).toMatchObject({ status: "published", dishCount: 4, restaurant: { isNew: true } });
    const map = await api("/api/restaurants");
    expect(map.body.restaurants).toMatchObject([{ name: "Neue Bowl Bar", kiez: "mitte", location: { lat: 52.5246, lng: 13.4027 }, dishCount: 4 }]);
  });

  it("lets the team reject with a reason, and rejects a new place outside our Kieze", async () => {
    const res = await upload({ restaurantId: "seed-only-id", restaurantName: "Nur im Seed" }, { ip: ipOf("team-reject") });
    const queued = await settled(res.body.submission.id);
    expect(queued).toMatchObject({ status: "review", restaurant: { id: "seed-only-id", name: "Nur im Seed" } });
    const decided = await api(`/api/admin/submissions/${queued.id}/decision`, { method: "POST", body: { decision: "reject", reason: "Unscharf." }, headers: ADMIN });
    expect(decided.body.submission).toMatchObject({ status: "rejected", reason: "Unscharf." });

    const far = await upload({ newRestaurant: { name: "Hamburg Imbiss", lat: 53.55, lng: 9.99 } }, { ip: ipOf("far") });
    expect(await settled(far.body.submission.id)).toMatchObject({ status: "rejected", reason: "Das Restaurant liegt außerhalb unserer Berliner Kieze." });
  });

  it("validates consent, type, size and the restaurant", async () => {
    const r = await seedRestaurant();
    const ip = { ip: ipOf("validate") };
    expect((await upload({ restaurantId: r.id, consent: null }, ip)).status).toBe(400);
    expect((await upload({ restaurantId: r.id, photo: null }, ip)).status).toBe(400);
    expect(await upload({ restaurantId: r.id, photo: new TextEncoder().encode("<svg onload=alert(1)>"), photoType: "image/jpeg" }, ip)).toMatchObject({
      status: 415,
      body: { error: { code: "unsupported_media_type" } },
    });
    const big = new Uint8Array(5 * 1024 * 1024 + 10);
    big.set(jpegWithExif());
    expect(await upload({ restaurantId: r.id, photo: big }, ip)).toMatchObject({ status: 413, body: { error: { code: "payload_too_large" } } });
    expect((await upload({}, ip)).status).toBe(400);
    expect((await upload({ restaurantId: "unknown" }, ip)).status).toBe(400);
    expect((await upload({ newRestaurant: { name: "X", lat: 52.5, lng: 13.4 } }, ip)).status).toBe(400);
    expect((await api("/api/submissions/nope")).status).toBe(404);
  });

  it("limits uploads per hashed IP and per device cookie", async () => {
    const r = await seedRestaurant();
    for (let i = 0; i < SUBMISSION_LIMITS.perHour; i++) expect((await upload({ restaurantId: r.id }, { ip: ipOf("busy") })).status).toBe(202);
    expect(await upload({ restaurantId: r.id }, { ip: ipOf("busy") })).toMatchObject({ status: 429, body: { error: { code: "rate_limited" } } });

    const first = await upload({ restaurantId: r.id }, { ip: ipOf("device-1") });
    const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
    for (let i = 1; i < SUBMISSION_LIMITS.perHour; i++) expect((await upload({ restaurantId: r.id }, { ip: ipOf(`device-${i + 1}`), cookie })).status).toBe(202);
    expect((await upload({ restaurantId: r.id }, { ip: ipOf("device-new-ip"), cookie })).status).toBe(429);
  });

  it("requires a valid Turnstile token when the flag is on, and tells the form the site key", async () => {
    expect((await api("/api/submissions/config")).body).toMatchObject({ uploadsEnabled: true, uploadsPaused: null, turnstileSiteKey: null, maxBytes: 5 * 1024 * 1024 });
    const r = await seedRestaurant();
    const form = new FormData();
    form.append("photo", new File([jpegWithExif()], "m.jpg"));
    form.append("consent", "1");
    form.append("restaurantId", r.id);
    const ctx = createExecutionContext();
    const url = new URL("https://app.test/api/submissions");
    const request = new Request(url, { method: "POST", body: form, headers: { "cf-connecting-ip": ipOf("turnstile") } });
    const res = await postSubmission({ request, env: { ...env, TURNSTILE_ENABLED: "true", TURNSTILE_SECRET_KEY: "" } as unknown as Env, ctx, url, params: {} });
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
  });

  it("answers a clear unavailable state on a deploy without the PHOTOS binding", async () => {
    const { PHOTOS: _p, ...rest } = env;
    const noR2 = rest as unknown as Env;
    const ctx = createExecutionContext();
    const url = new URL("https://app.test/api/submissions/config");
    expect(await (await submissionConfig({ request: new Request(url), env: noR2, ctx, url, params: {} })).json()).toMatchObject({ uploadsEnabled: false, uploadsPaused: "unavailable" });

    const r = await seedRestaurant();
    const form = new FormData();
    form.append("photo", new File([jpegWithExif()], "m.jpg"));
    form.append("consent", "1");
    form.append("restaurantId", r.id);
    const postUrl = new URL("https://app.test/api/submissions");
    const request = new Request(postUrl, { method: "POST", body: form, headers: { "cf-connecting-ip": ipOf("no-r2") } });
    const res = await postSubmission({ request, env: noR2, ctx, url: postUrl, params: {} });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "unavailable" } });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions").first("n")).toBe(0);

    const imgUrl = new URL("https://app.test/api/images/ai/x.webp");
    expect((await aiImage({ request: new Request(imgUrl), env: noR2, ctx, url: imgUrl, params: { file: "x.webp" } })).status).toBe(404);
    await waitOnExecutionContext(ctx);
  });
});

const openAiReply = (data: unknown, input = 2000, output = 800) =>
  Response.json({ status: "completed", model: "gpt-6.2-sol", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }], usage: { input_tokens: input, output_tokens: output } });

async function pending(restaurantId: string): Promise<string> {
  const id = crypto.randomUUID();
  await kvPhotoStore(env.PHOTOS).put(`t/${id}`, jpegWithExif(), { contentType: "image/jpeg" });
  await env.DB.prepare(
    `INSERT INTO submissions (id, restaurant_id, restaurant_ref, restaurant_name, photo_key, photo_sha256, photo_type, photo_bytes, created_at)
     VALUES (?, ?, ?, 'Pho Saigon', ?, ?, 'image/jpeg', 100, ?)`,
  )
    .bind(id, restaurantId, restaurantId, `t/${id}`, id, Date.now())
    .run();
  return id;
}

describe("review agent with a real provider", () => {
  it("logs the cost of every call per submission and rejects faces before the recipe call", async () => {
    const r = await seedRestaurant({ name: "Pho Saigon" });
    const id = await pending(r.id);
    const calls: string[] = [];
    const fakeFetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return openAiReply({ is_menu: true, reason: "", menu_language: "de", notes: "", restaurant_name_on_menu: "Pho Saigon", cuisine: null, faces: true, inappropriate: false, legibility: "high", dishes: [] });
    }) as typeof fetch;
    await reviewSubmission({ ...env, COMMUNITY_REVIEW_MODE: "auto", OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "" }, id, { fetch: fakeFetch });
    expect(calls).toEqual(["https://api.openai.com/v1/responses"]);
    const sub = await env.DB.prepare("SELECT status, reason, cost_micros, review_mode FROM submissions WHERE id = ?").bind(id).first();
    // 2000 input tokens at 2 USD/M + 800 output tokens at 10 USD/M = 0.012 USD.
    expect(sub).toMatchObject({ status: "rejected", reason: "Auf dem Foto sind Personen zu sehen. Bitte fotografiere nur die Speisekarte.", cost_micros: 12000, review_mode: "openai" });
    const usage = await env.DB.prepare("SELECT purpose, provider, model, submission_id, cost_micros FROM ai_usage").all();
    expect(usage.results).toEqual([{ purpose: "community_menu", provider: "openai", model: "gpt-6.2-sol", submission_id: id, cost_micros: 12000 }]);
  });

  it("queues for the team without AI once the daily community budget is spent", async () => {
    const r = await seedRestaurant({ name: "Pho Saigon" });
    await env.DB.prepare("INSERT INTO ai_usage (id, created_at, purpose, provider, model, status, cost_micros) VALUES ('x', ?, 'community_menu', 'openai', 'gpt-6.2-sol', 200, 2000000)")
      .bind(Date.now())
      .run();
    const id = await pending(r.id);
    let called = false;
    await reviewSubmission({ ...env, COMMUNITY_REVIEW_MODE: "auto", OPENAI_API_KEY: "sk-test", COMMUNITY_DAILY_BUDGET_USD: "1" }, id, {
      fetch: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(called).toBe(false);
    expect(await env.DB.prepare("SELECT status, team_note FROM submissions WHERE id = ?").bind(id).first()).toEqual({
      status: "review",
      team_note: "KI-Prüfung pausiert: Tagesbudget erreicht",
    });
  });
});
