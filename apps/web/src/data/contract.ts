// The data contract between the screens and the backend (D1 + Worker later, the seed module now).
// Screens import types from here and data only through src/data/api.ts.
// Append-only for screen workers: add optional fields or new types, never rename or remove.
import { KIEZE as CATALOG_KIEZE, type Kiez as CatalogKiez } from '../../../../packages/contract/src/kieze'
import type { Category } from '../lib/category'
import type { MapCategory } from '../lib/map-category'
import type { Course, DishClass, DishType } from './dishClass'

export type Kiez = CatalogKiez['name']

/** Berlin neighbourhoods the app filters by: the shared catalog, in its order. */
export const KIEZE: readonly Kiez[] = CATALOG_KIEZE.map((k) => k.name)

export type Confidence = 'high' | 'medium' | 'low'

/** official: published by the restaurant or chain. ai: estimated by a model from the menu text. */
export type NutritionSource = 'official' | 'ai'

/** A value with its plausible range. For official values min and max sit close to the value. */
export interface Range {
  value: number
  min: number
  max: number
}

export interface NutritionEstimate {
  kcal: Range
  /** Grams. */
  protein: Range
  /** Grams. */
  carbs: Range
  /** Grams. */
  fat: Range
  confidence: Confidence
  source: NutritionSource
  /** Plain-language note on how the numbers came about: portion assumptions, what was counted. */
  method: string
  /** The model that produced an AI estimate, for the "How is this calculated?" sheet. */
  model?: string
  /** Assumed portion, ingredient by ingredient, as the estimate counted it. Missing until the pipeline returns it. */
  ingredients?: Ingredient[]
}

/** Where a menu or nutrition value came from and when we read it. */
export interface MenuSource {
  url: string
  /** ISO 8601 date-time of the fetch. */
  fetchedAt: string
  /** website: the restaurant's own site (HTML, PDF or image). user_snap: a menu photo a user sent in. */
  kind: 'website' | 'user_snap'
}

/** Dish artwork. Only our own AI illustrations, always shown with the "KI-Bild" label; never Google photos. */
export interface DishImage {
  kind: 'ai'
  /** App-relative or CDN URL of the generated image. */
  ref: string
  alt: string
}

/** Opening hours in the Google Places regularOpeningHours shape, but read from OSM tags or the restaurant website. day: 0 Sunday to 6 Saturday. */
export interface OpeningPeriod {
  open: { day: number; hour: number; minute: number }
  /** Missing for places open around the clock. A close on a later day means past midnight. */
  close?: { day: number; hour: number; minute: number }
}

export interface OpeningHours {
  periods: OpeningPeriod[]
  /** Human-readable lines as published, e.g. "Mo-Fr 11:00-21:30". */
  weekdayText: string[]
}

/**
 * Data rules (EEA Places terms): our own base data comes from OpenStreetMap and the restaurant's website.
 * The only stored Google field is placeId. Rating, price level, photos and Google opening hours are never stored;
 * the restaurant screen shows them live through the Places UI Kit with Google attribution, keyed by placeId.
 */
export interface Restaurant {
  id: string
  /** Google Places place_id, the only stored Google field. Null until the place is matched. */
  placeId: string | null
  /** OpenStreetMap element, e.g. "node/3036860655" (© OpenStreetMap contributors, ODbL). */
  osmId: string | null
  name: string
  kiez: Kiez
  address: string
  lat: number
  lng: number
  cuisine: string[]
  /** From OSM tags or the restaurant website. Null means unknown: "open now" then excludes the place. */
  openingHours: OpeningHours | null
  /** Where name, address, coordinates and hours come from. */
  baseSource: 'osm' | 'website' | 'test'
  website: string | null
  /** Local tile from the restaurant's own website. */
  logoUrl?: string
  /** The menu the dishes were read from, null when we have no menu yet. */
  menu: MenuSource | null
  /** Seed data that does not describe a real place or real values. The UI shows a Testdaten badge. */
  isTestData: boolean
  /** The clay icon on its pin and card, derived from its healthy dishes (lib/category restaurantCategory). */
  category?: Category
  /** Specialty classified from the healthy menu for the map legend and filter. */
  mapCategory?: MapCategory
}

