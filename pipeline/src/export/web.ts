// Compact seed for the web bundle (apps/web/src/data/seed/pipeline.ts expands it into contract objects).
// Dishes are nested under their restaurant, numbers are arrays and repeated strings (methods,
// ingredient names) live in tables, which keeps ~3000 dishes near 1 MB instead of 3.7 MB.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { HEALTHY_RULES, isHealthy, normalizeDishName, packDishClass, stripMenuNumber, unpackDishClass, type CompactDishClass } from '../../../packages/contract/src/dish-class.ts';
import type { Seed } from './seed.ts';

export interface WebSeedDish {
  id: string;
  name: string;
  description: string;
  price: number | null;
  category: string;
  /** kcal, protein, carbs, fat as [value, min, max] each, flattened (12 numbers). */
  n: number[];
  confidence: 'high' | 'medium' | 'low';
  source: 'official' | 'ai';
  /** Index into methods. */
  method: number;
  model: string | null;
  /** [index into ingredientNames, grams] */
  ingredients: [number, number][];
  healthScore: number;
  proteinPerEuro: number | null;
  diet: ('vegan' | 'vegetarian')[];
  /** Image file base name in seed/pipeline/images, or null. */
  image: string | null;
  /** Dish classification [course, dishType, cuisine, flags, confidence] (dish-class.ts packDishClass), absent until classified. */
  c?: CompactDishClass;
  sourceUrl?: string;
}

export interface WebSeedRestaurant {
  id: string;
  placeId: string | null;
  osmId: string | null;
  name: string;
  kiez: string;
  address: string;
  lat: number;
  lng: number;
  cuisine: string[];
  openingHours: Seed['restaurants'][number]['openingHours'];
  website: string | null;
  menu: { url: string; fetchedAt: string; kind: 'website' | 'user_snap' };
  dishes: WebSeedDish[];
}

export interface WebSeed {
  v: 1;
  generatedAt: string;
  attribution: string[];
  methods: string[];
  ingredientNames: string[];
  restaurants: WebSeedRestaurant[];
}

/** URL-safe restaurant id for /r/:id routes ("osm:node/123" -> "osm-node-123"). */
export const webRestaurantId = (id: string) => id.replace(/[^a-zA-Z0-9_-]+/g, '-');

function idx(table: string[], s: string): number {
  let i = table.indexOf(s);
  if (i < 0) { i = table.length; table.push(s); }
  return i;
}

export function toWebSeed(seed: Seed): WebSeed {
  const methods: string[] = [];
  const names: string[] = [];
  const dishesBy = new Map<string, Seed['dishes']>();
  for (const d of seed.dishes) dishesBy.set(d.restaurantId, [...(dishesBy.get(d.restaurantId) ?? []), d]);
  return {
    v: 1,
    generatedAt: seed.generatedAt,
    attribution: seed.attribution,
    methods,
    ingredientNames: names,
    restaurants: seed.restaurants.filter((r) => r.menu).map((r) => ({
      id: webRestaurantId(r.id), placeId: r.placeId, osmId: r.osmId, name: r.name, kiez: r.kiez, address: r.address,
      lat: Math.round(r.lat * 1e6) / 1e6, lng: Math.round(r.lng * 1e6) / 1e6, cuisine: r.cuisine, openingHours: r.openingHours, website: r.website, menu: r.menu!,
      dishes: dedupeDishes((dishesBy.get(r.id) ?? []).map((d) => ({
        id: d.id, name: stripMenuNumber(d.name), description: d.description, price: d.price, category: d.category,
        n: [d.nutrition.kcal, d.nutrition.protein, d.nutrition.carbs, d.nutrition.fat].flatMap((x) => [x.value, x.min, x.max]),
        confidence: d.nutrition.confidence, source: d.nutrition.source, method: idx(methods, d.nutrition.method), model: d.nutrition.model ?? null,
        ingredients: (d.nutrition.ingredients ?? []).map((i) => [idx(names, i.name), i.amount ?? 0] as [number, number]),
        healthScore: d.healthScore, proteinPerEuro: d.proteinPerEuro, diet: d.diet,
        image: d.image ? basename(d.image.ref).replace(/\.[a-z]+$/, '') : null,
        ...(d.dishClass ? { c: packDishClass(d.dishClass) } : {}),
        ...(d.sourceUrl ? { sourceUrl: d.sourceUrl } : {}),
      }))),
    })),
  };
}

/** Dishes of a restaurant that pass the healthy rule (classified, light enough, enough protein for a meal). */
export function healthyDishCount(r: Pick<WebSeedRestaurant, 'dishes'>): number {
  return r.dishes.filter((d) => isHealthy({ cls: d.c ? unpackDishClass(d.c) : null, kcal: d.n[0] ?? 0, proteinG: d.n[3] ?? 0 })).length;
}

