import { isKiezSlug, type KiezSlug } from "./kieze";
import type { Dish, LatLng, Restaurant, RestaurantSummary } from "./model";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = [
  "bad_request",
  "forbidden",
  "not_found",
  "rate_limited",
  "unavailable",
  "internal",
  // Uploads (POST /api/submissions): 413 and 415.
  "payload_too_large",
  "unsupported_media_type",
  // Photo uploads paused for the rest of the UTC day (soft guard below the KV Free write limit): 503.
  "storage_limit",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ApiError = { error: { code: ApiErrorCode; message: string } };

// ---------------------------------------------------------------------------
// GET /api/dishes/top: "best protein dishes under 12 EUR near you"
// ---------------------------------------------------------------------------

export const DISH_SORTS = ["protein", "protein_per_euro", "health", "price"] as const;
export type DishSort = (typeof DISH_SORTS)[number];

export const TOP_DISHES_MAX_LIMIT = 50;
export const MAX_RADIUS_M = 20_000;

export type TopDishesQuery = {
  maxPriceCents?: number;
  maxKcal?: number;
  minProteinG?: number;
  kiez?: KiezSlug;
  /** The user's position: adds distanceM and allows radiusM. */
  near?: LatLng;
  radiusM?: number;
  openNow?: boolean;
  sort?: DishSort;
  limit?: number;
};

export type DishListItem = Dish & {
  restaurant: RestaurantSummary;
  /** Meters from `near`; null without a position or without restaurant coordinates. */
  distanceM: number | null;
  /** null when the restaurant's opening hours are unknown. */
  openNow: boolean | null;
};

export type TopDishesResponse = { dishes: DishListItem[]; generatedAt: string };

/** Query string for GET /api/dishes/top. */
export function topDishesSearchParams(query: TopDishesQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.maxPriceCents !== undefined) params.set("maxPriceCents", String(query.maxPriceCents));
  if (query.maxKcal !== undefined) params.set("maxKcal", String(query.maxKcal));
  if (query.minProteinG !== undefined) params.set("minProteinG", String(query.minProteinG));
  if (query.kiez) params.set("kiez", query.kiez);
  if (query.near) {
    params.set("lat", String(query.near.lat));
    params.set("lng", String(query.near.lng));
  }
  if (query.radiusM !== undefined) params.set("radiusM", String(query.radiusM));
  if (query.openNow) params.set("openNow", "1");
  if (query.sort) params.set("sort", query.sort);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  return params;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function nonNegative(params: URLSearchParams, name: string, max: number): ParseResult<number | undefined> {
  const raw = params.get(name);
  if (raw === null || raw === "") return { ok: true, value: undefined };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > max) return { ok: false, message: `${name} must be a number from 0 to ${max}` };
  return { ok: true, value };
}

/** Reads the near/kiez part shared by the dish and restaurant lists. */
function placeFilters(params: URLSearchParams): ParseResult<{ kiez?: KiezSlug; near?: LatLng; radiusM?: number; openNow?: boolean }> {
  const kiez = params.get("kiez") || undefined;
  if (kiez !== undefined && !isKiezSlug(kiez)) return { ok: false, message: "Unknown kiez" };
  const lat = params.get("lat");
  const lng = params.get("lng");
  let near: LatLng | undefined;
  if (lat !== null || lng !== null) {
    const point = { lat: Number(lat), lng: Number(lng) };
    if (lat === null || lng === null || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
      return { ok: false, message: "lat and lng must be valid coordinates" };
    }
    near = point;
  }
  const radius = nonNegative(params, "radiusM", MAX_RADIUS_M);
  if (!radius.ok) return radius;
  if (radius.value !== undefined && !near) return { ok: false, message: "radiusM needs lat and lng" };
  const openNow = params.get("openNow");
  return { ok: true, value: { kiez, near, radiusM: radius.value, openNow: openNow === "1" || openNow === "true" ? true : undefined } };
}

