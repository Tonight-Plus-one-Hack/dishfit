// The seed the app serves. Real records only in the public build (lib/flags.ts), every dish classified, and only
// healthy dishes (HEALTHY_RULES in packages/contract/src/dish-class.ts): the others stay in the data but are never
// shown or ranked. Scores are shrunk toward the mean by the estimate's confidence, duplicate dishes of one
// restaurant are dropped (the seed build does the same, this is the runtime guard), and a restaurant is listed
// only with at least two healthy dishes.
import type { Dish, Restaurant } from '../contract'
import { confidenceWeightedScore, guessDishClass, HEALTHY_RULES, isHealthy, normalizeDishName } from '../dishClass'
import { restaurantCategory } from '../../lib/category'
import { SHOW_TEST_DATA } from '../../lib/flags'
import { deriveMapCategory } from '../../lib/map-category'
import { SEED as ALL } from './index'

const SOURCE_RANK = { official: 100, ai: 0 } as const
const CONFIDENCE_RANK = { high: 20, medium: 10, low: 0 } as const

/** Official values first, then estimate confidence, a KI-Bild, a description, a price. */
export function sourceRank(d: Dish): number {
  return (
    SOURCE_RANK[d.nutrition.source] +
    CONFIDENCE_RANK[d.nutrition.confidence] +
    (d.image ? 4 : 0) +
    (d.description ? 2 : 0) +
    (d.price !== null ? 1 : 0)
  )
}

/** One dish per restaurant and normalised name: the best-sourced copy, at the first copy's position. */
export function dedupeDishes(dishes: Dish[]): Dish[] {
  const best = new Map<string, Dish>()
  const keyOf = (d: Dish) => `${d.restaurantId}\u0000${normalizeDishName(d.name)}`
  for (const d of dishes) {
    const kept = best.get(keyOf(d))
    if (!kept || sourceRank(d) > sourceRank(kept)) best.set(keyOf(d), d)
  }
  const placed = new Set<string>()
  return dishes.flatMap((d) => {
    const key = keyOf(d)
    if (placed.has(key)) return []
    placed.add(key)
    return [best.get(key)!]
  })
}

/** Class and confidence-weighted score in place; healthy dishes only; restaurants with enough of them. */
export function servedSeed(seed: { restaurants: Restaurant[]; dishes: Dish[] }): { restaurants: Restaurant[]; dishes: Dish[] } {
  const healthy = dedupeDishes(seed.dishes)
    .map((d): Dish => ({
      ...d,
      dishClass: d.dishClass ?? guessDishClass(d),
      healthScore: confidenceWeightedScore(d.healthScore, d.nutrition.confidence),
    }))
    .filter((d) => isHealthy({ cls: d.dishClass, kcal: d.nutrition.kcal.value, proteinG: d.nutrition.protein.value }))
  const byRestaurant = new Map<string, Dish[]>()
  for (const d of healthy) byRestaurant.set(d.restaurantId, [...(byRestaurant.get(d.restaurantId) ?? []), d])
  const listed = (id: string) => (byRestaurant.get(id)?.length ?? 0) >= HEALTHY_RULES.minDishesPerRestaurant
  return {
    restaurants: seed.restaurants
      .filter((r) => listed(r.id))
      .map((r) => {
        const menu = byRestaurant.get(r.id) ?? []
        return { ...r, category: restaurantCategory(r, menu), mapCategory: deriveMapCategory(r, menu) }
      }),
    dishes: healthy.filter((d) => listed(d.restaurantId)),
  }
}

const SOURCE = SHOW_TEST_DATA
  ? ALL
  : { restaurants: ALL.restaurants.filter((r) => !r.isTestData), dishes: ALL.dishes.filter((d) => !d.isTestData) }

export const SEED = servedSeed(SOURCE)

/** Ids we know but do not serve (the healthy rule hides them), so an old link gets a friendly "not shown" state. */
export const HIDDEN = (() => {
  const restaurants = new Set(SEED.restaurants.map((r) => r.id))
  const dishes = new Set(SEED.dishes.map((d) => d.id))
  return {
    restaurants: new Set(SOURCE.restaurants.filter((r) => !restaurants.has(r.id)).map((r) => r.id)),
    dishes: new Set(SOURCE.dishes.filter((d) => !dishes.has(d.id)).map((d) => d.id)),
  }
})()
