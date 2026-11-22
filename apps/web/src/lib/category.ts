// Categories for the clay icons: a restaurant's from its cuisine tags (OSM English or our German labels) and its
// healthy dishes, a dish's from its class or its menu section and name.
import { translate } from '../i18n'
import type { DishClass } from '../../../../packages/contract/src/dish-class.ts'

export type Category = 'bowl' | 'salad' | 'burger' | 'cafe' | 'asian' | 'vegan' | 'bakery' | 'pizza'

// One rule list for cuisine tags and names; the first tag that matches decides, so the primary cuisine wins.
const RULES: Array<[Category, RegExp]> = [
  ['pizza', /pizz|italian|italien/i],
  ['burger', /burger|grill|barbecue|bbq|kebab|döner|doner|steak|american|sandwich|imbiss/i],
  ['asian', /asia|vietnam|thai|\blao\b|japan|sushi|ramen|korea|chinese|chines|indian|indisch|curry|noodle|nudel|\bpho\b|dim sum/i],
  ['salad', /salat|salad|säfte|juice/i],
  ['vegan', /vegan|vegetar/i],
  ['bakery', /bäck|bakery|backwar|brot|bread|pastry|patisserie/i],
  ['cafe', /caf[eé]|coffee|kaffee|brunch|breakfast|frühstück/i],
  ['bowl', /bowl|poke|fitness|protein|falafel|hummus|liban|leban|levant|israel|mediterr|middle.?east|arab|türk|turk|greek|griech|uzbek/i],
]

function ruleFor(text: string): Category | null {
  return RULES.find(([, re]) => re.test(text))?.[0] ?? null
}

/** A restaurant's category from its cuisine tags alone (first matching tag wins); a bowl when nothing matches. */
export function categoryOf(cuisine: readonly string[], name = ''): Category {
  for (const tag of cuisine) {
    const hit = ruleFor(tag)
    if (hit) return hit
  }
  return (name && (ruleFor(name) ?? DISH_RULES.find(([, re]) => re.test(name))?.[0])) || 'bowl'
}

/** A section has to hold this share of the menu before it names a restaurant without cuisine tags. */
const MENU_SHARE = 0.3

/**
 * Categories whose signature dishes the healthy rule hides (pizza; burgers, döner and fried snacks), so a
 * restaurant tagged with one is drawn as what its healthy dishes are instead (HEALTHY_RULES in dish-class.ts).
 */
const HIDDEN_SIGNATURE: ReadonlySet<Category> = new Set(['pizza', 'burger'])

