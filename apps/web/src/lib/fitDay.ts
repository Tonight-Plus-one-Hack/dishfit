// "Passt zu deinem Tag": dishes that are open now, reachable in about ten minutes and fit what is left of today's
// kcal and macros, healthy dishes only. Pure functions; the sheet in components/FitDay.tsx feeds them.
// Travel times are estimates from straight-line distance, no routing service and no stored location.
import { translate } from '../i18n'
import type { DishFilters, DishResult, LatLng } from '../data/contract'
import { rankScore } from '../data/scoring'
import type { DiaryEntry } from './diary'
import type { DayTargets } from './nutrition'
import { KCAL_CAP } from './ranking'

/** What is left of today's targets; negative when the target is already passed. */
export interface Remaining {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export function remainingToday(entries: DiaryEntry[], targets: DayTargets): Remaining {
  const eaten = entries.reduce((sum, e) => ({ kcal: sum.kcal + e.kcal, protein: sum.protein + e.protein, carbs: sum.carbs + e.carbs, fat: sum.fat + e.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  })
  return {
    kcal: Math.round(targets.kcal - eaten.kcal),
    protein: Math.round(targets.protein - eaten.protein),
    carbs: Math.round(targets.carbs - eaten.carbs),
    fat: Math.round(targets.fat - eaten.fat),
  }
}

// ---------- Reachability ----------

/** Streets are not straight: walking and riding cover about 1.3 times the straight-line distance. */
const DETOUR = 1.3
/** 4.8 km/h. */
const WALK_M_PER_MIN = 80
/** Berlin U-/S-Bahn and bus average about 24 km/h between stops. */
const TRANSIT_M_PER_MIN = 400
/** Walk to the stop, wait, walk from the stop (dense inner-city network, trains every five minutes). */
const TRANSIT_OVERHEAD_MIN = 6
/** Below this straight-line distance nobody takes a train. */
const TRANSIT_MIN_M = 900

export type TravelMode = 'walk' | 'transit'

export interface Reach {
  mode: TravelMode
  minutes: number
}

/** The quicker of walking and public transport, both rough estimates from the straight-line distance. */
export function reach(metres: number): Reach {
  const walk = Math.max(1, Math.round((metres * DETOUR) / WALK_M_PER_MIN))
  if (metres < TRANSIT_MIN_M) return { mode: 'walk', minutes: walk }
  const transit = Math.round(TRANSIT_OVERHEAD_MIN + (metres * DETOUR) / TRANSIT_M_PER_MIN)
  return transit < walk ? { mode: 'transit', minutes: transit } : { mode: 'walk', minutes: walk }
}

/** Largest straight-line distance that reach() still gets to within `minutes`, for the query radius. */
export function maxDistanceFor(minutes: number): number {
  const walk = (minutes * WALK_M_PER_MIN) / DETOUR
  const transit = ((minutes - TRANSIT_OVERHEAD_MIN) * TRANSIT_M_PER_MIN) / DETOUR
  return Math.ceil(Math.max(walk, transit))
}

export function reachLabel(r: Reach): string {
  return r.mode === 'walk' ? translate('count1MinWalk', r.minutes) : translate('approx1MinByTransit', r.minutes)
}

// ---------- Healthy and fitting ----------

/**
 * Healthy dishes only. Local rule until the dish-db worker's shared healthy config lands (fm/dish-db):
 * health score in the orange band or better, no calorie bomb, and a real meal of protein.
 */
export const HEALTHY = { scoreMin: 70, kcalMax: KCAL_CAP, proteinMin: 15 } as const

export function isHealthy(d: DishResult['dish']): boolean {
  return d.healthScore >= HEALTHY.scoreMin && d.nutrition.kcal.value <= HEALTHY.kcalMax && d.nutrition.protein.min >= HEALTHY.proteinMin
}

/** A suggestion is a meal, not a side: starters and dips stay out. */
export const MEAL_KCAL_MIN = 300
/** Below this many kcal left the day is done; a meal no longer fits. */
export const DAY_FULL_KCAL = MEAL_KCAL_MIN
/** Carbs and fat targets are guide values from an energy split, so a dish may pass them by a little. */
const MACRO_SLACK = 1.15

export const DEFAULT_MINUTES = 10
export const RELAXED_MINUTES = 20
export const SHOWN = 3

export interface FitPick {
  result: DishResult
  reach: Reach
  /** Short German reasons, most important first. */
  reasons: string[]
}

export interface FitOptions {
  remaining: Remaining
  /** Dishes eaten today are not suggested again. */
  eatenDishIds?: Set<string>
  minutes?: number
  limit?: number
}

/** The query for candidates; fitDay() narrows the answer further. */
export function fitDayFilters(near: LatLng, minutes: number, diet?: Array<'vegan' | 'vegetarian'>): DishFilters {
  return {
    near,
    openNow: true,
    maxDistance: maxDistanceFor(minutes),
    kcalMax: HEALTHY.kcalMax,
    healthScoreMin: HEALTHY.scoreMin,
    diet: diet?.length ? diet : undefined,
    sort: 'best',
  }
}

function fits(d: DishResult['dish'], left: Remaining): boolean {
  const n = d.nutrition
  if (n.kcal.value > left.kcal || n.kcal.value < MEAL_KCAL_MIN) return false
  if (n.fat.value > Math.max(0, left.fat) * MACRO_SLACK) return false
  if (n.carbs.value > Math.max(0, left.carbs) * MACRO_SLACK) return false
  return true
}

/** Share of the remaining protein the dish covers (lower end of its range), 0 to 1. */
function proteinCoverage(d: DishResult['dish'], left: Remaining): number {
  if (left.protein <= 0) return 0
  return Math.min(1, d.nutrition.protein.min / left.protein)
}

function reasons(d: DishResult['dish'], left: Remaining, r: Reach): string[] {
  const n = d.nutrition
  const approx = n.source === 'ai' ? translate('approximatePrefix') : ''
  const out: string[] = []
  if (left.protein > 0) {
    out.push(
      n.protein.value >= left.protein
        ? translate('count12GProteinCoversYour', approx, n.protein.value, left.protein)
        : translate('count12Of3GProtein', approx, n.protein.value, left.protein),
    )
  } else {
    out.push(translate('count12GProtein', approx, n.protein.value))
  }
  const after = left.kcal - n.kcal.value
  out.push(translate('count12KcalWith3Kcal', approx, n.kcal.value, after))
  out.push(translate('openNow1', reachLabel(r)))
  return out
}

/** The best fitting dishes, at most one per restaurant, best first. */
export function fitDay(candidates: DishResult[], options: FitOptions): FitPick[] {
  const { remaining, eatenDishIds, minutes = DEFAULT_MINUTES, limit = SHOWN } = options
  if (remaining.kcal < DAY_FULL_KCAL) return []
  const scored: Array<FitPick & { score: number }> = []
  for (const result of candidates) {
    const { dish, distance, openNow } = result
    if (openNow !== true || distance === null) continue
    if (eatenDishIds?.has(dish.id)) continue
    if (!isHealthy(dish) || !fits(dish, remaining)) continue
    const r = reach(distance)
    if (r.minutes > minutes) continue
    // Health first, then how much of the open protein it closes, a little penalty per minute away.
    const score = rankScore(dish) + proteinCoverage(dish, remaining) * 40 - r.minutes * 0.5
    scored.push({ result, reach: r, reasons: reasons(dish, remaining, r), score })
  }
  scored.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const picks: FitPick[] = []
  for (const { score: _score, ...pick } of scored) {
    if (seen.has(pick.result.restaurant.id)) continue
    seen.add(pick.result.restaurant.id)
    picks.push(pick)
    if (picks.length === limit) break
  }
  return picks
}

/** "Noch 45 g Protein, 600 kcal übrig" (or only kcal once the protein goal is met). */
export function remainingLine(left: Remaining): string {
  const kcal = `${Math.max(0, left.kcal)} kcal`
  return left.protein > 0 ? translate('count1GProteinAnd2Left', left.protein, kcal) : translate('proteinGoalMet1Left', kcal)
}

/** "diese 3 Gerichte" / "dieses Gericht". */
export function picksLine(n: number): string {
  return n === 1 ? translate('thisDish') : translate('these1Dishes', n)
}
