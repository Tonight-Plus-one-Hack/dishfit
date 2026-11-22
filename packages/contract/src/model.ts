import type { KiezSlug } from "./kieze";

/** How sure we are about a nutrition estimate. */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** "official": published by the restaurant; "ai": our estimate (always labeled as such in the UI). */
export const NUTRITION_SOURCES = ["official", "ai"] as const;
export type NutritionSource = (typeof NUTRITION_SOURCES)[number];

/** A point estimate with its plausible range. */
export type Range = { value: number; min: number; max: number };

export type Nutrition = {
  kcal: Range;
  proteinG: Range;
  carbsG: Range;
  fatG: Range;
  source: NutritionSource;
  confidence: Confidence;
  /** Plain-language answer to "How is this calculated?". */
  method: string;
  /** ISO time of the estimate or of the official value's retrieval. */
  estimatedAt: string;
};

/**
 * A dish image. Today only AI images in the brand look (stored in R2, always
 * labeled "AI image"). Google Places photos are never stored or referenced in
 * our data; the web app shows them live through Google's own components.
 */
export type DishImage = { kind: "ai"; key: string };

export const MENU_SOURCE_KINDS = [
  "website_html",
  "website_pdf",
  "website_image",
  "official_nutrition",
  "manual",
] as const;
export type MenuSourceKind = (typeof MENU_SOURCE_KINDS)[number];

export type MenuSource = { kind: MenuSourceKind; url: string | null; fetchedAt: string };

/** Opening hours, in the shape Google Places uses: day 0 is Sunday; a period without close means open around the clock. */
export type DayTime = { day: number; hour: number; minute: number };
export type OpeningPeriod = { open: DayTime; close?: DayTime | null };
export type OpeningHours = { periods: OpeningPeriod[] };

export type LatLng = { lat: number; lng: number };

/**
 * A restaurant. All fields are our own data except googlePlaceId, the only
 * Google value we store: the web app passes it to Google's own components to
 * show the rating, photos and reviews live with Google's attribution.
 */
export type Restaurant = {
  id: string;
  googlePlaceId: string | null;
  name: string;
  kiez: KiezSlug;
  /** null when we have no coordinates: not on the map, still in Kiez lists. */
  location: LatLng | null;
  address: string | null;
  websiteUrl: string | null;
  /** Static tile from the restaurant's own website, when available. */
  logoUrl?: string;
  openingHours: OpeningHours | null;
};

export type Dish = {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  category: string | null;
  /** Price in euro cents; null when the menu shows no price. */
  priceCents: number | null;
  nutrition: Nutrition;
  /** 0 to 100, higher is healthier. */
  healthScore: number | null;
  /** Grams of protein per euro from the point estimate; null without a price. */
  proteinPerEuro: number | null;
  image: DishImage | null;
  menuSource: MenuSource | null;
  /** Set when the dish was read from a guest's menu photo (community scan); the app shows a "Community" badge with the date. */
  community?: { addedAt: string };
};

/** Restaurant fields shown next to a dish in lists. */
export type RestaurantSummary = Pick<Restaurant, "id" | "name" | "kiez" | "location">;
