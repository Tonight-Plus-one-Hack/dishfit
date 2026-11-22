// The "best protein dishes under 12 EUR near you" ranking that the map and Discover share:
// one query builder and one title, so both screens always show the same order for the same choices.
// The order itself is data/scoring.ts compareBest (health score and conservative protein density), which search uses too.
import { translate } from '../i18n'
import { formatPrice } from './format'
import { KIEZE, type DishFilters, type DishSort, type Kiez, type LatLng } from '../data/contract'
import { distanceTier } from './geo'
import type { Goal } from './profile'

export const BUDGET_EUR = 12
export const PROTEIN_GOAL_G = 40
/** The default list only shows real protein meals (lower end of the range) ... */
export const PROTEIN_FLOOR_G = 25
/** ... and no calorie bombs, so a 1300 kcal pizza never leads a health app's list. */
export const KCAL_CAP = 900
/** Radius of "in deiner Nähe" when no Kiez is chosen. */
export const NEARBY_M = 6000

export interface RankingChoice {
  near: LatLng
  distanceBands?: boolean
  goal?: Goal
  /** A Kiez replaces the distance radius; null means "in deiner Nähe". */
  kiez: Kiez | null
  underBudget: boolean
  proteinPlus: boolean
  openNow: boolean
  diet?: Array<'vegan' | 'vegetarian'>
}

/** Rounds a position to about 100 m, so small GPS jitter keeps the same cache key. */
export function roundNear({ lat, lng }: LatLng): LatLng {
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 }
}

/** Same goal-based order as the recommendations at the end of onboarding. */
export function goalSort(goal: Goal): DishSort {
  return goal === 'gain' ? 'protein' : 'healthScore'
}

export function rankingFilters(choice: RankingChoice): DishFilters {
  return {
    near: choice.distanceBands ? choice.near : roundNear(choice.near),
    distanceBands: choice.distanceBands || undefined,
    sort: choice.distanceBands && choice.goal ? goalSort(choice.goal) : 'best',
    priceMax: choice.underBudget ? BUDGET_EUR : undefined,
    proteinMin: choice.proteinPlus ? PROTEIN_GOAL_G : PROTEIN_FLOOR_G,
    kcalMax: KCAL_CAP,
    openNow: choice.openNow || undefined,
    kiez: choice.kiez ? [choice.kiez] : undefined,
    maxDistance: choice.kiez ? undefined : NEARBY_M,
    diet: choice.diet?.length ? choice.diet : undefined,
    fullMealsOnly: true,
  }
}

/** "Die besten Protein-Gerichte unter 12 € in deiner Nähe", adapted to the active choices. */
export function rankingTitle(choice: Pick<RankingChoice, 'kiez' | 'underBudget'>): string {
  const budget = choice.underBudget ? translate('underPrice', formatPrice(BUDGET_EUR, 0)) : ''
  const where = choice.kiez ? translate('inNeighbourhood', choice.kiez) : translate('rankingNearby')
  return translate('bestHighProteinDishes12', budget, where)
}

/** How the list is ordered, shown under its title on the map, Discover and the desktop panel. */
export function rankingBasis({ distanceBands, sort }: Pick<DishFilters, 'distanceBands' | 'sort'>): string {
  if (!distanceBands) return translate('byScoreAndProteinPerKcal')
  const score = sort === 'healthScore' ? 'locationRankingGoalHealth' : sort === 'protein' ? 'locationRankingGoalProtein' : 'locationRankingScore'
  return translate('locationRankingDistanceBands', translate(score))
}

export function byRankingGroup(
  a: { distance: number | null; openNow: boolean | null },
  b: { distance: number | null; openNow: boolean | null },
  distanceBands?: boolean,
): number {
  const band = distanceBands ? distanceTier(a.distance) - distanceTier(b.distance) : 0
  return band || byOpenState(a, b)
}

/** "1 Gericht" or "12 Gerichte". */
export function dishCount(n: number): string {
  return n === 1 ? translate('count1Dish') : translate('count1Dishes', n)
}

/** Query value for an explicit "In deiner Nähe" while the profile has a home Kiez. */
export const NEAR_PARAM = 'nah'

/** The Kiez a ranking shows: the one in the URL, else the home Kiez picked in onboarding, else "in deiner Nähe". */
export function kiezFromParam(value: string | null, home: Kiez | null): Kiez | null {
  if (value === NEAR_PARAM) return null
  return KIEZE.find((k) => k === value) ?? home
}

/** The `kiez` query value for a choice; null when it is the default (the home Kiez, or "in deiner Nähe" without one). */
export function kiezParam(kiez: Kiez | null, home: Kiez | null): string | null {
  if (kiez === home) return null
  return kiez ?? NEAR_PARAM
}

/** Open places first, unknown hours next, closed ones last; a ranking never leads with a closed restaurant. */
export function byOpenState(a: { openNow: boolean | null }, b: { openNow: boolean | null }): number {
  const rank = (open: boolean | null) => (open === true ? 0 : open === null ? 1 : 2)
  return rank(a.openNow) - rank(b.openNow)
}
