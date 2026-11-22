// The pin icons must tell restaurants apart on the real seed data, not draw one bowl everywhere, and follow the
// healthy rule: an icon comes from the dishes we serve, so no pin ever shows a pizza.
import { describe, expect, it } from 'vitest'
import { listRestaurants } from '../data/mock'
import { SEED } from '../data/seed/visible'
import { categoryOf, dishIcon, restaurantCategory, restaurantIcon, UNHEALTHY_ICONS, type Category } from './category'

const real = SEED.restaurants.filter((r) => !r.isTestData)

function distribution(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of real) {
    const c = restaurantIcon(r)
    out[c] = (out[c] ?? 0) + 1
  }
  return out
}

const salad = (name: string) => ({ name, dishClass: { dishType: 'salad', cuisine: 'italian' } as const })
const pasta = (name: string) => ({ name, dishClass: { dishType: 'pasta', cuisine: 'italian' } as const })

describe('categoryOf', () => {
  it.each<[string[], string, Category]>([
    [['pizza'], 'Pizza Verde', 'pizza'],
    [['italian'], 'Trattoria', 'pizza'],
    [['burger'], 'X', 'burger'],
    [['sandwich', 'breakfast'], 'X', 'burger'],
    [['breakfast', 'sandwich'], 'X', 'cafe'],
    [['vietnamese'], 'X', 'asian'],
    [['indian'], 'X', 'asian'],
    [['Salate', 'Vegan'], 'X', 'salad'],
    [['Vegetarisch', 'Suppen'], 'X', 'vegan'],
    [['bakery'], 'X', 'bakery'],
    [['coffee_shop'], 'X', 'cafe'],
    [['lebanese'], 'X', 'bowl'],
    [['middle_eastern'], 'X', 'bowl'],
    [[], "Chen's Beef Noodle House", 'asian'],
    [[], 'Burgermeister', 'burger'],
    [['regional'], 'Kitchen', 'bowl'],
  ])('%j %s -> %s', (cuisine, name, expected) => {
    expect(categoryOf(cuisine, name)).toBe(expected)
  })

  it('does not read "kitchen" as Chinese', () => {
    expect(categoryOf(['german'], "Lia's Kitchen")).toBe('bowl')
  })
})

describe('restaurantCategory on the real seed', () => {
  it('falls back to what the menu mostly is when tags and name say nothing', () => {
    const salads = Array.from({ length: 4 }, (_, i) => ({ name: `Salat ${i}`, category: 'Salate' }))
    expect(restaurantCategory({ name: 'Da Toni', cuisine: [] }, [...salads, { name: 'Tiramisu', category: 'Dessert' }])).toBe('salad')
  })

  it('draws a pizza place as its healthy dishes, never as a pizza', () => {
    expect(restaurantCategory({ name: 'Oregano', cuisine: ['pizza', 'pasta', 'salad', 'italian'] }, [salad('Insalata'), salad('Caprese'), pasta('Penne')])).toBe('salad')
    expect(restaurantCategory({ name: 'Trattoria', cuisine: ['italian'] }, [pasta('Penne'), pasta('Linguine')])).toBe('bowl')
    expect(restaurantCategory({ name: 'Trattoria', cuisine: ['italian'] })).toBe('bowl')
  })

  it('draws a burger place that serves only salads as a salad place', () => {
    expect(restaurantCategory({ name: 'Bobsek Burger', cuisine: ['burger'] }, [salad('A'), salad('B')])).toBe('salad')
  })

  it('never shows a pizza or burger pin on the served seed, on the map or anywhere else', () => {
    // A café keeps its café icon: that names the place, not a hidden dish.
    const hiddenSignature = (r: Parameters<typeof restaurantIcon>[0]) => ['pizza', 'burger'].includes(restaurantIcon(r))
    expect(real.filter(hiddenSignature).map((r) => r.name)).toEqual([])
    expect(listRestaurants({}).filter(hiddenSignature).map((r) => r.name)).toEqual([])
    const oregano = real.find((r) => r.name === 'Oregano' && r.kiez === 'Kreuzberg')
    expect(oregano && restaurantIcon(oregano)).toBe('salad')
  })

  it('keeps a tagged bowl place a bowl, whatever its menu', () => {
    expect(restaurantCategory({ name: 'Fatoush', cuisine: ['lebanese'] }, [{ name: 'Falafel Wrap', category: 'Wraps' }])).toBe('bowl')
  })

  it('never gives a healthy dish of the served seed a burger, pizza or dessert icon', () => {
    expect(SEED.dishes.filter((d) => UNHEALTHY_ICONS.has(dishIcon(d))).map((d) => `${d.name} (${d.dishClass?.dishType})`)).toEqual([])
    const tandoori = SEED.dishes.find((d) => d.name === 'Chicken Tandoori (2 Stück)')
    expect(tandoori && dishIcon(tandoori)).toBe('asian')
  })

  it('draws at least three distinct icons and no single icon on more than four in five places', () => {
    // Pizza and burger places are drawn as their healthy dishes, so the map keeps the plate icons (bowl, salad,
    // Asian) and, once the seed has them, vegan, bakery and café places.
    const dist = distribution()
    console.info('category distribution (real seed):', JSON.stringify(dist), `of ${real.length}`)
    expect(Object.keys(dist).length).toBeGreaterThanOrEqual(3)
    expect(dist.pizza).toBeUndefined()
    expect(dist.burger).toBeUndefined()
    expect(Math.max(...Object.values(dist)) / real.length).toBeLessThan(0.8)
  })
})