export interface Dish {
  id: string
  restaurantId: string
  name: string
  description: string
  /** Optional English menu description supplied with source data. */
  descriptionEn?: string | null
  /** EUR, null when the menu lists no price (chains with per-branch prices). */
  price: number | null
  /** Menu section as printed, e.g. "Bowls". */
  category: string
  nutrition: NutritionEstimate
  /** 0 to 100, see src/data/scoring.ts. */
  healthScore: number
  /** Grams of protein per euro from the lower end of the protein range, null without a price. */
  proteinPerEuro: number | null
  diet: Array<'vegan' | 'vegetarian'>
  menuSource: MenuSource
  image: DishImage | null
  isTestData: boolean
  /**
   * Course, dish type, cuisine, diet flags and whole meal (packages/contract/src/dish-class.ts). Every dish the app
   * serves has one: the pipeline classifier's, or a low-confidence guess for hand-made seed records.
   */
  dishClass?: DishClass
}

// ---------- Query shapes ----------

export interface LatLng {
  lat: number
  lng: number
}

/**
 * protein and proteinPerEuro rank on the lower end of the protein range, so optimistic estimates do not win.
 * 'best' is the default health-first ranking (data/scoring.ts: rankScore).
 * Every sort puts open restaurants first, then unknown hours, then closed ones.
 */
export type DishSort = 'best' | 'protein' | 'proteinPerEuro' | 'healthScore' | 'price' | 'kcal' | 'distance'

export interface DishFilters {
  /** Free text over dish name, description, category and the restaurant's name, raw cuisine tags and Kiez. */
  q?: string
  kcalMin?: number
  kcalMax?: number
  /** Grams, compared with the point estimate the cards show ("ca. 48 g"), not the lower end of the range. */
  proteinMin?: number
  priceMax?: number
  /** Only restaurants open at `now` (defaults to the current time). */
  openNow?: boolean
  now?: Date
  /** Origin for distances, usually the user's position. */
  near?: LatLng
  /** Local discovery ranking groups results into one-kilometre bands before applying the existing sort. */
  distanceBands?: boolean
  /** Metres from `near`. */
  maxDistance?: number
  kiez?: Kiez[]
  mapCategory?: MapCategory
  diet?: Array<'vegan' | 'vegetarian'>
  /** Hide dishes whose estimate has low confidence. */
  minConfidence?: Confidence
  sort?: DishSort
  limit?: number
  healthScoreMin?: number
  /** Only these courses (Gang). */
  course?: Course[]
  /** Only these dish types (Gerichtstyp). */
  dishType?: DishType[]
  glutenFree?: boolean
  /** Only whole meals: the default ranking, so a side, a dip or a drink never leads a list. */
  fullMealsOnly?: boolean
}

/** A restaurant row for lists and the map. */
export interface RestaurantSummary extends Restaurant {
  /** Metres from filters.near, null without an origin. */
  distance: number | null
  openNow: boolean | null
  /** Dishes of this restaurant that match the filters. */
  matchingDishes: number
  totalDishes: number
  /** The best matching dish by the requested sort, for map cards. */
  topDish: Dish | null
}

/** A dish together with its restaurant, for feeds and search results. */
export interface DishResult {
  dish: Dish
  restaurant: Restaurant
  distance: number | null
  openNow: boolean | null
}

export interface RestaurantDetail {
  restaurant: Restaurant
  dishes: Dish[]
}

export interface DishDetail {
  dish: Dish
  restaurant: Restaurant
  /** Other dishes of the same restaurant, best health score first. */
  siblings: Dish[]
}