/** The most common icon of the given dishes, never burger, pizza or café (the healthy rule hides those dishes). */
function dishMix(dishes: ReadonlyArray<IconDish>): [Category, number] | null {
  const counts = new Map<Category, number>()
  for (const d of dishes) {
    const c = dishIcon(d)
    if (!UNHEALTHY_ICONS.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0] ?? null
}

/**
 * The pin icon for a restaurant, from its served (healthy) dishes: its cuisine tags, then its name, then what
 * its menu mostly is. A place tagged pizza or burger is drawn as its healthy dish mix (an Italian place that
 * serves salads gets the salad icon), so no pin ever shows a pizza or a burger. A bowl when nothing says more.
 */
export function restaurantCategory(r: { name: string; cuisine: readonly string[] }, dishes: ReadonlyArray<IconDish> = []): Category {
  const tagged = categoryOf(r.cuisine, r.name)
  if (HIDDEN_SIGNATURE.has(tagged)) {
    const mix = dishMix(dishes)
    return mix ? mix[0] : 'bowl'
  }
  if (tagged !== 'bowl' || dishes.length === 0) return tagged
  if (r.cuisine.some((t) => ruleFor(t) === 'bowl') || ruleFor(r.name) === 'bowl') return 'bowl'
  const mix = dishMix(dishes)
  return mix && mix[1] / dishes.length >= MENU_SHARE ? mix[0] : 'bowl'
}

/** The icon a restaurant shows everywhere: the one the served seed derived from its healthy dishes. */
export function restaurantIcon(r: { name: string; cuisine: readonly string[]; category?: Category }): Category {
  return r.category ?? restaurantCategory(r)
}

const DISH_RULES: Array<[Category, RegExp]> = [
  ['pizza', /pizz|flammkuchen/i],
  ['burger', /burger|sandwich|toast|bagel|\bwraps?\b|döner|dürüm|kebab|falafel|\bpita\b|banh mi|schnitzel/i],
  ['salad', /salat|salad|fattoush|tabou?leh/i],
  ['asian', /suppe|soup|\bpho\b|ramen|udon|laksa|jjigae|sushi|maki|curry|bibimbap|noodle|nudel|\bbun\b|bo kho|gyoza|dumpling|wok|tofu|tandoori|tikka|masala|biryani|\bdal\b|nuong|teriyaki/i],
  ['cafe', /getränk|\bdrinks?\b|smoothie|kaffee|coffee|\btee\b|\bsaft\b|\bshakes?\b|\blassi\b|limonade|dessert|kuchen/i],
  ['bakery', /brot|croissant|brötchen|bakery|gebäck|waffel|pancake|porridge|müsli|frühstück|breakfast/i],
  ['vegan', /vegan|vegetar|veggie/i],
  ['bowl', /bowl|poke|\breis|\brice\b|pasta|quinoa/i],
]

/** The clay icon for a dish without its own illustration; a bowl when nothing matches. */
export function dishCategory(dish: { name: string; category?: string }): Category {
  const text = `${dish.category ?? ''} ${dish.name}`
  return DISH_RULES.find(([, re]) => re.test(text))?.[0] ?? 'bowl'
}

export const CATEGORY_LABEL: Record<Category, string> = {
  get bowl() { return translate('bowlsAndMediterranean') },
  get salad() { return translate('salads') },
  get burger() { return translate('burgersAndGrill') },
  get cafe() { return translate('cafe') },
  get asian() { return translate('asian') },
  get vegan() { return translate('veganAndVegetarian') },
  get bakery() { return translate('bakery') },
  get pizza() { return translate('pizza') },
}

const ASIAN_CUISINES = new Set(['vietnamese', 'thai', 'chinese', 'japanese', 'korean', 'indian'])

type IconDish = { name: string; category?: string; dishClass?: Pick<DishClass, 'dishType' | 'cuisine'> }

/**
 * Icons that stand for what the healthy rule hides (burgers and döner, pizza, desserts and drinks), so a
 * healthy dish never wears one (HEALTHY_RULES in packages/contract/src/dish-class.ts).
 */
export const UNHEALTHY_ICONS: ReadonlySet<Category> = new Set(['burger', 'pizza', 'cafe'])

/** The plate icon a healthy dish of this cuisine gets when its type names no closer one. */
function cuisineIcon(cuisine: string): Category {
  return ASIAN_CUISINES.has(cuisine) ? 'asian' : 'bowl'
}

/**
 * The clay icon for a dish type: the closest of the eight category illustrations. Healthy types that would
 * otherwise read as a burger (wraps, sandwiches, tacos, grill plates such as "Chicken Tandoori") follow their
 * cuisine instead. Only the hidden types (burger, döner, fried snacks, pizza, dessert, drink) keep those icons.
 */
export function dishTypeCategory(c: Pick<DishClass, 'dishType' | 'cuisine'>): Category | null {
  switch (c.dishType) {
    case 'bowl':
    case 'dip_spread':
    case 'pasta':
      return 'bowl'
    case 'salad':
      return 'salad'
    case 'curry':
    case 'ramen_noodles':
    case 'stir_fry':
    case 'sushi':
    case 'dumplings':
      return 'asian'
    case 'soup':
    case 'wrap':
    case 'sandwich':
    case 'tacos':
    case 'grill_plate':
      return cuisineIcon(c.cuisine)
    case 'burger':
    case 'doener_kebab':
    case 'fried_snack':
      return 'burger'
    case 'pizza':
      return 'pizza'
    case 'breakfast':
      return 'bakery'
    case 'dessert':
    case 'drink':
      return 'cafe'
    default:
      return null
  }
}

/**
 * The icon for any dish: its classified type first, the menu-text rules otherwise. A classified dish of a
 * healthy type never ends on a burger, pizza or café icon: the menu-text rules read "Tandoori (2 Stück)" or
 * "Pizzabrot" too loosely, so it falls back to its cuisine.
 */
export function dishIcon(dish: IconDish): Category {
  const c = dish.dishClass
  const typed = c && dishTypeCategory(c)
  if (typed) return typed
  const text = dishCategory(dish)
  return c && UNHEALTHY_ICONS.has(text) ? cuisineIcon(c.cuisine) : text
}
