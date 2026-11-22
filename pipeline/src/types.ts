// Shared pipeline types. packages/contract/ does not exist yet; when it lands, the seed types at the
// bottom move there and the web app imports them from one place.

export interface LatLng { lat: number; lng: number }
export interface BBox { south: number; west: number; north: number; east: number }

/**
 * Per-restaurant queue status, in stage order. `candidate` is the pre-stage for OSM rows that have
 * not passed the Places filter yet (rating >= 4.3, operational). A restaurant parked by a stage keeps
 * its status and gets a `skip_reason`.
 */
export const STATUSES = ['candidate', 'found', 'menu', 'nutrition', 'checked', 'image', 'approved'] as const;
export type RestaurantStatus = (typeof STATUSES)[number];

export type SkipReason =
  | 'no_places_match' | 'below_rating' | 'not_operational' | 'no_website' | 'website_unreachable'
  | 'robots_disallowed' | 'js_rendered' | 'aggregator_only' | 'no_menu' | 'menu_unreadable'
  | 'rejected_check' | 'review_failed' | 'outside_kiez';

export type Confidence = 'high' | 'medium' | 'low';
export type NutritionSource = 'official' | 'ai';

export const DISH_CATEGORIES = ['bowl', 'salad', 'main', 'soup', 'wrap', 'sandwich', 'burger', 'pizza', 'pasta', 'starter', 'side', 'breakfast', 'dessert', 'snack'] as const;
export type DishCategory = (typeof DISH_CATEGORIES)[number];

/** Stored restaurant base record from OpenStreetMap (ODbL). */
export interface OsmRestaurant {
  osmId: string; // "node/123", "way/456"
  name: string;
  lat: number;
  lng: number;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  cuisine: string[];
  openingHours: string | null; // raw OSM opening_hours
  website: string | null;
  amenity: string;
  dietVegan: string | null;
  dietVegetarian: string | null;
}

/**
 * A Google Places search hit. Transient by policy: only `placeId` may be stored. Rating, website and
 * location are used in memory to filter and match, then dropped.
 */
export interface PlacesCandidate {
  placeId: string;
  name: string;
  location: LatLng;
  rating: number | null;
  userRatingCount: number | null;
  websiteUri: string | null;
  businessStatus: string | null;
}

export interface PrintedNutrition { kcal: number; protein: number | null; carbs: number | null; fat: number | null }

/** One dish as read from the restaurant's own menu (stage 2). */
export interface ExtractedDish {
  sourceIndex?: number;
  name: string;
  description: string;
  section: string;
  /** German description and section heading for the app (null when the model gave none). */
  descriptionDe: string | null;
  sectionDe: string | null;
  category: DishCategory;
  priceEur: number | null;
  /** Values printed by the restaurant itself (menu or nutrition sheet); these replace estimates. */
  printed: PrintedNutrition | null;
}

export interface Ingredient { food: string; grams: number; note?: string }

export interface Macros { kcal: number; protein: number; carbs: number; fat: number }
export interface NutrientTotals extends Macros { fiber: number; sugar: number; satFat: number; sodiumMg: number }
export interface Range { min: number; max: number }

export interface NutritionResult {
  totals: NutrientTotals;
  range: { kcal: Range; protein: Range; carbs: Range; fat: Range };
  confidence: Confidence;
  source: NutritionSource;
  methodNote: string;
  unmatched: string[];
  totalGrams: number;
  vegShare: number;
  healthScore: number;
  proteinPerEuro: number | null;
}

// ---- Seed export (the web app contract; mirror of apps/web/src/data/contract.ts once it lands) ----

export interface SeedRestaurant {
  id: string;
  googlePlaceId: string | null;
  osmId: string;
  name: string;
  kiez: string;
  kiezName: string;
  lat: number;
  lng: number;
  address: string | null;
  cuisine: string[];
  openingHours: string | null;
  website: string | null;
  menuSource: { url: string | null; kind: string; fetchedAt: string } | null;
  checkConfidence: Confidence | null;
  reviewed: boolean;
  dishes: SeedDish[];
  attribution: string[];
}

export interface SeedNutrient { value: number; min: number; max: number }

export interface SeedDish {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  section: string;
  category: DishCategory;
  priceEur: number | null;
  nutrition: { kcal: SeedNutrient; protein: SeedNutrient; carbs: SeedNutrient; fat: SeedNutrient };
  confidence: Confidence;
  source: NutritionSource;
  methodNote: string;
  ingredients: Ingredient[];
  healthScore: number;
  proteinPerEuro: number | null;
  image: { kind: 'ai'; ref: string; label: 'KI-Bild' } | null;
}
