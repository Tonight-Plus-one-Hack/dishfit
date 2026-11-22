import { describe, expect, it } from 'vitest'
import { listRestaurants, topDishes } from '../data/mock'
import { matchingRestaurants, searchMatcher } from './search-text'

describe('catalog search spellings', () => {
  it.each([
    ['Hähnchen', 'Hahnchen'],
    ['Hähnchen', 'Haehnchen'],
    ['Schöneberg', 'Schoeneberg'],
    ['Türkisch', 'Tuerkisch'],
    ['Türkisch', 'Turkisch'],
    ['Straße', 'Strasse'],
    ['Shōdo', 'Shodo'],
    ['Fu\u0308r', 'Fuer'],
  ])('matches %s and %s in both directions', (accented, plain) => {
    expect(searchMatcher(plain)(accented)).toBe(true)
    expect(searchMatcher(accented)(plain)).toBe(true)
  })

  it('requires every query word', () => {
    const matches = searchMatcher('  haehnchen   Schoneberg ')
    expect(matches('Hähnchen-Salat aus Schöneberg')).toBe(true)
    expect(matches('Hähnchen-Salat aus Kreuzberg')).toBe(false)
  })

  it('returns dishes from Schöneberg restaurants without the Kiez in their name', () => {
    const byKiez = topDishes({ kiez: ['Schöneberg'] })
    const bySearch = topDishes({ q: 'Schoeneberg' })
    expect(bySearch.some(({ restaurant }) => restaurant.name === 'Saigon Com Nieu')).toBe(true)
    expect(bySearch.every(({ restaurant }) => restaurant.kiez === 'Schöneberg')).toBe(true)
    expect(bySearch.some(({ restaurant }) => restaurant.name === 'Niko Niko Ramen')).toBe(false)
    expect(new Set(bySearch.map(({ dish }) => dish.id))).toEqual(new Set(byKiez.map(({ dish }) => dish.id)))
    expect(bySearch.length).toBeLessThan(topDishes({}).length)
  })

  it('finds the same served dishes for Hähnchen and Hahnchen', () => {
    const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    const withUmlaut = topDishes({ q: 'Hähnchen' })
    const without = topDishes({ q: 'Hahnchen' })
    expect(withUmlaut.length).toBeGreaterThan(0)
    expect(new Set(without.map(({ dish }) => dish.id))).toEqual(new Set(withUmlaut.map(({ dish }) => dish.id)))
    for (const [restaurantName, dishName] of [['Saigon Com Nieu', 'Phở Gà'], ['Niko Niko Ramen', 'Shoyu']]) {
      for (const results of [withUmlaut, without]) {
        expect(results.some(({ dish, restaurant }) => restaurant.name === restaurantName && dish.name.toLowerCase().includes(dishName.toLowerCase()))).toBe(true)
      }
    }
    for (const { dish, restaurant } of withUmlaut) {
      expect(fold(`${dish.name} ${dish.description} ${dish.category} ${restaurant.name} ${restaurant.cuisine.join(' ')} ${restaurant.kiez}`)).toContain('hahnchen')
    }
  })

  it('does not match dishes through a restaurant cuisine tag translated to German', () => {
    expect(topDishes({ q: 'Hähnchen' }).some(({ dish, restaurant }) => restaurant.name === 'Bandol' && dish.name === 'Kimchi Tofu Ramen')).toBe(false)
  })

  it('selects restaurant rows by the German cuisine label and excludes other cuisines', () => {
    const rows = listRestaurants({})
    const found = matchingRestaurants(rows, 'Japanisch')
    expect(found.some(({ name }) => name === 'Niko Niko Ramen')).toBe(true)
    expect(found.some(({ name }) => name === 'Saigon Com Nieu')).toBe(false)
    expect(found.length).toBeLessThan(rows.length)
    expect(matchingRestaurants(rows, 'Vietnamesisch').some(({ name }) => name === 'Saigon Com Nieu')).toBe(true)
  })
})
