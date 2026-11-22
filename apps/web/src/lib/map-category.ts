import type { ArtName } from '../components/glyphs/Art'
import type { MessageKey } from '../i18n'
import type { Dish, Restaurant } from '../data/contract'

export const MAP_CATEGORIES = {
  salad: { label: 'mapCategorySalad', art: 'cat-salad', color: '#459557' },
  poke: { label: 'mapCategoryPoke', art: 'cat-poke', color: '#338e8a' },
  curry: { label: 'mapCategoryCurry', art: 'cat-curry', color: '#d28c27' },
  soup: { label: 'mapCategorySoup', art: 'cat-asian', color: '#896bc1' },
  wrap: { label: 'mapCategoryWrap', art: 'cat-wrap', color: '#b98b52' },
  fish: { label: 'mapCategoryFish', art: 'cat-fish', color: '#507fbe' },
  grill: { label: 'mapCategoryGrill', art: 'cat-grill', color: '#c66e5c' },
  veggie: { label: 'mapCategoryVeggie', art: 'cat-vegan', color: '#6b9750' },
  breakfast: { label: 'mapCategoryBreakfast', art: 'cat-bakery', color: '#bd75ac' },
  mixed: { label: 'mapCategoryMixed', art: 'cat-bowl', color: '#829098' },
} as const satisfies Record<string, { label: MessageKey; art: ArtName; color: string }>

export type MapCategory = keyof typeof MAP_CATEGORIES

export function readMapCategory(value: string | null): MapCategory | undefined {
  return value && Object.hasOwn(MAP_CATEGORIES, value) ? value as MapCategory : undefined
}

type CategoryRule = [MapCategory, RegExp]

const SIGNATURES: CategoryRule[] = [
  ['poke', /\bpok[eé]\b|hawaiian/i],
  ['salad', /salat|salad|\bbowls?\b/i],
  ['veggie', /vegan|vegetari|plant.based/i],
  ['breakfast', /frühstück|breakfast|brunch|bakery|bäckerei/i],
  ['soup', /suppen?|soups?|\bpho\b|ramen/i],
  ['curry', /curry/i],
  ['wrap', /wrap|sandwich|burrito/i],
  ['fish', /seafood|fisch|\bfish\b|sushi/i],
  ['grill', /grill|steak|barbecue|bbq/i],
]

const DISH_TYPES: Partial<Record<NonNullable<Dish['dishClass']>['dishType'], MapCategory>> = {
  salad: 'salad',
  bowl: 'salad',
  curry: 'curry',
  soup: 'soup',
  ramen_noodles: 'soup',
  wrap: 'wrap',
  sandwich: 'wrap',
  tacos: 'wrap',
  sushi: 'fish',
  grill_plate: 'grill',
  breakfast: 'breakfast',
}

export function dishMapCategory(dish: Pick<Dish, 'name'> & Partial<Pick<Dish, 'dishClass' | 'diet'>>): MapCategory {
  const cls = dish.dishClass
  if (cls?.cuisine === 'hawaiian' && cls.dishType === 'bowl') return 'poke'
  if (cls?.course === 'soup' || cls?.dishType === 'soup') return 'soup'
  const named = SIGNATURES.find(([, pattern]) => pattern.test(dish.name))?.[0]
  if (named) return named
  const typed = cls && DISH_TYPES[cls.dishType]
  if (typed) return typed
  if (/lachs|salmon|seelachs|thunfisch|garnelen|shrimp|prawn|mực/i.test(dish.name)) return 'fish'
  if (dish.diet?.length) return 'veggie'
  if (/hähnchen|chicken|rind|beef|lamm|lamb|ente|duck|schwein|pork/i.test(dish.name)) return 'grill'
  return 'mixed'
}

/** Prefer a restaurant's stated specialty, then count the categories of its healthy menu. */
export function deriveMapCategory(
  restaurant: Pick<Restaurant, 'cuisine'>,
  dishes: readonly Dish[],
): MapCategory {
  const served = dishes.map(dishMapCategory)
  const signature = restaurant.cuisine
    .map((tag) => SIGNATURES.find(([, pattern]) => pattern.test(tag.normalize('NFC')))?.[0])
    .find((category) => category !== undefined && served.includes(category))
  if (signature) return signature

  const counts = new Map<MapCategory, number>()
  for (const dish of dishes) {
    const category = dishMapCategory(dish)
    counts.set(category, (counts.get(category) ?? 0) + (dish.dishClass?.isFullMeal ? 2 : 1))
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed'
}
