// Derived dish values. The backend computes the same numbers; keep both in step.
import type { Confidence, DishSort, NutritionEstimate, Range } from './contract'

/** Half-width of the shown range per confidence, as a share of the value (AI estimates are off by about 20 % on kcal). */
export const RANGE_SPREAD: Record<Confidence, number> = { high: 0.15, medium: 0.25, low: 0.35 }
/** Official values still vary with portioning. */
export const OFFICIAL_SPREAD = 0.05

export function range(value: number, spread: number): Range {
  return { value: Math.round(value), min: Math.round(value * (1 - spread)), max: Math.round(value * (1 + spread)) }
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

/**
 * 0 to 100. Rewards protein density (45 points at 35 % of energy from protein),
 * a main-meal energy between 450 and 750 kcal (30 points, fading out to 250 and 1300 kcal)
 * and a moderate fat share (25 points up to 30 % of energy, fading out at 60 %).
 */
export function healthScore(n: Pick<NutritionEstimate, 'kcal' | 'protein' | 'fat'>): number {
  const kcal = Math.max(n.kcal.value, 1)
  const proteinShare = (n.protein.value * 4) / kcal
  const fatShare = (n.fat.value * 9) / kcal
  const protein = clamp(proteinShare / 0.35) * 45
  const energy =
    kcal < 450 ? clamp((kcal - 250) / 200) * 30 : kcal > 750 ? clamp((1300 - kcal) / 550) * 30 : 30
  const fat = clamp(1 - Math.max(0, fatShare - 0.3) / 0.3) * 25
  return Math.round(protein + energy + fat)
}

/** Share of energy from protein, from the conservative lower end of the protein range. */
export function proteinDensity(n: Pick<NutritionEstimate, 'kcal' | 'protein'>): number {
  return (n.protein.min * 4) / Math.max(n.kcal.value, 1)
}

/**
 * 0 to 100, the default ranking shared by the map, Discover and search: the health score (60 %) and the conservative
 * protein density (40 %, full at 35 % of energy from protein). A calorie bomb with lots of absolute protein ranks below a
 * lean dish with a little less, because absolute grams never count on their own.
 */
export function rankScore(d: { healthScore: number; nutrition: Pick<NutritionEstimate, 'kcal' | 'protein'> }): number {
  return d.healthScore * 0.6 + clamp(proteinDensity(d.nutrition) / 0.35) * 40
}

type Rankable = { healthScore: number; nutrition: Pick<NutritionEstimate, 'kcal' | 'protein'> }

/** Best first by rankScore; ties go to more (conservative) protein. */
export function compareBest(a: Rankable, b: Rankable): number {
  return rankScore(b) - rankScore(a) || b.nutrition.protein.min - a.nutrition.protein.min
}

export function compareDiscoveryScore(a: Rankable, b: Rankable, sort?: DishSort): number {
  if (sort === 'protein') return b.nutrition.protein.min - a.nutrition.protein.min
  if (sort === 'healthScore') return b.healthScore - a.healthScore
  return compareBest(a, b)
}

export function proteinPerEuro(proteinGrams: number, price: number | null): number | null {
  if (price === null || price <= 0) return null
  return Math.round((proteinGrams / price) * 10) / 10
}
