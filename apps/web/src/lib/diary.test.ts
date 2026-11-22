import { describe, expect, it } from 'vitest'
import { recentEntries, streakOf, weekTotals, type DiaryEntry } from './diary'

const entry = (day: string, name: string, kcal = 500, hour = '12'): DiaryEntry => ({
  id: `${name}@${day}${hour}`,
  dishId: null,
  restaurantId: null,
  name,
  restaurantName: 'Eigenes Foto',
  price: null,
  kcal,
  protein: 30,
  carbs: 50,
  fat: 15,
  isEstimate: true,
  source: 'plate',
  at: `${day}T${hour}:00:00.000Z`,
  day,
})

describe('streakOf', () => {
  it('counts days in a row ending today', () => {
    expect(streakOf([entry('2026-11-19', 'a'), entry('2026-11-20', 'b'), entry('2026-11-21', 'c')], '2026-11-21')).toBe(3)
  })

  it('keeps yesterday’s streak until today is over, and breaks on a gap', () => {
    expect(streakOf([entry('2026-11-19', 'a'), entry('2026-11-20', 'b')], '2026-11-21')).toBe(2)
    expect(streakOf([entry('2026-11-18', 'a'), entry('2026-11-21', 'b')], '2026-11-21')).toBe(1)
    expect(streakOf([entry('2026-11-18', 'a')], '2026-11-21')).toBe(0)
  })

  it('crosses month ends', () => {
    expect(streakOf([entry('2026-11-30', 'a'), entry('2026-12-01', 'b')], '2026-12-01')).toBe(2)
  })
})

describe('recentEntries', () => {
  it('lists distinct foods newest first', () => {
    const list = recentEntries([entry('2026-11-19', 'Bowl'), entry('2026-11-20', 'Suppe'), entry('2026-11-21', 'Bowl')])
    expect(list.map((e) => `${e.name} ${e.day}`)).toEqual(['Bowl 2026-11-21', 'Suppe 2026-11-20'])
  })
})

describe('weekTotals', () => {
  it('sums Monday to Sunday of the current week', () => {
    const week = weekTotals([entry('2026-11-16', 'a', 400), entry('2026-11-16', 'b', 300), entry('2026-11-15', 'old', 900)], '2026-11-21')
    expect(week.map((d) => d.day)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(week[0]).toMatchObject({ kcal: 700, logged: true })
    expect(week[1]).toMatchObject({ kcal: 0, logged: false })
  })
})
