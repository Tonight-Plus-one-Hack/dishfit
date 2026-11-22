// Deterministic nutrition math. The LLM only names ingredients and grams; every number here comes
// from the USDA table (foods.json) and fixed arithmetic.
import type { Confidence, Ingredient, NutrientTotals, NutritionResult, PrintedNutrition, Range } from '../types.ts';
import { type FoodGroup, type FoodRow, foodIndex } from './foods.ts';

/** Relative half-width of the range shown in the app, by confidence (same as apps/web/src/data/scoring.ts). */
export const RANGE_MARGIN: Record<Confidence, number> = { high: 0.15, medium: 0.25, low: 0.35 };
const OFFICIAL_MARGIN = 0.05;
const LEVELS: Confidence[] = ['high', 'medium', 'low'];

const down = (c: Confidence, steps: number): Confidence => LEVELS[Math.min(2, LEVELS.indexOf(c) + steps)]!;

export interface NutritionInput {
  ingredients: Ingredient[];
  recipeConfidence: Confidence;
  priceEur: number | null;
  printed?: PrintedNutrition | null;
}

export function sumIngredients(ingredients: Ingredient[], index: Map<string, FoodRow> = foodIndex()) {
  const totals: NutrientTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, satFat: 0, sodiumMg: 0 };
  const byGroup = new Map<FoodGroup, number>();
  const unmatched: string[] = [];
  let totalGrams = 0;
  let unmatchedGrams = 0;
  for (const ing of ingredients) {
    const grams = Math.max(0, Number(ing.grams) || 0);
    totalGrams += grams;
    const food = index.get(ing.food);
    if (!food) {
      unmatched.push(ing.food);
      unmatchedGrams += grams;
      continue;
    }
    for (const k of Object.keys(totals) as (keyof NutrientTotals)[]) totals[k] += (food.per100g[k] * grams) / 100;
    byGroup.set(food.group, (byGroup.get(food.group) ?? 0) + grams);
  }
  return { totals, byGroup, unmatched, totalGrams, unmatchedGrams };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => y0 + (clamp((x - x0) / (x1 - x0), 0, 1) * (y1 - y0));

/**
 * Health score 0-100 for one dish (documented in pipeline/README.md):
 * 50 base; + protein energy share (10% -> 0, 30% -> +20); + fibre per 1000 kcal (0 -> 0, 14 g -> +15);
 * + vegetables/fruit/legume weight share (0 -> 0, 50% -> +15); - saturated-fat energy share (10% -> 0,
 * 20% -> -15); - sugar energy share (10% -> 0, 25% -> -10); - fried or processed-meat weight share
 * (0 -> 0, 30% -> -10); - portion size (900 kcal -> 0, 1400 kcal -> -10).
 */
export function healthScore(t: NutrientTotals, vegShare: number, friedOrProcessedShare: number): number {
  if (t.kcal <= 0) return 0;
  let s = 50;
  s += lerp((t.protein * 4) / t.kcal, 0.1, 0.3, 0, 20);
  s += lerp((t.fiber / t.kcal) * 1000, 0, 14, 0, 15);
  s += lerp(vegShare, 0, 0.5, 0, 15);
  s -= lerp((t.satFat * 9) / t.kcal, 0.1, 0.2, 0, 15);
  s -= lerp((t.sugar * 4) / t.kcal, 0.1, 0.25, 0, 10);
  s -= lerp(friedOrProcessedShare, 0, 0.3, 0, 10);
  s -= lerp(t.kcal, 900, 1400, 0, 10);
  return Math.round(clamp(s, 0, 100));
}

function range(v: number, margin: number, step: number): Range {
  const r = (x: number) => Math.round(x / step) * step;
  return { min: Math.max(0, r(v * (1 - margin))), max: r(v * (1 + margin)) };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function computeNutrition(input: NutritionInput, index: Map<string, FoodRow> = foodIndex()): NutritionResult {
  const s = sumIngredients(input.ingredients, index);
  const grams = s.totalGrams || 1;
  const share = (groups: FoodGroup[]) => groups.reduce((a, g) => a + (s.byGroup.get(g) ?? 0), 0) / grams;
  const vegShare = share(['veg', 'fruit', 'legume']);
  const friedShare = share(['fried', 'processed_meat']);
  const unmatchedShare = s.unmatchedGrams / grams;

  let totals = s.totals;
  let confidence: Confidence;
  let source: 'official' | 'ai';
  let margin: number;
  let methodNote: string;
  const printed = input.printed;
  if (printed && printed.kcal > 0) {
    source = 'official';
    confidence = 'high';
    margin = OFFICIAL_MARGIN;
    totals = {
      ...totals,
      kcal: printed.kcal,
      protein: printed.protein ?? totals.protein,
      carbs: printed.carbs ?? totals.carbs,
      fat: printed.fat ?? totals.fat,
    };
    methodNote = 'Offizielle Nährwertangabe des Restaurants.';
  } else {
    source = 'ai';
    confidence = input.recipeConfidence;
    if (unmatchedShare > 0.3) confidence = 'low';
    else if (unmatchedShare > 0.1) confidence = down(confidence, 1);
    if (s.totalGrams < 120) confidence = 'low';
    margin = RANGE_MARGIN[confidence];
    methodNote = `KI-Schätzung: ${input.ingredients.length} Zutaten mit Grammangaben, Nährwerte aus USDA FoodData Central berechnet.` +
      (s.unmatched.length ? ` Nicht zugeordnet: ${s.unmatched.join(', ')}.` : '');
  }
  const rounded: NutrientTotals = {
    kcal: Math.round(totals.kcal), protein: round1(totals.protein), carbs: round1(totals.carbs), fat: round1(totals.fat),
    fiber: round1(totals.fiber), sugar: round1(totals.sugar), satFat: round1(totals.satFat), sodiumMg: Math.round(totals.sodiumMg),
  };
  const ranges = {
    kcal: range(rounded.kcal, margin, 10),
    protein: range(rounded.protein, margin, 1),
    carbs: range(rounded.carbs, margin, 1),
    fat: range(rounded.fat, margin, 1),
  };
  return {
    totals: rounded,
    range: ranges,
    confidence,
    source,
    methodNote,
    unmatched: s.unmatched,
    totalGrams: Math.round(s.totalGrams),
    vegShare: Math.round(vegShare * 100) / 100,
    healthScore: healthScore(rounded, vegShare, friedShare),
    // Lower end of the protein range, so optimistic estimates do not win the ranking (web contract).
    proteinPerEuro: proteinPerEuro(ranges.protein.min, input.priceEur),
  };
}

export function proteinPerEuro(proteinGrams: number, priceEur: number | null): number | null {
  if (priceEur == null || priceEur <= 0) return null;
  return Math.round((proteinGrams / priceEur) * 10) / 10;
}

/** Relative difference between two estimates, used by the stage 4 second-model check. */
export function relDiff(a: number, b: number): number {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : Math.abs(a - b) / m;
}