/** One ingredient of an estimated portion, e.g. 200 g cooked rice. */
export interface Ingredient {
  name: string
  /** Grams (or millilitres for liquids), null when the estimate names the ingredient without an amount. */
  amount: number | null
  unit: 'g' | 'ml'
}

// ---------- Community menu scans (Worker: POST /api/submissions) ----------

/** pending and review read "Wird geprüft" for the guest; published means the dishes are online. */
export type SubmissionStatus = 'pending' | 'review' | 'published' | 'rejected'

/** What the guest may see about their own menu photo. The photo itself is never returned. */
export interface SubmissionView {
  id: string
  status: SubmissionStatus
  /** German reason, only when rejected. */
  reason: string | null
  restaurant: { id: string | null; name: string; isNew: boolean }
  /** Dishes that went online from this photo (0 until reviewed). */
  dishCount: number
  /** ISO 8601. */
  createdAt: string
  decidedAt: string | null
}

export interface SubmissionConfig {
  /** False while uploads are paused; uploadsPaused says why. */
  uploadsEnabled: boolean
  /** daily_limit: today's photo write budget is used up (Workers KV Free); unavailable: no photo storage on this deploy. */
  uploadsPaused: 'daily_limit' | 'unavailable' | null
  /** Cloudflare Turnstile site key; null when the check is switched off. */
  turnstileSiteKey: string | null
  maxBytes: number
  acceptedTypes: string[]
}

/** A new place the guest adds: own data only, never Google's. */
export interface NewRestaurantInput {
  name: string
  lat: number
  lng: number
  address: string
}

/** A dish that came online from a guest's menu photo; shown with a "Community" badge and the date. */
export interface CommunityDish {
  id: string
  name: string
  description: string | null
  descriptionEn?: string | null
  priceCents: number | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  /** ISO 8601. */
  addedAt: string
}

// ---------- Community profile, confirmations, Kiez leaderboard (Worker: /api/me, /api/dishes/:id/confirmations, /api/leaderboard) ----------

export type BadgeKey = 'first_scan' | 'first_restaurant' | 'ten_confirmations'

/** A thank-you moment: earned once, celebrated once (seen). */
export interface Badge {
  key: BadgeKey
  title: string
  text: string
  /** ISO 8601; only on earned badges. */
  earnedAt?: string
  seen?: boolean
}

/** The anonymous device profile; account is filled once the magic-link upgrade exists. */
export interface CommunityProfile {
  id: string
  nickname: string
  nicknameCustom: boolean
  since: string
  account: { id: string } | null
}

export interface MyScan {
  id: string
  status: SubmissionStatus
  restaurant: { id: string | null; name: string; isNew: boolean }
  kiez: string | null
  dishCount: number
  createdAt: string
}

export interface MyConfirmation {
  dishId: string
  dishName: string | null
  restaurantId: string | null
  verdict: 'yes' | 'no'
  correction: string | null
  at: string
}

export interface MeView {
  /** null until the first contribution (scan, confirmation or nickname). */
  profile: CommunityProfile | null
  stats: { scans: number; publishedScans: number; restaurantsAdded: number; dishesOnline: number; confirmations: number }
  badges: Badge[]
  lockedBadges: Badge[]
  scans: MyScan[]
  confirmations: MyConfirmation[]
}

/** "Hat das gestimmt?" for one dish: shown as "von N bestätigt". */
export interface ConfirmationTally {
  dishId: string
  yes: number
  no: number
  mine: { verdict: 'yes' | 'no'; correction: string | null } | null
  /** Only on POST: badges this vote earned. */
  newBadges?: Badge[]
}

export type LeaderboardPeriod = 'week' | 'all'

export interface LeaderboardView {
  kiez: string | null
  period: LeaderboardPeriod
  kieze: { slug: string; name: string }[]
  entries: { rank: number; nickname: string; scans: number; dishes: number; isMe: boolean }[]
  /** The caller's own count when they are not in the list. */
  me: { rank: number | null; scans: number } | null
}
