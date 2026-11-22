/**
 * The review agent's decision for one community menu photo, as a pure function of what the model
 * read and what we know about the restaurant. Three outcomes:
 * - publish: every rule is green and the reading is confident; dishes go online with a Community badge,
 * - review: the team decides (new restaurant, ambiguous match, odd prices, flagged nutrition),
 * - reject: with a German reason the guest sees (not a menu, faces, inappropriate, duplicate, clear mismatch).
 */

export type Outcome = "publish" | "review" | "reject";
export type Confidence = "high" | "medium" | "low";

export type ReadDish = { name: string; priceEur: number | null };

/** What the vision model read from the photo. */
export type MenuReading = {
  isMenu: boolean;
  /** The restaurant name printed on the menu, if any. */
  nameOnMenu: string | null;
  /** The cuisine the menu suggests (OSM-style, e.g. "vietnamese"); null when unclear. */
  cuisine: string | null;
  faces: boolean;
  inappropriate: boolean;
  legibility: Confidence;
  dishes: ReadDish[];
};

export type RestaurantFacts = {
  name: string;
  /** False when the app sent an id we do not have in D1 (e.g. seed-only data). */
  known: boolean;
  isNew: boolean;
  cuisines: string[];
  /** For a new restaurant: the Kiez its pin is in, null outside our Kieze. */
  kiez: string | null;
  /** For a new restaurant: an existing restaurant with a similar name within 150 m. */
  nearbySameName: string | null;
};

export type History = {
  /** The same photo bytes were already submitted. */
  samePhoto: boolean;
  /** Share of read dish names already online for this restaurant (0..1). */
  overlapShare: number;
};

export type NutritionCheck = {
  /** Share of dishes with at least one plausibility flag from the pipeline's check stage (0..1). */
  flaggedShare: number;
};

export type Decision = { outcome: Outcome; confidence: Confidence; reason: string | null; notes: string[] };

export const MIN_DISHES = 3;
export const MIN_PRICE_EUR = 0.5;
export const MAX_PRICE_EUR = 80;
export const DUPLICATE_OVERLAP = 0.8;
export const FLAGGED_SHARE_REVIEW = 0.3;

export const REASONS = {
  faces: "Auf dem Foto sind Personen zu sehen. Bitte fotografiere nur die Speisekarte.",
  inappropriate: "Das Foto enthält unangemessene Inhalte.",
  notMenu: "Auf dem Foto ist keine lesbare Speisekarte zu erkennen.",
  samePhoto: "Dieses Foto wurde schon eingereicht.",
  alreadyOnline: "Diese Speisekarte ist schon online.",
  otherRestaurant: (name: string) => `Die Speisekarte gehört zu einem anderen Restaurant (${name}).`,
  outsideKieze: "Das Restaurant liegt außerhalb unserer Berliner Kieze.",
  prices: "Die Preise auf dem Foto sind nicht plausibel.",
} as const;

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/&/g, " und ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(restaurant|cafe|bistro|imbiss|bar|kitchen|kuche|berlin|gmbh|the|und|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 1 for the same name, 0 for nothing in common: containment counts as a match, else token overlap. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y || x.includes(y) || y.includes(x)) return 1;
  const tx = new Set(x.split(" "));
  const ty = new Set(y.split(" "));
  const shared = [...tx].filter((t) => ty.has(t)).length;
  return shared / new Set([...tx, ...ty]).size;
}

const LEVEL: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
const lower = (a: Confidence, b: Confidence): Confidence => (LEVEL[a] >= LEVEL[b] ? a : b);

const reject = (reason: string): Decision => ({ outcome: "reject", confidence: "high", reason, notes: [] });

export function decide(reading: MenuReading, restaurant: RestaurantFacts, history: History, nutrition: NutritionCheck): Decision {

  // Safety and content first: these never reach the team.
  if (reading.faces) return reject(REASONS.faces);
  if (reading.inappropriate) return reject(REASONS.inappropriate);
  if (!reading.isMenu || reading.dishes.length < MIN_DISHES) return reject(REASONS.notMenu);
  if (history.samePhoto) return reject(REASONS.samePhoto);
  if (history.overlapShare >= DUPLICATE_OVERLAP) return reject(REASONS.alreadyOnline);
  if (restaurant.isNew && restaurant.kiez === null) return reject(REASONS.outsideKieze);

  const notes: string[] = [];
  let confidence: Confidence = reading.legibility;

  // Cuisine: only a hint (menus mix cuisines), so a mismatch asks the team.
  const cuisineKnown = reading.cuisine !== null && restaurant.cuisines.length > 0;
  const cuisineMatches =
    cuisineKnown &&
    restaurant.cuisines.some((k) => k.toLowerCase().includes(reading.cuisine!.toLowerCase()) || reading.cuisine!.toLowerCase().includes(k.toLowerCase()));
  if (cuisineKnown && !cuisineMatches) notes.push(`Küche "${reading.cuisine}" passt nicht zu ${restaurant.cuisines.join(", ")}`);

  // Name on the menu against the chosen restaurant: a clear mismatch is rejected, a weak match goes to the team.
  // Without a printed name only a matching cuisine keeps the match confident.
  if (reading.nameOnMenu) {
    const sim = nameSimilarity(reading.nameOnMenu, restaurant.name);
    if (sim < 0.2 && !restaurant.isNew) return reject(REASONS.otherRestaurant(reading.nameOnMenu));
    if (sim < 0.2) notes.push(`Name auf der Karte "${reading.nameOnMenu}" passt nicht zu "${restaurant.name}"`);
    else if (sim < 0.5) notes.push(`Name nur teilweise gleich: "${reading.nameOnMenu}" / "${restaurant.name}"`);
  } else if (!cuisineMatches) {
    notes.push("Kein Restaurantname auf der Karte");
  }

  // Prices.
  const priced = reading.dishes.filter((d) => d.priceEur !== null);
  const implausible = priced.filter((d) => d.priceEur! < MIN_PRICE_EUR || d.priceEur! > MAX_PRICE_EUR);
  if (priced.length > 0 && implausible.length / priced.length > 0.3) return reject(REASONS.prices);
  if (implausible.length > 0) notes.push(`${implausible.length} Preise außerhalb ${MIN_PRICE_EUR}-${MAX_PRICE_EUR} EUR`);
  if (priced.length < reading.dishes.length / 2) {
    notes.push("Weniger als die Hälfte der Preise lesbar");
    confidence = lower(confidence, "medium");
  }

  if (history.overlapShare >= 0.3) notes.push(`${Math.round(history.overlapShare * 100)} % der Gerichte sind schon online`);
  if (nutrition.flaggedShare > FLAGGED_SHARE_REVIEW) notes.push(`${Math.round(nutrition.flaggedShare * 100)} % der Nährwerte auffällig`);

  // The restaurant itself needs a human: new places, places we cannot verify, likely duplicates.
  if (restaurant.isNew) notes.push(`Neues Restaurant${restaurant.nearbySameName ? `, ähnlich wie "${restaurant.nearbySameName}" in der Nähe` : ""}`);
  if (!restaurant.known && !restaurant.isNew) notes.push("Restaurant nicht in der Datenbank");

  if (notes.length > 0 || confidence !== "high") {
    if (confidence !== "high") notes.push(`Lesbarkeit ${confidence === "medium" ? "mittel" : "niedrig"}`);
    return { outcome: "review", confidence, reason: null, notes };
  }
  return { outcome: "publish", confidence, reason: null, notes };
}
