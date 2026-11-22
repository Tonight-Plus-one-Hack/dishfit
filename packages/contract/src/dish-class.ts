// Dish classification and the "only healthy dishes" product rule: the one source of truth for the
// pipeline classifier (pipeline/src/stages/classify.ts), the D1 columns (worker/migrations/0043_dish_class.sql)
// and the web app (apps/web/src/data/dishClass.ts). No imports, so Node (pipeline), Vite (web) and
// the Worker can all load this file directly.

/** Gang: where a dish sits in a meal. */
export const COURSES = ["starter", "main", "side", "soup", "salad", "dessert", "drink", "snack_breakfast"] as const;
export type Course = (typeof COURSES)[number];

/** Gerichtstyp: what kind of dish it is, independent of the course. */
export const DISH_TYPES = [
  "bowl",
  "salad",
  "curry",
  "ramen_noodles",
  "stir_fry",
  "sushi",
  "soup",
  "wrap",
  "sandwich",
  "tacos",
  "pasta",
  "grill_plate",
  "dumplings",
  "dip_spread",
  "breakfast",
  "burger",
  "pizza",
  "doener_kebab",
  "fried_snack",
  "dessert",
  "drink",
  "other",
] as const;
export type DishType = (typeof DISH_TYPES)[number];

/** Küche: the cuisine the dish belongs to (not always the restaurant's). */
export const CUISINES = [
  "german",
  "italian",
  "mediterranean",
  "greek",
  "turkish",
  "levantine",
  "persian",
  "indian",
  "vietnamese",
  "thai",
  "chinese",
  "japanese",
  "korean",
  "hawaiian",
  "mexican",
  "american",
  "african",
  "international",
] as const;
export type Cuisine = (typeof CUISINES)[number];

export const CLASS_CONFIDENCES = ["high", "medium", "low"] as const;
export type ClassConfidence = (typeof CLASS_CONFIDENCES)[number];

/** The classification of one dish, as the classifier returns it and the seed stores it. */
export interface DishClass {
  course: Course;
  dishType: DishType;
  cuisine: Cuisine;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  /** A whole meal on its own (a main, a bowl, a salad as a meal), not a starter, side, dip or drink. */
  isFullMeal: boolean;
  /** Deep-fried or breaded (fries, nuggets, tempura, schnitzel). */
  fried: boolean;
  /** Built on a cream or cheese sauce (carbonara, alfredo, gratin, mac and cheese). */
  creamy: boolean;
  /** Mostly sugar (sweets, cakes, lemonade, sweet shakes). */
  sugary: boolean;
  confidence: ClassConfidence;
}

/**
 * The healthy rule (captain's product rule "keine Pizza, wir wollen nur gesunde Sachen"). Dishes that fail it
 * stay in the data but are never shown or ranked; a restaurant is listed only with `minDishesPerRestaurant` of them.
 */
export const HEALTHY_RULES = {
  excludedDishTypes: ["pizza", "burger", "doener_kebab", "fried_snack", "dessert", "drink"] as readonly DishType[],
  excludedCourses: ["dessert", "drink"] as readonly Course[],
  excludeFried: true,
  excludeCreamy: true,
  excludeSugary: true,
  /** Limits for a full meal, on the point estimate. */
  meal: { kcalMax: 750, proteinMinG: 20, proteinShareMin: 0.15 },
  /** Starters, sides and soups are lighter; they only have to stay light. */
  smallPlate: { kcalMax: 500 },
  minDishesPerRestaurant: 2,
  /** Cuisines the pipeline, team scans and community submissions scan first (OSM cuisine tags, lower case). */
  priorityCuisines: [
    "poke",
    "bowl",
    "salad",
    "healthy",
    "vegan",
    "vegetarian",
    "mediterranean",
    "greek",
    "lebanese",
    "levantine",
    "middle_eastern",
    "israeli",
    "falafel",
    "vietnamese",
    "thai",
    "japanese",
    "korean",
    "sushi",
    "hawaiian",
    "protein",
  ] as readonly string[],
} as const;

export interface HealthyInput {
  cls: DishClass | null | undefined;
  kcal: number;
  proteinG: number;
}

/** Why a dish is hidden, or null when it is healthy. Unclassified dishes are hidden. */
export function unhealthyReason({ cls, kcal, proteinG }: HealthyInput): string | null {
  if (!cls) return "unclassified";
  if (HEALTHY_RULES.excludedCourses.includes(cls.course)) return `course:${cls.course}`;
  if (HEALTHY_RULES.excludedDishTypes.includes(cls.dishType)) return `type:${cls.dishType}`;
  if (HEALTHY_RULES.excludeFried && cls.fried) return "fried";
  if (HEALTHY_RULES.excludeCreamy && cls.creamy) return "creamy";
  if (HEALTHY_RULES.excludeSugary && cls.sugary) return "sugary";
  if (cls.isFullMeal) {
    const m = HEALTHY_RULES.meal;
    if (kcal > m.kcalMax) return "kcal";
    if (proteinG < m.proteinMinG) return "protein";
    if ((proteinG * 4) / Math.max(kcal, 1) < m.proteinShareMin) return "protein-share";
  } else if (kcal > HEALTHY_RULES.smallPlate.kcalMax) {
    return "kcal";
  }
  return null;
}

export function isHealthy(input: HealthyInput): boolean {
  return unhealthyReason(input) === null;
}

/** Whether a restaurant's cuisine tags put it in the healthy scan priority. */
export function isPriorityCuisine(tags: readonly string[]): boolean {
  return tags.some((t) => HEALTHY_RULES.priorityCuisines.some((p) => t.toLowerCase().includes(p)));
}

/**
 * Score shrunk toward the population mean by confidence, so a low-confidence estimate never shows 100:
 * high keeps the score, medium keeps 85 % of its distance from the mean, low 60 %.
 */
