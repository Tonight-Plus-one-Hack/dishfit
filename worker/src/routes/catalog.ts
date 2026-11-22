import {
  boundingBox,
  distanceMeters,
  isOpenAt,
  KIEZE,
  parseRestaurantsQuery,
  parseTopDishesQuery,
  type DishListItem,
  type DishResponse,
  type DishSort,
  type KiezeResponse,
  type LatLng,
  type Restaurant,
  type RestaurantListItem,
  type RestaurantResponse,
  type RestaurantsResponse,
  type TopDishesResponse,
} from "@wohin/contract";
import {
  DISH_COLUMNS,
  DISH_SOURCE_JOIN,
  RESTAURANT_COLUMNS,
  toDish,
  toRestaurant,
  toSummary,
  type DishRow,
  type RestaurantRow,
} from "../db";
import { badRequest, json, notFound, type RouteContext } from "../lib/http";

/** Dishes the healthy rule hides stay in D1 but are never served. */
const NOT_HIDDEN = "(d.healthy IS NULL OR d.healthy = 1)";

/** Upper bound of candidates read before the open-now and radius filters run in code. */
const CANDIDATES = 500;
const DEFAULT_TOP_LIMIT = 20;

const ORDER: Record<DishSort, string> = {
  protein: "d.protein_g DESC, d.price_cents ASC NULLS LAST",
  protein_per_euro: "d.protein_per_euro DESC NULLS LAST, d.protein_g DESC",
  health: "d.health_score DESC NULLS LAST, d.protein_g DESC",
  price: "d.price_cents ASC NULLS LAST, d.protein_g DESC",
};

type Where = { clauses: string[]; binds: unknown[] };

function placeWhere(where: Where, filters: { kiez?: string; near?: LatLng; radiusM?: number }): void {
  if (filters.kiez) {
    where.clauses.push("r.kiez = ?");
    where.binds.push(filters.kiez);
  }
  if (filters.near && filters.radiusM !== undefined) {
    const box = boundingBox(filters.near, filters.radiusM);
    where.clauses.push("r.lat BETWEEN ? AND ?", "r.lng BETWEEN ? AND ?");
    where.binds.push(box.minLat, box.maxLat, box.minLng, box.maxLng);
  }
}

/** Distance, open-now and radius for one restaurant; null when it is filtered out. */
function placeFacts(
  restaurant: Restaurant,
  filters: { near?: LatLng; radiusM?: number; openNow?: boolean },
  now: Date,
): { distanceM: number | null; openNow: boolean | null } | null {
  const distanceM = filters.near && restaurant.location ? distanceMeters(filters.near, restaurant.location) : null;
  if (filters.radiusM !== undefined && (distanceM === null || distanceM > filters.radiusM)) return null;
  const openNow = isOpenAt(restaurant.openingHours, now);
  if (filters.openNow && openNow !== true) return null;
  return { distanceM, openNow };
}

