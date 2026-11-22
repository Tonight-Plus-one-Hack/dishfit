import type { Confidence, Dish, KiezSlug, MenuSourceKind, NutritionSource, OpeningHours, Restaurant, RestaurantSummary } from "@wohin/contract";

/** D1 rows and their mapping to the contract. Only published rows ever reach a client. */

export type RestaurantRow = {
  id: string;
  google_place_id: string | null;
  name: string;
  kiez: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  website_url: string | null;
  logo_url: string | null;
  opening_hours: string | null;
};

export const RESTAURANT_COLUMNS = "r.id, r.google_place_id, r.name, r.kiez, r.lat, r.lng, r.address, r.website_url, r.opening_hours, r.logo_url";

export type DishRow = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number | null;
  kcal: number;
  kcal_min: number;
  kcal_max: number;
  protein_g: number;
  protein_g_min: number;
  protein_g_max: number;
  carbs_g: number;
  carbs_g_min: number;
  carbs_g_max: number;
  fat_g: number;
  fat_g_min: number;
  fat_g_max: number;
  nutrition_source: NutritionSource;
  confidence: Confidence;
  method_note: string;
  estimated_at: number;
  health_score: number | null;
  protein_per_euro: number | null;
  ai_image_key: string | null;
  source_kind: MenuSourceKind | null;
  source_url: string | null;
  source_fetched_at: number | null;
  community_added_at: number | null;
};

export const DISH_COLUMNS = `d.id, d.restaurant_id, d.name, d.description, d.category, d.price_cents,
  d.kcal, d.kcal_min, d.kcal_max, d.protein_g, d.protein_g_min, d.protein_g_max,
  d.carbs_g, d.carbs_g_min, d.carbs_g_max, d.fat_g, d.fat_g_min, d.fat_g_max,
  d.nutrition_source, d.confidence, d.method_note, d.estimated_at, d.health_score, d.protein_per_euro,
  d.ai_image_key, d.community_added_at,
  m.kind AS source_kind, m.url AS source_url, m.fetched_at AS source_fetched_at`;

/** Joins the menu source for DISH_COLUMNS. */
export const DISH_SOURCE_JOIN = "LEFT JOIN menu_sources m ON m.id = d.menu_source_id";

function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function toRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    googlePlaceId: row.google_place_id,
    name: row.name,
    kiez: row.kiez as KiezSlug,
    location: row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng },
    address: row.address,
    websiteUrl: row.website_url,
    ...(row.logo_url === null ? {} : { logoUrl: row.logo_url }),
    openingHours: parseJson<OpeningHours | null>(row.opening_hours, null),
  };
}

export function toSummary(r: Restaurant): RestaurantSummary {
  return { id: r.id, name: r.name, kiez: r.kiez, location: r.location };
}

export function toDish(row: DishRow): Dish {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    description: row.description,
    category: row.category,
    priceCents: row.price_cents,
    nutrition: {
      kcal: { value: row.kcal, min: row.kcal_min, max: row.kcal_max },
      proteinG: { value: row.protein_g, min: row.protein_g_min, max: row.protein_g_max },
      carbsG: { value: row.carbs_g, min: row.carbs_g_min, max: row.carbs_g_max },
      fatG: { value: row.fat_g, min: row.fat_g_min, max: row.fat_g_max },
      source: row.nutrition_source,
      confidence: row.confidence,
      method: row.method_note,
      estimatedAt: new Date(row.estimated_at).toISOString(),
    },
    healthScore: row.health_score,
    proteinPerEuro: row.protein_per_euro,
    image: row.ai_image_key ? { kind: "ai", key: row.ai_image_key } : null,
    menuSource:
      row.source_kind && row.source_fetched_at !== null
        ? { kind: row.source_kind, url: row.source_url, fetchedAt: new Date(row.source_fetched_at).toISOString() }
        : null,
    ...(row.community_added_at === null ? {} : { community: { addedAt: new Date(row.community_added_at).toISOString() } }),
  };
}
