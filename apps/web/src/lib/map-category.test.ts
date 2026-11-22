import { describe, expect, it } from 'vitest'
import { listRestaurants, topDishes } from '../data/mock'
import { readMapCategory } from './map-category'

describe('map categories', () => {
  it('keeps the pin and ranking filters in sync for a known restaurant', () => {
    const buKon = 'osm-node-7275039878'
    const soups = listRestaurants({ mapCategory: 'soup' })
    const salads = listRestaurants({ mapCategory: 'salad' })
    expect(soups.some((restaurant) => restaurant.id === buKon)).toBe(true)
    expect(salads.length).toBeGreaterThan(0)
    expect(salads.some((restaurant) => restaurant.id === buKon)).toBe(false)
    const pho = (category: 'soup' | 'salad') =>
      topDishes({ mapCategory: category }).some(({ dish, restaurant }) => restaurant.id === buKon && dish.name.includes('Phở Gà'))
    expect(pho('soup')).toBe(true)
    expect(pho('salad')).toBe(false)
    expect(topDishes({ mapCategory: 'salad' }).length).toBeGreaterThan(0)
  })

  it('does not infer a specialty from a restaurant name alone', () => {
    expect(listRestaurants({ mapCategory: 'soup' }).some((r) => r.id === 'osm-node-1200964384')).toBe(true)
    expect(listRestaurants({ mapCategory: 'breakfast' }).some((r) => r.id === 'osm-node-1200964384')).toBe(false)
  })

  it('accepts category links and ignores unknown values', () => {
    expect(readMapCategory('poke')).toBe('poke')
    expect(readMapCategory('toString')).toBeUndefined()
    expect(readMapCategory(null)).toBeUndefined()
  })
})
