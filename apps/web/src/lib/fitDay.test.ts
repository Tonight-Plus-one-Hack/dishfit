import { describe, expect, it } from 'vitest'
import type { Dish, DishResult, Restaurant } from '../data/contract'
import { topDishes } from '../data/mock'
import { range } from '../data/scoring'
import type { DiaryEntry } from './diary'
import { BERLIN_CENTER } from './geo'
import { DAY_FULL_KCAL, fitDay, fitDayFilters, maxDistanceFor, reach, remainingLine, remainingToday, type Remaining } from './fitDay'
import { dayTargets } from './nutrition'

function dish(id: string, n: { kcal: number; protein: number; carbs?: number; fat?: number }, healthScore = 85): Dish {
  return {
    id,
    restaurantId: `r-${id}`,
    name: id,
    description: '',
    price: 11,
    category: 'Bowls',
    nutrition: {
      kcal: range(n.kcal, 0.15),
      protein: range(n.protein, 0.15),
      carbs: range(n.carbs ?? 50, 0.15),
      fat: range(n.fat ?? 15, 0.15),
      source: 'ai',
      confidence: 'high',
    } as Dish['nutrition'],
    healthScore,
    proteinPerEuro: 3,
    diet: [],
    menuSource: { kind: 'website', url: '', fetchedAt: '' } as unknown as Dish['menuSource'],
    image: null,
    isTestData: false,
  }
}

function result(d: Dish, distance: number, openNow: boolean | null = true, restaurantId = d.restaurantId): DishResult {
  return { dish: { ...d, restaurantId }, restaurant: { id: restaurantId, name: restaurantId } as Restaurant, distance, openNow }
}

const left: Remaining = { kcal: 600, protein: 45, carbs: 80, fat: 25 }

describe('remainingToday', () => {
  it('subtracts today’s entries from the targets', () => {
    const entries = [
      { kcal: 700, protein: 40, carbs: 80, fat: 20 },
      { kcal: 300, protein: 25, carbs: 30, fat: 10 },
    ] as DiaryEntry[]
    const targets = dayTargets({ kcalTarget: 1800, proteinTarget: 130 })
    expect(remainingToday(entries, targets)).toEqual({ kcal: 800, protein: 65, carbs: targets.carbs - 110, fat: targets.fat - 30 })
  })
})

describe('reach', () => {
  it('walks short distances', () => {
    expect(reach(400)).toEqual({ mode: 'walk', minutes: 7 })
  })
  it('takes the train once it is quicker', () => {
    expect(reach(1200)).toEqual({ mode: 'transit', minutes: 10 })
  })
  it('maxDistanceFor is the edge of reach', () => {
    const m = maxDistanceFor(10)
    expect(reach(m - 20).minutes).toBeLessThanOrEqual(10)
    expect(reach(m + 200).minutes).toBeGreaterThan(10)
  })
})

describe('fitDay', () => {
  it('keeps only open, reachable, healthy dishes that fit the remaining kcal and macros', () => {
    const picks = fitDay(
      [
        result(dish('ok', { kcal: 520, protein: 40 }), 300),
        result(dish('closed', { kcal: 500, protein: 40 }), 300, false),
        result(dish('unknown-hours', { kcal: 500, protein: 40 }), 300, null),
        result(dish('far', { kcal: 500, protein: 40 }), 5000),
        result(dish('too-big', { kcal: 700, protein: 50 }), 300),
        result(dish('fatty', { kcal: 550, protein: 30, fat: 40 }), 300),
        result(dish('unhealthy', { kcal: 500, protein: 30 }, 55), 300),
        result(dish('side', { kcal: 220, protein: 20 }), 300),
      ],
      { remaining: left },
    )
    expect(picks.map((p) => p.result.dish.id)).toEqual(['ok'])
    expect(picks[0].reasons).toEqual(['ca. 40 von 45 g Protein', 'ca. 520 kcal, danach 80 kcal übrig', 'Jetzt offen · 5 Min zu Fuß'])
  })

  it('prefers the dish that closes more of the open protein, one per restaurant, at most three', () => {
    const picks = fitDay(
      [
        result(dish('lean', { kcal: 400, protein: 20 }, 90), 200),
        result(dish('protein', { kcal: 550, protein: 45 }, 85), 200),
        result(dish('same-place', { kcal: 580, protein: 30 }, 80), 200, true, 'r-protein'),
        result(dish('c', { kcal: 450, protein: 30 }), 250),
        result(dish('d', { kcal: 450, protein: 28 }), 250),
      ],
      { remaining: left },
    )
    expect(picks).toHaveLength(3)
    expect(picks[0].result.dish.id).toBe('protein')
    expect(picks[0].reasons[0]).toBe('ca. 45 g Protein, deckt deine restlichen 45 g')
    expect(new Set(picks.map((p) => p.result.restaurant.id)).size).toBe(3)
  })

  it('skips dishes already eaten today', () => {
    const d = dish('eaten', { kcal: 500, protein: 40 })
    expect(fitDay([result(d, 200)], { remaining: left, eatenDishIds: new Set(['eaten']) })).toEqual([])
  })

  it('returns nothing once the day is full', () => {
    const d = dish('small', { kcal: 320, protein: 25 })
    expect(fitDay([result(d, 200)], { remaining: { ...left, kcal: DAY_FULL_KCAL - 1 } })).toEqual([])
  })

  it('a wider radius lets farther dishes in', () => {
    const r = [result(dish('mid', { kcal: 500, protein: 40 }), 2500)]
    expect(fitDay(r, { remaining: left })).toEqual([])
    expect(fitDay(r, { remaining: left, minutes: 20 })).toHaveLength(1)
  })
})

describe('remainingLine', () => {
  it('names protein and kcal', () => {
    expect(remainingLine(left)).toBe('Noch 45 g Protein, 600 kcal übrig')
    expect(remainingLine({ ...left, protein: -5 })).toBe('Protein geschafft, noch 600 kcal übrig')
  })
})

describe('on the seed data', () => {
  it('finds dishes at Moritzplatz on a fresh day at lunch time', () => {
    const now = new Date('2026-11-18T12:30:00+01:00') // Wednesday lunch
    const remaining = remainingToday([], dayTargets(null))
    const picks = fitDay(topDishes({ ...fitDayFilters(BERLIN_CENTER, 20), now }), { remaining, minutes: 20 })
    expect(picks.length).toBeGreaterThan(0)
  })
})