async function publishedRestaurants(db: D1Database, ids: string[]): Promise<Map<string, Restaurant>> {
  if (ids.length === 0) return new Map();
  const { results } = await db
    .prepare(`SELECT ${RESTAURANT_COLUMNS} FROM restaurants r WHERE r.published_at IS NOT NULL AND r.id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(ids))
    .all<RestaurantRow>();
  return new Map(results.map((row) => [row.id, toRestaurant(row)]));
}

/** GET /api/kieze */
export async function listKieze({ env }: RouteContext): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT kiez, count(*) AS n FROM restaurants WHERE published_at IS NOT NULL GROUP BY kiez",
  ).all<{ kiez: string; n: number }>();
  const counts = new Map(results.map((r) => [r.kiez, r.n]));
  return json({ kieze: KIEZE.map((k) => ({ ...k, restaurantCount: counts.get(k.slug) ?? 0 })) } satisfies KiezeResponse);
}

/** GET /api/dishes/top: the best dishes for the filters, e.g. most protein under 12 EUR near the user. */
export async function topDishes({ env, url }: RouteContext): Promise<Response> {
  const parsed = parseTopDishesQuery(url.searchParams);
  if (!parsed.ok) return badRequest(parsed.message);
  const q = parsed.value;
  const limit = q.limit ?? DEFAULT_TOP_LIMIT;
  // Healthy dishes only (packages/contract/src/dish-class.ts HEALTHY_RULES, stored as dishes.healthy); a row the
  // classifier has not reached yet (healthy IS NULL) still shows until the pipeline re-publishes it.
  const where: Where = { clauses: ["d.published_at IS NOT NULL", "r.published_at IS NOT NULL", NOT_HIDDEN], binds: [] };
  if (q.maxPriceCents !== undefined) {
    where.clauses.push("d.price_cents <= ?");
    where.binds.push(q.maxPriceCents);
  }
  if (q.maxKcal !== undefined) {
    where.clauses.push("d.kcal <= ?");
    where.binds.push(q.maxKcal);
  }
  if (q.minProteinG !== undefined) {
    where.clauses.push("d.protein_g >= ?");
    where.binds.push(q.minProteinG);
  }
  placeWhere(where, q);
  const postFilter = q.openNow === true || q.radiusM !== undefined;
  const { results } = await env.DB.prepare(
    `SELECT ${DISH_COLUMNS} FROM dishes d JOIN restaurants r ON r.id = d.restaurant_id ${DISH_SOURCE_JOIN}
      WHERE ${where.clauses.join(" AND ")} ORDER BY ${ORDER[q.sort ?? "protein"]}, d.id LIMIT ?`,
  )
    .bind(...where.binds, postFilter ? CANDIDATES : limit)
    .all<DishRow>();
  const restaurants = await publishedRestaurants(env.DB, [...new Set(results.map((d) => d.restaurant_id))]);
  const now = new Date();
  const dishes: DishListItem[] = [];
  for (const row of results) {
    const restaurant = restaurants.get(row.restaurant_id);
    const facts = restaurant ? placeFacts(restaurant, q, now) : null;
    if (!restaurant || !facts) continue;
    dishes.push({ ...toDish(row), restaurant: toSummary(restaurant), ...facts });
    if (dishes.length >= limit) break;
  }
  return json({ dishes, generatedAt: now.toISOString() } satisfies TopDishesResponse);
}

/** GET /api/restaurants: published restaurants, most dishes first, or nearest first when the user's position is given. */
export async function listRestaurants({ env, url }: RouteContext): Promise<Response> {
  const parsed = parseRestaurantsQuery(url.searchParams);
  if (!parsed.ok) return badRequest(parsed.message);
  const q = parsed.value;
  const where: Where = { clauses: ["r.published_at IS NOT NULL"], binds: [] };
  placeWhere(where, q);
  const { results } = await env.DB.prepare(
    `SELECT ${RESTAURANT_COLUMNS},
            (SELECT count(*) FROM dishes d WHERE d.restaurant_id = r.id AND d.published_at IS NOT NULL AND ${NOT_HIDDEN}) AS dish_count
       FROM restaurants r WHERE ${where.clauses.join(" AND ")}
      ORDER BY dish_count DESC, r.name LIMIT ?`,
  )
    .bind(...where.binds, CANDIDATES)
    .all<RestaurantRow & { dish_count: number }>();
  const now = new Date();
  const restaurants: RestaurantListItem[] = [];
  for (const row of results) {
    const restaurant = toRestaurant(row);
    const facts = placeFacts(restaurant, q, now);
    if (facts) restaurants.push({ ...restaurant, dishCount: row.dish_count, ...facts });
  }
  // Nearest first; restaurants without coordinates go last.
  if (q.near) restaurants.sort((a, b) => (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY));
  return json({ restaurants } satisfies RestaurantsResponse);
}

/** GET /api/restaurants/:id: one restaurant with its published dishes. */
export async function getRestaurant({ env, params }: RouteContext): Promise<Response> {
  const id = params.id ?? "";
  const restaurant = (await publishedRestaurants(env.DB, [id])).get(id);
  if (!restaurant) return notFound("Restaurant not found");
  const { results } = await env.DB.prepare(
    `SELECT ${DISH_COLUMNS} FROM dishes d ${DISH_SOURCE_JOIN}
      WHERE d.restaurant_id = ? AND d.published_at IS NOT NULL AND ${NOT_HIDDEN} ORDER BY d.category NULLS LAST, d.name`,
  )
    .bind(id)
    .all<DishRow>();
  return json({ restaurant, dishes: results.map(toDish), openNow: isOpenAt(restaurant.openingHours, new Date()) } satisfies RestaurantResponse);
}

/** GET /api/dishes/:id */
export async function getDish({ env, params }: RouteContext): Promise<Response> {
  const row = await env.DB.prepare(`SELECT ${DISH_COLUMNS} FROM dishes d ${DISH_SOURCE_JOIN} WHERE d.id = ? AND d.published_at IS NOT NULL AND ${NOT_HIDDEN}`)
    .bind(params.id ?? "")
    .first<DishRow>();
  const restaurant = row ? (await publishedRestaurants(env.DB, [row.restaurant_id])).get(row.restaurant_id) : undefined;
  if (!row || !restaurant) return notFound("Dish not found");
  return json({ dish: toDish(row), restaurant, openNow: isOpenAt(restaurant.openingHours, new Date()) } satisfies DishResponse);
}
