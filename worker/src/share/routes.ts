// Shareable dish cards: the card images, the share records, the dish page with link-preview tags
// that also counts landings, and the numbers. Links look like /d/<dish id>?ref=<channel>&s=<share id>.
import { isAdmin } from "../lib/admin";
import { photoStore, storePhoto } from "../lib/photo-store";
import { apiError, badRequest, json, notFound, readJson, type RouteContext } from "../lib/http";
import { brandCardPath, cardLabels, CARD_SIZE, cardVersion, formatPrice, prebuiltCardPath, renderCard, type CardFormat } from "./card";
import { findShareDish, imageDataUrl, type ShareDish } from "./dishes";

export const SHARE_CHANNELS = ["native", "whatsapp", "copy", "story"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

const CHANNELS: ReadonlySet<string> = new Set(SHARE_CHANNELS);
const ANON_ID = /^[A-Za-z0-9_-]{8,64}$/;
const SHARE_ID = /^[A-Za-z0-9_-]{6,32}$/;
const REF = /^[a-z]{1,16}$/;
const PREVIEW_BOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|embedly|vkshare|pinterest/i;
const CARD_MAX_AGE = 24 * 60 * 60;

const FORMATS: Record<string, CardFormat> = { og: "og", story: "story" };

function shareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "gericht";

const PNG_HEADERS = { "content-type": "image/png", "cache-control": `public, max-age=${CARD_MAX_AGE}` };

/** An image from the static assets, or null (the assets answer unknown paths with the app shell). */
async function staticImage(env: Env, path: string): Promise<Response | null> {
  const response = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  return response.ok && /^image\/(jpeg|png)/.test(response.headers.get("content-type") ?? "") ? response : null;
}

function cardResponse(body: BodyInit | null, type: string, maxAge: number, download: string | null): Response {
  const headers = new Headers({ "content-type": type, "cache-control": `public, max-age=${maxAge}` });
  if (download) headers.set("content-disposition", `attachment; filename="${download}.${type === "image/jpeg" ? "jpg" : "png"}"`);
  return new Response(body, { headers });
}

/** Draws a card on request: once per dish version and design, then kept in the photo store and the edge cache. */
async function drawnCard(env: Env, ctx: ExecutionContext, origin: string, dish: ShareDish, version: string, format: CardFormat): Promise<BodyInit> {
  const cache = await caches.open("share-cards");
  const cacheKey = new Request(new URL(`/api/share/cards/${version}-${format}.png`, origin));
  const cached = await cache.match(cacheKey);
  if (cached?.body) return cached.body;
  const storeKey = `share-cards/${version}-${format}.png`;
  const stored = await photoStore(env)?.get(storeKey);
  let png: Uint8Array;
  if (stored) {
    png = new Uint8Array(stored.bytes);
  } else {
    png = await renderCard(format, dish, await imageDataUrl(env, dish.image));
    // Within the daily write budget only; past it the card is simply drawn again next time.
    ctx.waitUntil(storePhoto(env, storeKey, png, { contentType: "image/png" }));
  }
  ctx.waitUntil(cache.put(cacheKey, new Response(png.slice(), { headers: PNG_HEADERS })));
  return png;
}

/**
 * GET /api/share/:id/og | story: the dish card image; ?download=1 saves it as a file.
 * 1. The card the build drew (worker/scripts/render-cards.ts), served from the static assets: no drawing here.
 * 2. With SHARE_CARD_RENDER=on-request (local, tests, Workers Paid): drawn now, once per dish version.
 * 3. Otherwise the DishFit brand card, so a Workers Free request never draws (10 ms CPU limit).
 */
export async function shareCard({ env, ctx, url, params }: RouteContext): Promise<Response> {
  const format = FORMATS[params.file ?? ""];
  if (!format) return notFound();
  const dish = await findShareDish(env, params.id ?? "");
  if (!dish) return notFound("Dish not found");
  const version = await cardVersion(dish);
  const download = url.searchParams.get("download") === "1" ? `dishfit-${slug(cardLabels(dish).name)}-${format}` : null;
  const prebuilt = await staticImage(env, prebuiltCardPath(version, format));
  if (prebuilt) return cardResponse(prebuilt.body, prebuilt.headers.get("content-type")!, CARD_MAX_AGE, download);
  if (env.SHARE_CARD_RENDER === "on-request") {
    return cardResponse(await drawnCard(env, ctx, url.origin, dish, version, format), "image/png", CARD_MAX_AGE, download);
  }
  const brand = await staticImage(env, brandCardPath(format));
  if (!brand) return notFound("Card not available");
  // Short cache: the dish's own card arrives with the next build.
  return cardResponse(brand.body, brand.headers.get("content-type")!, 60 * 60, download);
}

/**
 * POST /api/shares {dishId, channel, id?, anonId?}: records a share and returns its id and link. The app
 * sends its own id so the link exists before this call returns (a WhatsApp tab must open on the tap).
 */
export async function postShare({ env, request, url }: RouteContext): Promise<Response> {
  const body = (await readJson(request, 2048)) as { dishId?: unknown; channel?: unknown; id?: unknown; anonId?: unknown } | null;
  const dishId = typeof body?.dishId === "string" ? body.dishId : "";
  const channel = typeof body?.channel === "string" ? body.channel : "";
  const anonId = body?.anonId;
  if (!dishId || dishId.length > 128 || !CHANNELS.has(channel)) return badRequest("Send {dishId, channel} with a known channel");
  if (anonId !== undefined && (typeof anonId !== "string" || !ANON_ID.test(anonId))) return badRequest("Invalid anonId");
  if (body?.id !== undefined && (typeof body.id !== "string" || !SHARE_ID.test(body.id))) return badRequest("Invalid id");
  if (!(await findShareDish(env, dishId))) return notFound("Dish not found");
  const id = (body?.id as string | undefined) ?? shareId();
  const inserted = await env.DB.prepare(
    "INSERT INTO shares (id, dish_id, channel, anon_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING",
  )
    .bind(id, dishId, channel, (anonId as string | undefined) ?? null, Date.now())
    .run();
  if (inserted.meta.changes === 0) return apiError("bad_request", "Share id already used", 409);
  const link = new URL(`/d/${encodeURIComponent(dishId)}`, url.origin);
  link.searchParams.set("ref", channel);
  link.searchParams.set("s", id);
  return json({ id, url: link.toString() }, 201);
}

/** Records a visit from a shared link; never fails the page. */
async function recordLanding(env: Env, request: Request, url: URL, dishId: string): Promise<void> {
  const ref = url.searchParams.get("ref");
  const s = url.searchParams.get("s");
  const validRef = ref && REF.test(ref) ? ref : null;
  const validShare = s && SHARE_ID.test(s) ? s : null;
  if (!validRef && !validShare) return;
  const preview = PREVIEW_BOTS.test(request.headers.get("user-agent") ?? "") ? 1 : 0;
  try {
    await env.DB.prepare("INSERT INTO share_landings (id, share_id, dish_id, ref, preview, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), validShare, dishId, validRef, preview, Date.now())
      .run();
  } catch (error) {
    console.error("[share] landing not recorded", error instanceof Error ? error.message : "error");
  }
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function previewTags(dish: ShareDish, pageUrl: string, imageUrl: string): string {
  const { name, place } = cardLabels(dish);
  const title = `${name} · ${dish.protein} g Protein, ${dish.kcal} kcal`;
  const parts = [place, dish.price !== null ? formatPrice(dish.price) : null, `Health-Score ${dish.score}`].filter(Boolean);
  const description = `${parts.join(" · ")}. Gefunden mit DishFit.`;
  const { width, height } = CARD_SIZE.og;
  return [
    ["og:type", "website"],
    ["og:site_name", "DishFit"],
    ["og:title", title],
    ["og:description", description],
    ["og:url", pageUrl],
    ["og:image", imageUrl],
    ["og:image:width", String(width)],
    ["og:image:height", String(height)],
    ["og:image:alt", `${name}: ${dish.protein} g Protein, ${dish.kcal} kcal`],
  ]
    .map(([p, c]) => `<meta property="${p}" content="${attr(c!)}" />`)
    .concat(
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${attr(imageUrl)}" />`,
      `<meta name="description" content="${attr(description)}" />`,
    )
    .join("\n    ");
}

/**
 * GET /d/:id (runs before the static assets): the app shell with link-preview tags for the dish, so
 * WhatsApp, iMessage and the like show the card. Landings from shared links are counted on the way.
 */
export async function dishPage(request: Request, env: Env, ctx: ExecutionContext, url: URL, dishId: string, dish: ShareDish, shell: Response): Promise<Response> {
  ctx.waitUntil(recordLanding(env, request, url, dishId));
  const pageUrl = new URL(`/d/${encodeURIComponent(dishId)}`, url.origin).toString();
  const imageUrl = new URL(`/api/share/${encodeURIComponent(dishId)}/og`, url.origin).toString();
  const { name } = cardLabels(dish);
  const page = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(`${name} · DishFit`);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.remove();
      },
    })
    .on("head", {
      element(el) {
        el.append(previewTags(dish, pageUrl, imageUrl), { html: true });
      },
    })
    .transform(shell);
  const headers = new Headers(page.headers);
  headers.set("cache-control", "no-cache");
  return new Response(page.body, { status: page.status, headers });
}

