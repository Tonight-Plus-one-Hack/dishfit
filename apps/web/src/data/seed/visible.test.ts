// The served seed holds only healthy dishes, ranks whole meals only, never shows a low-confidence 100 and has no duplicates.
import { describe, expect, it } from 'vitest'
import { topDishes } from '../mock'
import { rankingFilters } from '../../lib/ranking'
import { HEALTHY_RULES, isHealthy, normalizeDishName } from '../dishClass'
import { SEED } from './visible'

describe('served seed', () => {
  it('shows only healthy, classified dishes', () => {
    expect(SEED.dishes.length).toBeGreaterThan(1000)
    for (const d of SEED.dishes) {
      expect(d.dishClass).toBeDefined()
      expect(isHealthy({ cls: d.dishClass, kcal: d.nutrition.kcal.value, proteinG: d.nutrition.protein.value })).toBe(true)
      expect(HEALTHY_RULES.excludedDishTypes).not.toContain(d.dishClass!.dishType)
    }
  })

  it('serves the verified pipeline Place ID on a legacy record that has the same OSM element', () => {
    const feinbergs = SEED.restaurants.find((r) => r.id === 'feinbergs')
    expect(feinbergs?.osmId).toBe('node/4417669603')
    expect(feinbergs?.placeId).toBe('ChIJJa-e1VZQqEcRonVFHbZQmjk')
  })

  it('lists a restaurant only with at least two healthy dishes', () => {
    const count = new Map<string, number>()
    for (const d of SEED.dishes) count.set(d.restaurantId, (count.get(d.restaurantId) ?? 0) + 1)
    for (const r of SEED.restaurants) expect(count.get(r.id) ?? 0).toBeGreaterThanOrEqual(HEALTHY_RULES.minDishesPerRestaurant)
  })

  it('keeps one dish per name and restaurant', () => {
    const keys = SEED.dishes.map((d) => `${d.restaurantId}|${normalizeDishName(d.name)}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never shows a low-confidence estimate at 100', () => {
    for (const d of SEED.dishes) if (d.nutrition.confidence !== 'high') expect(d.healthScore).toBeLessThan(100)
  })

  it('ranks whole meals only, so King King Edamame (a starter) never leads', () => {
    const ranked = topDishes(rankingFilters({ near: { lat: 52.5, lng: 13.42 }, kiez: 'Kreuzberg', underBudget: true, proteinPlus: false, openNow: false }))
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked.every((r) => r.dish.dishClass?.isFullMeal)).toBe(true)
    expect(ranked.some((r) => /edamame/i.test(r.dish.name))).toBe(false)
    const kingKing = SEED.restaurants.find((r) => r.name === 'King King')!
    const edamame = SEED.dishes.filter((d) => /edamame/i.test(d.name) && d.restaurantId === kingKing.id)
    expect(edamame).toHaveLength(1)
    expect(edamame[0].dishClass?.course).toBe('starter')
  })
})

describe('dish names without menu numbers', () => {
  it('shows the real seed names without their list numbers', () => {
    const names = new Set(SEED.dishes.map((d) => d.name))
    for (const name of ['Sashimi Sass', 'Papaya Paradise', 'Edamame', 'Saté (2 Stk.)']) expect(names).toContain(name)
    for (const name of ['13. Sashimi Sass', '08. Papaya Paradise', '1. Edamame', '1 Saté (2 Stk.)']) expect(names).not.toContain(name)
  })

  it('leaves no list number or menu code in front of any served dish', () => {
    // "13. ", "30.", "V5a. ", "B1-", "A7 ", "789 ": a code or a dotted number, or a bare number of two or more digits.
    // A bare single digit can be a quantity ("3 Merguez vom Grill", "2 Eier in pikantem Tomaten-Paprika-Ragout").
    const code = /^\s*([a-z]{0,2}\d{1,4}[a-z]?[.):-]\s*\p{L}|[a-z]{1,2}\d{1,4}[a-z]?\s+\p{L}|\d{2,4}\s+\p{L})/iu
    const numbered = SEED.dishes.map((d) => d.name).filter((n) => code.test(n) && !/^\d+\s*(stk|st\.|stück|x\s|spie(ß|ss)e)/iu.test(n))
    expect(numbered).toEqual([])
  })
})

describe('hidden restaurants and dishes', () => {
  it('knows the ids the healthy rule hides, so an old link gets a friendly state', async () => {
    const { HIDDEN } = await import('./visible')
    const { getRestaurant, getDish, NotFoundError } = await import('../mock')
    const [restaurantId] = HIDDEN.restaurants
    const [dishId] = HIDDEN.dishes
    expect(restaurantId).toBeDefined()
    expect(SEED.restaurants.some((r) => r.id === restaurantId)).toBe(false)
    const hiddenError = (fn: () => unknown) => {
      try {
        fn()
      } catch (error) {
        return error instanceof NotFoundError && error.hidden
      }
      return 'no error'
    }
    expect(hiddenError(() => getRestaurant(restaurantId))).toBe(true)
    expect(hiddenError(() => getDish(dishId))).toBe(true)
    expect(hiddenError(() => getRestaurant('never-existed'))).toBe(false)
  })
})
