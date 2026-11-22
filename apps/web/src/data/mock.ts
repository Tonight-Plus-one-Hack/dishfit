// In-memory implementation of the API over the seed data. Mirrors what the Worker will answer.
import type {
  Confidence,
  Dish,
  DishDetail,
  DishFilters,
  DishResult,
  DishSort,
  Restaurant,
  RestaurantDetail,
  RestaurantSummary,
} from './contract'
import { isOpenAt } from './hours'
import { compareBest, compareDiscoveryScore } from './scoring'
import { distance } from '../lib/geo'
import { byRankingGroup } from '../lib/ranking'
import { restaurantSearchText, searchMatcher } from '../lib/search-text'
import { HIDDEN, SEED } from './seed/visible'

export class NotFoundError extends Error {
  /** True when we know the record but the healthy rule hides it, false when we never had it. */
  readonly hidden: boolean
  constructor(what: string, hidden = false) {
    super(`${what} ${hidden ? 'not shown' : 'not found'}`)
    this.name = 'NotFoundError'
    this.hidden = hidden
  }
}

const byId = new Map(SEED.restaurants.map((r) => [r.id, r]))
const dishById = new Map(SEED.dishes.map((d) => [d.id, d]))
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

function context(r: Restaurant, f: DishFilters) {
  return {
    distance: f.near ? distance(f.near, r) : null,
    openNow: isOpenAt(r.openingHours, f.now ?? new Date()),
  }
}

function restaurantMatches(r: Restaurant, f: DishFilters, ctx: ReturnType<typeof context>): boolean {
  if (f.kiez?.length && !f.kiez.includes(r.kiez)) return false
  if (f.mapCategory && r.mapCategory !== f.mapCategory) return false
  if (f.openNow && ctx.openNow !== true) return false
  if (f.maxDistance !== undefined && ctx.distance !== null && ctx.distance > f.maxDistance) return false
  return true
}

function dishMatches(d: Dish, f: DishFilters): boolean {
  const n = d.nutrition
  if (f.kcalMin !== undefined && n.kcal.value < f.kcalMin) return false
  if (f.kcalMax !== undefined && n.kcal.value > f.kcalMax) return false
  // The point estimate, the same number the cards show as "ca. 48 g".
  if (f.proteinMin !== undefined && n.protein.value < f.proteinMin) return false
  if (f.priceMax !== undefined && (d.price === null || d.price > f.priceMax)) return false
  if (f.healthScoreMin !== undefined && d.healthScore < f.healthScoreMin) return false
  if (f.diet?.length && !f.diet.every((x) => d.diet.includes(x))) return false
  if (f.minConfidence && CONFIDENCE_RANK[n.confidence] < CONFIDENCE_RANK[f.minConfidence]) return false
  const c = d.dishClass
  if (f.fullMealsOnly && !c?.isFullMeal) return false
  if (f.course?.length && (!c || !f.course.includes(c.course))) return false
  if (f.dishType?.length && (!c || !f.dishType.includes(c.dishType))) return false
  if (f.glutenFree && !c?.glutenFree) return false
  return true
}

const SORTS: Record<DishSort, (a: DishResult, b: DishResult) => number> = {
  best: (a, b) => compareBest(a.dish, b.dish),
  protein: (a, b) => compareDiscoveryScore(a.dish, b.dish, 'protein'),
  proteinPerEuro: (a, b) => (b.dish.proteinPerEuro ?? -1) - (a.dish.proteinPerEuro ?? -1),
  healthScore: (a, b) => compareDiscoveryScore(a.dish, b.dish, 'healthScore'),
  price: (a, b) => (a.dish.price ?? Infinity) - (b.dish.price ?? Infinity),
  kcal: (a, b) => a.dish.nutrition.kcal.value - b.dish.nutrition.kcal.value,
  distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
}

const byRestaurant = new Map<string, Dish[]>()
for (const d of SEED.dishes) byRestaurant.set(d.restaurantId, [...(byRestaurant.get(d.restaurantId) ?? []), d])
const dishesOf = (id: string): Dish[] => byRestaurant.get(id) ?? []

export function topDishes(f: DishFilters = {}): DishResult[] {
  const results: DishResult[] = []
  const matchesText = f.q ? searchMatcher(f.q) : null
  for (const r of SEED.restaurants) {
    const ctx = context(r, f)
    if (!restaurantMatches(r, f, ctx)) continue
    const restaurantText = matchesText ? restaurantSearchText(r) : ''
    for (const d of dishesOf(r.id)) {
      if (!dishMatches(d, f)) continue
      if (matchesText && !matchesText(`${d.name} ${d.description} ${d.category} ${restaurantText}`)) continue
      results.push({ dish: d, restaurant: r, ...ctx })
    }
  }
  const sort = SORTS[f.sort ?? 'best']
  results.sort((a, b) => byRankingGroup(a, b, f.distanceBands) || sort(a, b))
  return f.limit ? results.slice(0, f.limit) : results
}

export function listRestaurants(f: DishFilters = {}): RestaurantSummary[] {
  const dishFilters = { ...f, limit: undefined }
  const matching = topDishes(dishFilters)
  return SEED.restaurants
    .map((r) => {
      const ctx = context(r, f)
      const own = matching.filter((m) => m.restaurant.id === r.id)
      return {
        ...r,
        ...ctx,
        matchingDishes: own.length,
        totalDishes: dishesOf(r.id).length,
        topDish: own[0]?.dish ?? null,
        visible: restaurantMatches(r, f, ctx),
      }
    })
    .filter(({ visible }) => visible)
    .map(({ visible: _visible, ...summary }) => summary)
    .sort((a, b) => {
      if (f.distanceBands) {
        const group = byRankingGroup(a, b, true)
        if (group) return group
        if (a.topDish && b.topDish) return compareDiscoveryScore(a.topDish, b.topDish, f.sort)
        if (a.topDish || b.topDish) return a.topDish ? -1 : 1
      }
      return (a.distance ?? 0) - (b.distance ?? 0)
    })
    .slice(0, f.limit)
}

export function getRestaurant(id: string): RestaurantDetail {
  const restaurant = byId.get(id)
  if (!restaurant) throw new NotFoundError(`Restaurant ${id}`, HIDDEN.restaurants.has(id))
  const dishes = SEED.dishes.filter((d) => d.restaurantId === id)
  return { restaurant, dishes }
}

export function getDish(id: string): DishDetail {
  const dish = dishById.get(id)
  if (!dish) throw new NotFoundError(`Dish ${id}`, HIDDEN.dishes.has(id))
  const restaurant = byId.get(dish.restaurantId)!
  const siblings = SEED.dishes
    .filter((d) => d.restaurantId === dish.restaurantId && d.id !== id)
    .sort((a, b) => b.healthScore - a.healthScore)
  return { dish, restaurant, siblings }
}
