import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { brandCardPath, cardLabels, cardVersion, ogSvg, prebuiltCardPath, storySvg } from "../src/share/card";
import { setShareDishesForTests, type ShareDish } from "../src/share/dishes";
import { shareCard } from "../src/share/routes";
import { drawable, measure, wrap } from "../src/share/text";
import { webResponse } from "../src/web";
import { api, ipOf } from "./fixtures";

const BOWL: ShareDish = {
  name: "Chicken Teriyaki Bowl mit Brokkoli & Edamame",
  restaurant: "Viet Bowl",
  kiez: "Kreuzberg",
  price: 12.9,
  kcal: 640,
  protein: 45,
  carbs: 62,
  fat: 18,
  score: 84,
  estimate: true,
  image: null,
};
const KOREAN: ShareDish = { ...BOWL, name: "김치찌개", restaurant: "Seoul Kitchen", price: null };

beforeEach(async () => {
  setShareDishesForTests({ "d_bowl": BOWL, "d_korean": KOREAN });
  await env.DB.batch([env.DB.prepare("DELETE FROM shares"), env.DB.prepare("DELETE FROM share_landings")]);
});
afterAll(() => setShareDishesForTests(null));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function fetchPng(path: string): Promise<Response> {
  return exports.default.fetch(new Request(`https://app.test${path}`, { headers: { "cf-connecting-ip": ipOf("cards") } }));
}