/** Restaurants with at least `min` healthy dishes (HEALTHY_RULES.minDishesPerRestaurant by default). */
export function healthyRestaurantsOnly(web: WebSeed, min: number = HEALTHY_RULES.minDishesPerRestaurant): WebSeed {
  return { ...web, restaurants: web.restaurants.filter((r) => healthyDishCount(r) >= min) };
}

/**
 * Appends the restaurants of `add` to `base` (same Kiez, a later scan): the method and ingredient-name
 * indices of the added dishes are remapped into base's tables, and a restaurant base already holds
 * (same id, place id or OSM element) is skipped.
 */
export function mergeWebSeeds(base: WebSeed, add: WebSeed): WebSeed {
  const methods = [...base.methods];
  const names = [...base.ingredientNames];
  const ids = new Set(base.restaurants.map((r) => r.id));
  const placeIds = new Set(base.restaurants.map((r) => r.placeId).filter(Boolean));
  const osmIds = new Set(base.restaurants.map((r) => r.osmId).filter(Boolean));
  const added = add.restaurants
    .filter((r) => !ids.has(r.id) && !(r.placeId && placeIds.has(r.placeId)) && !(r.osmId && osmIds.has(r.osmId)))
    .map((r) => ({
      ...r,
      dishes: r.dishes.map((d) => ({
        ...d,
        method: idx(methods, add.methods[d.method]!),
        ingredients: d.ingredients.map(([i, g]) => [idx(names, add.ingredientNames[i]!), g] as [number, number]),
      })),
    }));
  return { ...base, generatedAt: add.generatedAt, attribution: [...new Set([...base.attribution, ...add.attribution])], methods, ingredientNames: names, restaurants: [...base.restaurants, ...added] };
}

/** Image keys a web seed references. */
export function imageKeys(web: Pick<WebSeed, 'restaurants'>): Set<string> {
  return new Set(web.restaurants.flatMap((r) => r.dishes.map((d) => d.image)).filter((x): x is string => !!x));
}

/**
 * Copies referenced KI-Bild files (webp as generated) into outDir. A key that already has a file
 * (any extension, e.g. the 640 px JPEGs of wave 1) is kept, and other Kieze's files are never touched.
 */
export function copyImages(keys: Set<string>, srcDir: string, outDir: string): number {
  mkdirSync(outDir, { recursive: true });
  const present = new Set(readdirSync(outDir).map((f) => f.replace(/\.[a-z]+$/, '')));
  let n = 0;
  for (const key of keys) {
    if (!present.has(key)) {
      const src = join(srcDir, 'ai', `${key}.webp`);
      if (!existsSync(src)) throw new Error(`missing image ${src}`);
      copyFileSync(src, join(outDir, `${key}.webp`));
    }
    n++;
  }
  return n;
}

/** Removes image files whose key is in `candidates` but referenced by none of the given seeds. */
export function removeUnreferenced(candidates: Set<string>, stillUsed: Set<string>, outDir: string): number {
  if (!existsSync(outDir)) return 0;
  let n = 0;
  for (const f of readdirSync(outDir)) {
    const key = f.replace(/\.[a-z]+$/, '');
    if (candidates.has(key) && !stillUsed.has(key)) { rmSync(join(outDir, f)); n++; }
  }
  return n;
}

const CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 } as const;

/** How well a dish is sourced: official values first, then estimate confidence, a KI-Bild, a description, a price. */
export function sourceRank(d: Pick<WebSeedDish, 'source' | 'confidence' | 'image' | 'description' | 'price'>): number {
  return (d.source === 'official' ? 100 : 0) + CONFIDENCE_RANK[d.confidence] * 10 + (d.image ? 4 : 0) + (d.description ? 2 : 0) + (d.price != null ? 1 : 0);
}

/** One dish per normalised name within a restaurant's menu: the best-sourced copy, at the first copy's position. */
export function dedupeDishes<T extends Pick<WebSeedDish, 'name' | 'source' | 'confidence' | 'image' | 'description' | 'price'>>(dishes: T[]): T[] {
  const best = new Map<string, T>();
  for (const d of dishes) {
    const key = normalizeDishName(d.name);
    const kept = best.get(key);
    if (!kept || sourceRank(d) > sourceRank(kept)) best.set(key, d);
  }
  const placed = new Set<string>();
  const out: T[] = [];
  for (const d of dishes) {
    const key = normalizeDishName(d.name);
    if (placed.has(key)) continue;
    placed.add(key);
    out.push(best.get(key)!);
  }
  return out;
}
