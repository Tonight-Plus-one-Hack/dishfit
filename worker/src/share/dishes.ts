// Dish data for share cards and link previews. The web app's seed is the source of dish data today, so
// the web build writes every public dish to share/dishes/<id>.json (apps/web/build/pwa-share.ts) and the
// Worker reads the one it needs from its own static assets.

/** One dish in share/dishes.json. Keep in sync with apps/web/build/pwa-share.ts (ShareIndexDish). */
export type ShareDish = {
  name: string;
  restaurant: string;
  kiez: string;
  /** EUR, null when the menu lists no price. */
  price: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Health score 0 to 100. */
  score: number;
  /** True for AI estimates, false for the restaurant's official values. */
  estimate: boolean;
  /** Hashed static asset path of the dish image (/assets/...), null without one. */
  image: string | null;
};

const DISH_ID = /^[\w.-]{1,128}$/;
const MAX_REMEMBERED = 500;
const remembered = new Map<string, ShareDish | null>();
let testDishes: Map<string, ShareDish> | null = null;

/**
 * One dish from share/dishes/<id>.json in the static assets, remembered per isolate. Only that dish's small
 * file is read and parsed: the whole index would cost about the 10 ms CPU of a Workers Free request.
 */
export async function findShareDish(env: Env, id: string): Promise<ShareDish | null> {
  if (testDishes) return testDishes.get(id) ?? null;
  if (!DISH_ID.test(id)) return null;
  if (remembered.has(id)) return remembered.get(id)!;
  const response = await env.ASSETS.fetch(new Request(`https://assets.local/share/dishes/${id}.json`));
  if (!response.ok && response.status !== 404) throw new Error(`dish asset ${response.status}`);
  // A missing dish file or web build leaves no shareable record.
  const dish = response.ok && (response.headers.get("content-type") ?? "").includes("json") ? ((await response.json()) as ShareDish) : null;
  if (remembered.size >= MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
  remembered.set(id, dish);
  return dish;
}

/** Tests: serve these dishes instead of the build's files. */
export function setShareDishesForTests(dishes: Record<string, ShareDish> | null): void {
  testDishes = dishes ? new Map(Object.entries(dishes)) : null;
  remembered.clear();
}

/** Bytes of a dish image from the static assets, as a data URL the SVG renderer can embed. */
export async function imageDataUrl(env: Env, path: string | null): Promise<string | null> {
  if (!path || !/^\/assets\/[\w.-]+\.(jpe?g|png)$/i.test(path)) return null;
  const response = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const type = /\.png$/i.test(path) ? "image/png" : "image/jpeg";
  return `data:${type};base64,${btoa(binary)}`;
}
