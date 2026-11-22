import { describe, expect, it } from 'vitest'
import type { Dish, Kiez, Restaurant } from '../src/data/contract.ts'
import { guessDishClass, type DishType } from '../src/data/dishClass.ts'
import { guideFiles } from './guides.ts'

const menu = { kind: 'website', url: 'https://restaurant.example/menu', fetchedAt: '2026-11-21T12:00:00Z' } as const
const range = { value: 500, min: 420, max: 580 }
const protein = { value: 30, min: 25, max: 35 }

function restaurant(id: string, kiez: Kiez, isTestData = false): Restaurant {
  return {
    id, kiez, isTestData, name: 'Café & Küche', placeId: 'external-place-id', osmId: null,
    address: 'Teststraße 1', lat: 52.5, lng: 13.4, openingHours: null, cuisine: [],
    baseSource: 'website', website: null, menu,
  }
}

function dishes(place: Restaurant, dishType: DishType, count: number): Dish[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${place.id}-${dishType}-${index}`,
    name: `${index === 0 ? 'Nuss <Sesam>' : 'Gericht'} ${index}`,
    restaurantId: place.id,
    description: '', price: index === 0 ? null : 10.5, category: dishType,
    healthScore: 90 - index, proteinPerEuro: null, image: null, diet: [], menuSource: menu,
    isTestData: false,
    dishClass: { ...guessDishClass({ name: '', category: '', diet: [] }), dishType, isFullMeal: true },
    nutrition: { kcal: range, protein, carbs: protein, fat: protein, confidence: 'medium', source: 'ai', method: '' },
  }))
}

const mitte = restaurant('mitte-place', 'Mitte')
const kreuzberg = restaurant('kreuzberg-place', 'Kreuzberg')
const test = restaurant('test-place', 'Kreuzberg', true)
const side = dishes(kreuzberg, 'salad', 5)[4]
side.dishClass!.isFullMeal = false
const seed = {
  restaurants: [mitte, kreuzberg, test],
  dishes: [
    ...dishes(mitte, 'salad', 5), ...dishes(mitte, 'bowl', 5),
    ...dishes(kreuzberg, 'salad', 4), ...dishes(kreuzberg, 'curry', 5),
    ...dishes(test, 'salad', 1), side, ...dishes(kreuzberg, 'breakfast', 5),
  ],
}
const files = guideFiles(seed, 'https://dishfit.example')

describe('static catalog guides', () => {
  it('publishes the five-dish intersection and skips thin and duplicate intersections in both languages', () => {
    for (const prefix of ['', 'en/']) {
      expect(files.has(`${prefix}kiez/mitte/salad.html`)).toBe(true)
      expect(files.has(`${prefix}kiez/kreuzberg/salad.html`)).toBe(false)
      expect(files.has(`${prefix}kiez/mitte/bowl.html`)).toBe(false)
      expect(files.has(`${prefix}kategorie/bowl.html`)).toBe(true)
      expect(files.has(`${prefix}kategorie/breakfast.html`)).toBe(true)
      expect(files.has(`${prefix}kiez/kreuzberg/breakfast.html`)).toBe(false)
    }
  })

  it('lists only the qualifying catalog meals with their real detail URLs and preserves their menu names', () => {
    const page = files.get('en/kiez/mitte/salad.html')!
    const [, embedded] = page.match(/<script type="application\/ld\+json">(.+)<\/script>/)!
    const { '@graph': [breadcrumbs, items, place] } = JSON.parse(embedded)
    expect(breadcrumbs.itemListElement[0].item).toBe('https://dishfit.example/')
    expect(breadcrumbs.itemListElement[1].item).toBe('https://dishfit.example/en/kiez/mitte')
    expect(items.itemListElement.map(({ item }: { item: { url: string } }) => item.url)).toEqual(
      [0, 1, 2, 3, 4].map((index) => `https://dishfit.example/d/mitte-place-salad-${index}`),
    )
    expect(items.itemListElement[0].item).toMatchObject({ '@type': 'MenuItem', name: 'Nuss <Sesam> 0' })
    expect(items.itemListElement[0].item).not.toHaveProperty('offers')
    expect(items.itemListElement[1].item.offers).toMatchObject({ price: 10.5, priceCurrency: 'EUR' })
    expect(place).toMatchObject({ '@type': 'Restaurant', name: 'Café & Küche', url: 'https://dishfit.example/r/mitte-place' })
    expect(page).toContain('Nuss &lt;Sesam&gt; 0')
    expect(page).toContain('Estimate · 420–580 kcal · 25–35 g protein')
    expect(page).not.toContain('external-place-id')
  })

  it('uses one origin for the canonical, reciprocal alternates, sitemap and robots file', () => {
    const de = 'https://dishfit.example/kiez/mitte/salad'
    const en = 'https://dishfit.example/en/kiez/mitte/salad'
    for (const [asset, canonical] of [['kiez/mitte/salad.html', de], ['en/kiez/mitte/salad.html', en]]) {
      const page = files.get(asset)
      expect(page).toContain(`rel="canonical" href="${canonical}"`)
      expect(page).toContain(`hreflang="de" href="${de}"`)
      expect(page).toContain(`hreflang="en" href="${en}"`)
      expect(files.get('sitemap.xml')).toContain(`<loc>${canonical}</loc>`)
    }
    expect(files.get('robots.txt')).toContain('Sitemap: https://dishfit.example/sitemap.xml')
    expect(() => guideFiles(seed, 'https://dishfit.example/app')).toThrow('HTTPS origin')
  })

  it('keeps a distinct Kiez combination when the citywide listing equals another published guide', () => {
    const top = dishes(mitte, 'salad', 30)
    const rest = dishes(kreuzberg, 'salad', 5).map((dish) => ({ ...dish, healthScore: 10 }))
    const crowded = guideFiles({ restaurants: [mitte, kreuzberg], dishes: [...top, ...rest, ...dishes(kreuzberg, 'bowl', 5)] }, 'https://dishfit.example')
    expect(crowded.has('kategorie/salad.html')).toBe(false)
    expect(crowded.has('kiez/kreuzberg/salad.html')).toBe(true)
    expect(crowded.get('kiez/kreuzberg/salad.html')).toContain('href="/search?kiez=Kreuzberg&amp;type=salad"')
  })
})