export function parseTopDishesQuery(params: URLSearchParams): ParseResult<TopDishesQuery> {
  const place = placeFilters(params);
  if (!place.ok) return place;
  const maxPriceCents = nonNegative(params, "maxPriceCents", 100_000);
  if (!maxPriceCents.ok) return maxPriceCents;
  const maxKcal = nonNegative(params, "maxKcal", 10_000);
  if (!maxKcal.ok) return maxKcal;
  const minProteinG = nonNegative(params, "minProteinG", 1_000);
  if (!minProteinG.ok) return minProteinG;
  const limit = nonNegative(params, "limit", TOP_DISHES_MAX_LIMIT);
  if (!limit.ok) return limit;
  const sort = params.get("sort") || undefined;
  if (sort !== undefined && !(DISH_SORTS as readonly string[]).includes(sort)) return { ok: false, message: "Unknown sort" };
  return {
    ok: true,
    value: {
      ...place.value,
      maxPriceCents: maxPriceCents.value,
      maxKcal: maxKcal.value,
      minProteinG: minProteinG.value,
      sort: sort as DishSort | undefined,
      limit: limit.value === undefined ? undefined : Math.max(1, Math.floor(limit.value)),
    },
  };
}

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

export type RestaurantsQuery = { kiez?: KiezSlug; near?: LatLng; radiusM?: number; openNow?: boolean };

export type RestaurantListItem = Restaurant & { dishCount: number; distanceM: number | null; openNow: boolean | null };

export type RestaurantsResponse = { restaurants: RestaurantListItem[] };
export type RestaurantResponse = { restaurant: Restaurant; dishes: Dish[]; openNow: boolean | null };
export type DishResponse = { dish: Dish; restaurant: Restaurant; openNow: boolean | null };

export function restaurantsSearchParams(query: RestaurantsQuery): URLSearchParams {
  return topDishesSearchParams(query);
}

export function parseRestaurantsQuery(params: URLSearchParams): ParseResult<RestaurantsQuery> {
  return placeFilters(params);
}

export type KiezListItem = { slug: KiezSlug; name: string; wave: number; restaurantCount: number };
export type KiezeResponse = { kieze: KiezListItem[] };

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Where the browser loads an AI dish image (stored in R2). */
export function aiImageUrl(key: string): string {
  return `/api/images/${key}`;
}

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------

export const EVENT_NAMES = [
  "app_open",
  "onboarding_step",
  "onboarding_complete",
  "filter_change",
  "map_open",
  "restaurant_view",
  "dish_view",
  "how_calculated_open",
  "directions_tap",
  "share_tap",
  "menu_tap",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Existing browser storage key shared by the web app and the team exclusion page. */
export const ANON_ID_STORAGE_KEY = "dishfit.anon.v1";
export const ANON_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_EVENTS_PER_REQUEST = 20;
export const MAX_EVENT_PROPS_BYTES = 1000;

export type AppEvent = {
  name: EventName;
  /** ISO time on the device; the server time is stored too. */
  at?: string;
  /** Random id kept on the device, never linked to a person. */
  anonId?: string;
  props?: Record<string, string | number | boolean | null>;
};
export type EventsRequest = { events: AppEvent[] };
export type EventsResponse = { accepted: number };

/** Public aggregate counts of distinct devices, with team devices excluded. */
export type NumbersResponse = {
  engaged: number;
  decided: number;
  shared: number;
  visitors: number;
  since: string;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// GET /api/admin/ai-usage (admin token)
// ---------------------------------------------------------------------------

export type UsageModelTotal = {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  units: number;
  usd: number;
  /** false when at least one call had no known price (counted as 0 here, at the highest rate in the budget). */
  priced: boolean;
};

export type AiUsageResponse = {
  generatedAt: string;
  totalUsd: number;
  calls: number;
  byModel: UsageModelTotal[];
  byKiez: Array<{ kiez: string | null; calls: number; usd: number }>;
  today: { since: string; usd: number; budgetUsd: number; exhausted: boolean };
  lastHour: { calls: number; failed: number; failedShare: number; warning: boolean };
};