describe("card text", () => {
  it("drops characters the bundled fonts cannot draw and falls back to the restaurant", () => {
    expect(drawable("Kimchi Jjigae (김치찌개)")).toBe("Kimchi Jjigae");
    expect(drawable("Phở bò tái")).toBe("Phở bò tái");
    expect(cardLabels(KOREAN).name).toBe("Gericht bei Seoul Kitchen");
    expect(cardLabels(BOWL).place).toBe("Viet Bowl · Kreuzberg");
  });

  it("wraps long names within the width and line limit, ending in an ellipsis", () => {
    const lines = wrap("Gegrillter Lachs mit Quinoa, Avocado, Edamame und Sesam-Ingwer-Dressing", 54, 800, 500, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    for (const line of lines) expect(measure(line, 54, 800)).toBeLessThanOrEqual(500);
  });

  it("puts dish, protein, kcal, price, Kiez and the brand on both formats", () => {
    for (const svg of [ogSvg(BOWL, null), storySvg(BOWL, null)]) {
      for (const part of ["45 g", "640", "12,90 €", "Viet Bowl · Kreuzberg", "DishFit", "Protein"]) expect(svg).toContain(part);
    }
    expect(storySvg(BOWL, null)).toContain("KI-Schätzung");
  });
});

describe("GET /api/share/:id/og | story", () => {
  it("renders the link preview at 1200 x 630 and the story at 1080 x 1920", async () => {
    const og = await fetchPng("/api/share/d_bowl/og");
    expect(og.status).toBe(200);
    expect(og.headers.get("content-type")).toBe("image/png");
    expect(pngSize(new Uint8Array(await og.arrayBuffer()))).toEqual({ width: 1200, height: 630 });

    const story = await fetchPng("/api/share/d_korean/story?download=1");
    expect(story.status).toBe(200);
    expect(story.headers.get("content-disposition")).toContain('filename="dishfit-gericht-bei-seoul-kitchen-story.png"');
    expect(pngSize(new Uint8Array(await story.arrayBuffer()))).toEqual({ width: 1080, height: 1920 });

    // Drawn once, then served from the photo store.
    await vi.waitFor(async () => {
      const listed = await env.PHOTOS.list({ prefix: "share-cards/" });
      expect(listed.keys.map((k) => k.name.replace(/^share-cards\/[0-9a-f]+-/, ""))).toEqual(expect.arrayContaining(["og.png", "story.png"]));
    });
  }, 30_000);

  it("serves the build's card, else the brand card, and never draws when SHARE_CARD_RENDER is prebuilt", async () => {
    const version = await cardVersion(BOWL);
    const files: Record<string, string> = { [prebuiltCardPath(version, "og")]: "dish-og", [brandCardPath("story")]: "brand-story" };
    const assets = {
      fetch: async (req: Request) => {
        const body = files[new URL(req.url).pathname];
        // Like the real assets: unknown paths get the app shell.
        return body ? new Response(body, { headers: { "content-type": "image/jpeg" } }) : new Response("<html>", { headers: { "content-type": "text/html" } });
      },
    };
    const stub = { ...env, ASSETS: assets, SHARE_CARD_RENDER: "prebuilt" } as unknown as Env;
    const call = async (file: string) => {
      const ctx = createExecutionContext();
      const url = new URL(`https://app.test/api/share/d_bowl/${file}`);
      const res = await shareCard({ request: new Request(url), env: stub, ctx, url, params: { id: "d_bowl", file } });
      await waitOnExecutionContext(ctx);
      return { status: res.status, body: new TextDecoder().decode(await res.arrayBuffer()), cache: res.headers.get("cache-control") };
    };
    expect(await call("og")).toMatchObject({ status: 200, body: "dish-og" });
    expect(await call("story")).toMatchObject({ status: 200, body: "brand-story", cache: "public, max-age=3600" });
    files[brandCardPath("story")] = "";
    expect((await call("story")).status).toBe(404);
  });

  it("answers 404 for unknown dishes and formats", async () => {
    expect((await fetchPng("/api/share/nope/og")).status).toBe(404);
    expect((await fetchPng("/api/share/d_bowl/huge")).status).toBe(404);
  });
});

describe("shares, landings and numbers", () => {
  it("records a share and returns a link with ref and share id", async () => {
    const res = await api("/api/shares", { method: "POST", body: { dishId: "d_bowl", channel: "whatsapp", anonId: "anon-12345" } });
    expect(res.status).toBe(201);
    const link = new URL(res.body.url);
    expect(link.pathname).toBe("/d/d_bowl");
    expect(link.searchParams.get("ref")).toBe("whatsapp");
    expect(link.searchParams.get("s")).toBe(res.body.id);
    const row = await env.DB.prepare("SELECT dish_id, channel, anon_id FROM shares WHERE id = ?").bind(res.body.id).first();
    expect(row).toEqual({ dish_id: "d_bowl", channel: "whatsapp", anon_id: "anon-12345" });
  });

  it("rejects unknown channels and dishes", async () => {
    expect((await api("/api/shares", { method: "POST", body: { dishId: "d_bowl", channel: "fax" } })).status).toBe(400);
    expect((await api("/api/shares", { method: "POST", body: { dishId: "nope", channel: "copy" } })).status).toBe(404);
  });

  it("serves dish pages with preview tags and counts people and preview crawlers apart", async () => {
    const shell = `<!doctype html><html><head><title>DishFit</title><meta name="description" content="app" /></head><body></body></html>`;
    const stub = { ...env, ASSETS: { fetch: async () => new Response(shell, { headers: { "content-type": "text/html" } }) } } as unknown as Env;
    const open = async (query: string, ua: string) => {
      const url = new URL(`https://app.test/d/d_bowl${query}`);
      const ctx = createExecutionContext();
      const res = await webResponse(new Request(url, { headers: { "user-agent": ua } }), stub, ctx, url);
      const html = await res.text();
      await waitOnExecutionContext(ctx);
      return html;
    };
    const { body } = await api("/api/shares", { method: "POST", body: { dishId: "d_bowl", channel: "whatsapp" } });
    const html = await open(`?ref=whatsapp&s=${body.id}`, "Mozilla/5.0 (iPhone)");
    expect(html).toContain('<meta property="og:image" content="https://app.test/api/share/d_bowl/og" />');
    expect(html).toContain("45 g Protein, 640 kcal");
    expect(html).toContain("<title>Chicken Teriyaki Bowl mit Brokkoli &amp; Edamame · DishFit</title>");
    expect(html).not.toContain('content="app"');
    await open(`?ref=whatsapp&s=${body.id}`, "WhatsApp/2.23.20 A");
    await open("", "Mozilla/5.0");

    const forbidden = await api("/api/admin/share-numbers");
    expect(forbidden.status).toBe(403);
    const numbers = await api("/api/admin/share-numbers", { headers: { authorization: "Bearer test-admin-token" } });
    expect(numbers.status).toBe(200);
    expect(numbers.body).toMatchObject({
      shares: { total: 1, byChannel: { whatsapp: 1 } },
      landings: { people: 1, previews: 1, sharesThatLanded: 1, byRef: { whatsapp: 1 } },
      topDishes: [{ dishId: "d_bowl", name: BOWL.name, shares: 1 }],
    });
  });

  it("answers 404 with the app shell for unknown dish, restaurant and scan ids and 200 for known ones", async () => {
    const shell = `<!doctype html><html><head><title>DishFit</title></head><body>shell</body></html>`;
    const assets = async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/") return new Response(shell, { headers: { "content-type": "text/html" } });
      if (path === "/share/restaurants/r_known.json") return new Response("{}", { headers: { "content-type": "application/json" } });
      return new Response("missing", { status: 404 });
    };
    const stub = { ...env, ASSETS: { fetch: assets } } as unknown as Env;
    const status = async (path: string, method = "GET") => {
      const url = new URL(`https://app.test${path}`);
      const ctx = createExecutionContext();
      const res = await webResponse(new Request(url, { method, headers: { accept: "text/html" } }), stub, ctx, url);
      await waitOnExecutionContext(ctx);
      return [res.status, await res.text()] as const;
    };
    expect(await status("/d/d_bowl")).toEqual([200, expect.stringContaining("og:image")]);
    expect(await status("/d/no-such-dish")).toEqual([404, shell]);
    expect((await status("/d/no-such-dish", "HEAD"))[0]).toBe(404);
    expect(await status("/r/r_known")).toEqual([200, shell]);
    expect(await status("/r/r_unknown")).toEqual([404, shell]);
    expect(await status("/scan/no-such-scan")).toEqual([404, shell]);
    expect(await status("/no-such-page")).toEqual([404, shell]);
    await env.DB.prepare(
      "INSERT INTO submissions (id, restaurant_ref, restaurant_name, photo_key, photo_sha256, photo_type, photo_bytes, created_at) VALUES ('sub_known', 'x', 'X', 'k', 'h', 'image/jpeg', 1, 1)",
    ).run();
    expect(await status("/scan/sub_known")).toEqual([200, shell]);
    expect(await status("/map")).toEqual([200, shell]);
    expect(await status("/entdecken")).toEqual([200, shell]);
  });

  it("serves the plain shell when a record lookup fails and does not remember the failure", async () => {
    setShareDishesForTests(null);
    const shell = `<!doctype html><html><head><title>DishFit</title></head><body>shell</body></html>`;
    let broken = true;
    const assets = async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/") return new Response(shell, { headers: { "content-type": "text/html" } });
      if (path === "/share/dishes/d_live.json") {
        return broken ? new Response("boom", { status: 503 }) : new Response(JSON.stringify(BOWL), { headers: { "content-type": "application/json" } });
      }
      return new Response("missing", { status: 404 });
    };
    const stub = { ...env, ASSETS: { fetch: assets } } as unknown as Env;
    const open = async (method: string) => {
      const url = new URL("https://app.test/d/d_live");
      const ctx = createExecutionContext();
      const res = await webResponse(new Request(url, { method, headers: { accept: "text/html" } }), stub, ctx, url);
      await waitOnExecutionContext(ctx);
      return [res.status, await res.text()] as const;
    };
    expect(await open("GET")).toEqual([200, shell]);
    expect((await open("HEAD"))[0]).toBe(200);
    broken = false;
    expect(await open("GET")).toEqual([200, expect.stringContaining("og:image")]);
  });
});
