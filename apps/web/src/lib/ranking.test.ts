import { describe, expect, it } from 'vitest'
import { distance, isInBerlin } from './geo'
import { byRankingGroup, rankingFilters } from './ranking'

describe('discovery distance ranking', () => {
  it('uses Berlin bounds and straight-line metres', () => {
    const berlin = { lat: 52.52, lng: 13.405 }
    expect(isInBerlin(berlin)).toBe(true)
    expect(isInBerlin({ lat: 48.13, lng: 11.58 })).toBe(false)
    expect(isInBerlin({ lat: 52.4, lng: 13.1 })).toBe(false)
    expect(isInBerlin({ lat: 52.3906, lng: 13.0645 })).toBe(false)
    expect(isInBerlin({ lat: 52.5035, lng: 13.4108 })).toBe(true)
    expect(isInBerlin({ lat: 52.5372, lng: 13.2 })).toBe(true)
    expect(isInBerlin({ lat: 52.45, lng: 13.28 })).toBe(true)
    expect(distance(berlin, { ...berlin, lat: 52.529 })).toBeCloseTo(1001, 0)
  })

  it('uses open state within a distance band and leaves ties for the existing score', () => {
    const close = { distance: 999, openNow: false }
    const farther = { distance: 1000, openNow: true }
    expect(byRankingGroup(close, farther, true)).toBeLessThan(0)
    expect(byRankingGroup(farther, { distance: 1900, openNow: false }, true)).toBeLessThan(0)
    expect(byRankingGroup(farther, { distance: 1900, openNow: true }, true)).toBe(0)
    expect(byRankingGroup(close, farther)).toBeGreaterThan(0)
  })

  it('reuses the onboarding goal sort with a shared position', () => {
    const choice = { near: { lat: 52.52, lng: 13.405 }, kiez: null, underBudget: true, openNow: false, proteinPlus: false }
    expect(rankingFilters({ ...choice, distanceBands: true, goal: 'gain' }).sort).toBe('protein')
    expect(rankingFilters({ ...choice, distanceBands: true, goal: 'lose' }).sort).toBe('healthScore')
    expect(rankingFilters({ ...choice, goal: 'lose' }).sort).toBe('best')
  })
})
