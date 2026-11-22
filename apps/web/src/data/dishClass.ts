// Dish classification in the app: the shared taxonomy and healthy rule (packages/contract/src/dish-class.ts),
// German labels for the filter chips, the clay icon per dish type and a keyword fallback for the few
// hand-made seed dishes that never went through the pipeline's classifier.
import { translate } from '../i18n'
import type { Course, DishClass, DishType } from '../../../../packages/contract/src/dish-class.ts'

export {
  confidenceWeightedScore,
  HEALTHY_RULES,
  isHealthy,
  normalizeDishName,
  stripMenuNumber,
  unhealthyReason,
  unpackDishClass,
} from '../../../../packages/contract/src/dish-class.ts'
export { dishIcon, dishTypeCategory } from '../lib/category'
export type { CompactDishClass, Course, Cuisine, DishClass, DishType } from '../../../../packages/contract/src/dish-class.ts'

export const COURSE_LABEL: Record<Course, string> = {
  get main() { return translate('mainCourse') },
  get salad() { return translate('salad') },
  get soup() { return translate('soup') },
  get starter() { return translate('starter') },
  get side() { return translate('side') },
  get snack_breakfast() { return translate('breakfastAndSnacks') },
  get dessert() { return translate('dessert') },
  get drink() { return translate('drink') },
}

export const DISH_TYPE_LABEL: Record<DishType, string> = {
  get bowl() { return translate('bowl') },
  get salad() { return translate('salad') },
  get curry() { return translate('curry') },
  get ramen_noodles() { return translate('noodleSoupsAndNoodles') },
  get stir_fry() { return translate('wok') },
  get sushi() { return translate('sushi') },
  get soup() { return translate('soup') },
  get wrap() { return translate('wrap') },
  get sandwich() { return translate('sandwich') },
  get tacos() { return translate('tacos') },
  get pasta() { return translate('pasta') },
  get grill_plate() { return translate('grillPlate') },
  get dumplings() { return translate('dumplings') },
  get dip_spread() { return translate('dip') },
  get breakfast() { return translate('breakfast') },
  get burger() { return translate('burger') },
  get pizza() { return translate('pizza') },
  get doener_kebab() { return translate('doner') },
  get fried_snack() { return translate('friedSnacks') },
  get dessert() { return translate('dessert') },
  get drink() { return translate('drink') },
  get other() { return translate('other') },
}

/** Courses offered as filter chips, in menu order (the excluded ones never show, so no chip for them). */
export const COURSE_CHIPS: Course[] = ['main', 'salad', 'soup', 'starter', 'side', 'snack_breakfast']
/** Dish types offered as filter chips: the healthy ones a menu has often enough to be worth a tap. */
export const DISH_TYPE_CHIPS: DishType[] = ['bowl', 'salad', 'curry', 'ramen_noodles', 'stir_fry', 'sushi', 'wrap', 'sandwich', 'grill_plate', 'soup', 'pasta', 'dumplings']


const GUESS: Array<[RegExp, Course, DishType, boolean]> = [
  [/getränk|\bdrinks?\b|smoothie|kaffee|coffee|\btee\b|\bsaft\b|shake|lassi|limonade|\bjuice/i, 'drink', 'drink', false],
  [/dessert|kuchen|\bcake\b|eis\b|brownie|cookie|tiramisu/i, 'dessert', 'dessert', false],
  [/pommes|fries|nuggets|frittiert|tempura/i, 'side', 'fried_snack', false],
  [/\bdips?\b|hummus|sauce|soße|topping|extra\b/i, 'side', 'dip_spread', false],
  [/beilage|\bsides?\b|\breis\b|\brice\b(?!.*bowl)|brot\b|bread/i, 'side', 'other', false],
  [/vorspeise|starter|edamame|tapas|appetizer/i, 'starter', 'other', false],
  [/pizz|flammkuchen/i, 'main', 'pizza', true],
  [/burger/i, 'main', 'burger', true],
  [/döner|doner|kebab|dürüm/i, 'main', 'doener_kebab', true],
  [/salat|salad/i, 'salad', 'salad', true],
  [/suppe|soup|\bpho\b|ramen/i, 'soup', 'soup', true],
  [/curry/i, 'main', 'curry', true],
  [/wrap/i, 'main', 'wrap', true],
  [/pasta|spaghetti|penne|nudel|noodle/i, 'main', 'pasta', true],
  [/frühstück|breakfast|porridge|müsli|bagel|croissant/i, 'snack_breakfast', 'breakfast', false],
  [/bowl|poke/i, 'main', 'bowl', true],
]

/**
 * A low-confidence class from the menu text alone, for seed dishes the classifier never saw (the hand-made
 * spike and test records). Pipeline dishes always carry the model's class.
 */
export function guessDishClass(d: { name: string; category: string; diet: ReadonlyArray<'vegan' | 'vegetarian'> }): DishClass {
  const text = `${d.category} ${d.name}`
  const hit = GUESS.find(([re]) => re.test(text))
  const [course, dishType, isFullMeal] = hit ? [hit[1], hit[2], hit[3]] : (['main', 'other', true] as const)
  return {
    course,
    dishType,
    cuisine: 'international',
    vegan: d.diet.includes('vegan'),
    vegetarian: d.diet.includes('vegetarian'),
    glutenFree: false,
    isFullMeal,
    fried: dishType === 'fried_snack',
    creamy: false,
    sugary: dishType === 'dessert',
    confidence: 'low',
  }
}