type Count = { key: string | null; n: number };

/** GET /api/admin/share-numbers?days=30: shares per channel, landings per ref, top shared dishes (admin token). */
export async function shareNumbers({ request, env, url }: RouteContext): Promise<Response> {
  if (!(await isAdmin(request, env))) return apiError("forbidden", "Admin token required.", 403);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const [byChannel, byRef, previews, fromShares, sharers, top] = await env.DB.batch<Count>([
    env.DB.prepare("SELECT channel AS key, count(*) AS n FROM shares WHERE created_at >= ? GROUP BY channel ORDER BY n DESC").bind(since),
    env.DB.prepare("SELECT ref AS key, count(*) AS n FROM share_landings WHERE created_at >= ? AND preview = 0 GROUP BY ref ORDER BY n DESC").bind(
      since,
    ),
    env.DB.prepare("SELECT NULL AS key, count(*) AS n FROM share_landings WHERE created_at >= ? AND preview = 1").bind(since),
    env.DB.prepare(
      "SELECT NULL AS key, count(DISTINCT l.share_id) AS n FROM share_landings l JOIN shares s ON s.id = l.share_id WHERE l.created_at >= ? AND l.preview = 0",
    ).bind(since),
    env.DB.prepare("SELECT NULL AS key, count(DISTINCT anon_id) AS n FROM shares WHERE created_at >= ? AND anon_id IS NOT NULL").bind(since),
    env.DB.prepare(
      `SELECT s.dish_id AS key, count(DISTINCT s.id) AS n FROM shares s WHERE s.created_at >= ?
       GROUP BY s.dish_id ORDER BY n DESC LIMIT 10`,
    ).bind(since),
  ]);
  const rows = (r: D1Result<Count> | undefined) => r?.results ?? [];
  const sum = (r: D1Result<Count> | undefined) => rows(r).reduce((total, row) => total + row.n, 0);
  const topDishes = await Promise.all(
    rows(top).map(async (row) => ({ dishId: row.key, name: (await findShareDish(env, row.key ?? ""))?.name ?? null, shares: row.n })),
  );
  return json({
    days,
    shares: { total: sum(byChannel), sharers: sum(sharers), byChannel: Object.fromEntries(rows(byChannel).map((r) => [r.key, r.n])) },
    landings: {
      people: sum(byRef),
      previews: sum(previews),
      sharesThatLanded: sum(fromShares),
      byRef: Object.fromEntries(rows(byRef).map((r) => [r.key ?? "none", r.n])),
    },
    topDishes,
  });
}