export const SCORE_MEAN = 60;
export const CONFIDENCE_WEIGHT: Record<ClassConfidence, number> = { high: 1, medium: 0.85, low: 0.6 };
export function confidenceWeightedScore(score: number, confidence: ClassConfidence): number {
  return Math.round(SCORE_MEAN + (score - SCORE_MEAN) * CONFIDENCE_WEIGHT[confidence]);
}

/**
 * A menu's list number or code in front of a dish name: "13. ", "08. ", "30.", "17A. ", "V5a. ", "A7 ", "M1. ",
 * "B1-", "Nr. 5 ", and a bare number of two or more digits ("789 Spezialsuppe").
 * Preserve bare single-digit quantities such as "3 Merguez vom Grill".
 */
const MENU_NUMBER =
  /^\s*(?:nr\.?\s*\d{1,4}\s+|[a-z]{0,2}\d{1,4}[a-z]?(?:[.):]\s*|-\s*)|[a-z]{1,2}\d{1,4}[a-z]?\s+|\d{2,4}\s+)(?=\p{L}|\d+\s*(?:stk\b|stück|x\s|spie(?:ß|ss)e\b))/iu;
/** When the dish specifies a different portion count, the leading digit is the menu number ("1 Saté (2 Stk.)"). */
const SINGLE_DIGIT_MENU_NUMBER = /^\s*(\d)\s+(?=\p{L}[^/]*\(\s*(?!\1\s)\d+\s+(?:stk\.?|st\.|stück|pcs\.?)\s*\)\s*$)/iu;
/** The number of an alternative after a slash ("18. Pho Chua / 20. Bun Chua"): only the dotted form counts there. */
const ALTERNATIVE_NUMBER = /^\d{1,4}[a-z]?\.\s*(?=\p{L})/iu;
/** A slash between alternatives, not a fraction ("1/2 Ente") or a code's own slash. */
const ALTERNATIVES = /((?<!\d)\s*\/\s*)/;
/** A quantity or a deal, not a menu number: "5 Stk. BBQ Wings", "6 St. Nuggets", "4 Spieße", "3 x Misto", "2 für 1 Gyoza". */
const QUANTITY = /^\s*\d+\s*(?:stk\b|st\.|stück|pcs\b|x\s|für\s|eier\b|scheiben\b|spie(?:ß|ss)e\b)/iu;

function stripLeadingNumber(part: string, index: number): string {
  if (QUANTITY.test(part)) return part;
  if (index !== 0) return part.replace(ALTERNATIVE_NUMBER, "");
  return part.replace(MENU_NUMBER.test(part) ? MENU_NUMBER : SINGLE_DIGIT_MENU_NUMBER, "");
}

/**
 * The dish name without its menu number, everything else exact: "13. Sashimi Sass" -> "Sashimi Sass".
 * Alternatives joined by a slash lose theirs too ("18. Pho Chua / 20. Bun Chua" -> "Pho Chua / Bun Chua"), fractions
 * stay ("1/2 Ente"), and so does a name that is only a code ("C1") or a code and its portion ("M1 (24 Stk.)").
 */
export function stripMenuNumber(name: string): string {
  return name
    .split(ALTERNATIVES)
    .map((part, i) => (i % 2 === 0 ? stripLeadingNumber(part, i) : part))
    .join("");
}

/** Normalised dish name for duplicate detection: lower case, no accents, punctuation or numbering. */
export function normalizeDishName(name: string): string {
  return stripMenuNumber(name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Bit flags of the compact web seed tuple [course, dishType, cuisine, flags, confidence]. */
export const CLASS_FLAGS = { vegan: 1, vegetarian: 2, glutenFree: 4, isFullMeal: 8, fried: 16, creamy: 32, sugary: 64 } as const;
export type CompactDishClass = [Course, DishType, Cuisine, number, ClassConfidence];

export function packDishClass(c: DishClass): CompactDishClass {
  let flags = 0;
  for (const [k, bit] of Object.entries(CLASS_FLAGS)) if (c[k as keyof typeof CLASS_FLAGS]) flags |= bit;
  return [c.course, c.dishType, c.cuisine, flags, c.confidence];
}

export function unpackDishClass([course, dishType, cuisine, flags, confidence]: CompactDishClass): DishClass {
  const has = (bit: number) => (flags & bit) !== 0;
  return {
    course,
    dishType,
    cuisine,
    vegan: has(CLASS_FLAGS.vegan),
    vegetarian: has(CLASS_FLAGS.vegetarian),
    glutenFree: has(CLASS_FLAGS.glutenFree),
    isFullMeal: has(CLASS_FLAGS.isFullMeal),
    fried: has(CLASS_FLAGS.fried),
    creamy: has(CLASS_FLAGS.creamy),
    sugary: has(CLASS_FLAGS.sugary),
    confidence,
  };
}

/** A value read from a seed or a model, checked against the enums; null when anything is off. */
export function parseDishClass(x: unknown): DishClass | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const bools = ["vegan", "vegetarian", "glutenFree", "isFullMeal", "fried", "creamy", "sugary"] as const;
  if (!COURSES.includes(o.course as Course)) return null;
  if (!DISH_TYPES.includes(o.dishType as DishType)) return null;
  if (!CUISINES.includes(o.cuisine as Cuisine)) return null;
  if (!CLASS_CONFIDENCES.includes(o.confidence as ClassConfidence)) return null;
  if (bools.some((k) => typeof o[k] !== "boolean")) return null;
  const c = o as unknown as DishClass;
  // Vegan implies vegetarian; keep the pair consistent whatever the model said.
  return { ...c, vegetarian: c.vegetarian || c.vegan };
}
