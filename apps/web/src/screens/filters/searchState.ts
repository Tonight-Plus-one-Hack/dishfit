// Search and filter state: one plain object, read from and written to the URL query so every list is shareable.
// Query keys: q, sort, priceMax, kcalMax, proteinMin, scoreMin, diet, gf, course, type, open, dist, kiez (repeatable).
import { locale, translate } from '../../i18n'
import { KIEZE, type DishFilters, type DishSort, type Kiez, type LatLng } from '../../data/api'
import { DISH_TYPES } from '../../../../../packages/contract/src/dish-class'
import { COURSE_CHIPS, COURSE_LABEL, DISH_TYPE_CHIPS, DISH_TYPE_LABEL, type Course, type DishType } from '../../data/dishClass'
import { formatDistance, formatNumber, formatPrice } from '../../lib/format'

export type Diet = 'vegan' | 'vegetarian'

export interface SearchState {
  q: string
  sort: DishSort
  priceMax?: number
  kcalMax?: number
  proteinMin?: number
  /** Minimum health score, 0 to 100. */
  scoreMin?: number
  diet?: Diet
  /** Gluten-free only. */
  gf?: boolean
  /** Gang; without one the list shows whole meals only. */
  course?: Course
  /** Gerichtstyp. */
  type?: DishType
  open: boolean
  /** Metres from the user's position. */
  dist?: number
  kiez: Kiez[]
}

export const DEFAULT_SORT: DishSort = 'best'
export const EMPTY_STATE: SearchState = { q: '', sort: DEFAULT_SORT, open: false, kiez: [] }

export const SORTS: Array<{ value: DishSort; label: string }> = [
  { value: 'best', get label() { return translate('recommended') } },
  { value: 'healthScore', get label() { return translate('highestScore') } },
  { value: 'protein', get label() { return translate('mostProtein') } },
  { value: 'proteinPerEuro', get label() { return translate('proteinPerEuro') } },
  { value: 'price', get label() { return translate('lowestPrice') } },
  { value: 'kcal', get label() { return translate('lowestCalories') } },
  { value: 'distance', get label() { return translate('nearest') } },
]

const SORT_VALUES = new Set<string>(SORTS.map((s) => s.value))
const KIEZ_VALUES = new Set<string>(KIEZE)

/** Option steps for the filter sheet. A shared link may carry other values; the sheet adds those as extra options. */
export const PRICE_STEPS = [8, 10, 12, 15]
export const KCAL_STEPS = [400, 600, 800]
export const PROTEIN_STEPS = [20, 30, 40, 50]
export const SCORE_STEPS = [50, 60, 70, 80]
export const DISTANCE_STEPS = [500, 1000, 2000, 5000]

/** Defaults the quick chips switch on. */
export const QUICK = { priceMax: 12, proteinMin: 40, kcalMax: 600 } as const

function positive(params: URLSearchParams, key: string, max: number): number | undefined {
  const raw = params.get(key)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) && value > 0 && value <= max ? value : undefined
}

export function parseSearch(search: string): SearchState {
  const params = new URLSearchParams(search)
  const sort = params.get('sort')
  const diet = params.get('diet')
  const kiez = [...new Set(params.getAll('kiez'))].filter((k): k is Kiez => KIEZ_VALUES.has(k))
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    sort: sort && SORT_VALUES.has(sort) ? (sort as DishSort) : DEFAULT_SORT,
    priceMax: positive(params, 'priceMax', 500),
    kcalMax: positive(params, 'kcalMax', 5000),
    proteinMin: positive(params, 'proteinMin', 300),
    scoreMin: positive(params, 'scoreMin', 100),
    diet: diet === 'vegan' || diet === 'vegetarian' ? diet : undefined,
    gf: params.get('gf') === '1' || undefined,
    course: COURSE_CHIPS.find((c) => c === params.get('course')),
    type: DISH_TYPES.find((t) => t === params.get('type')),
    open: params.get('open') === '1',
    dist: positive(params, 'dist', 50000),
    kiez: KIEZE.filter((k) => kiez.includes(k)),
  }
}

/** The query string without the leading "?", keys in a fixed order and defaults left out. */
export function serializeSearch(state: SearchState): string {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort)
  if (state.priceMax !== undefined) params.set('priceMax', String(state.priceMax))
  if (state.kcalMax !== undefined) params.set('kcalMax', String(state.kcalMax))
  if (state.proteinMin !== undefined) params.set('proteinMin', String(state.proteinMin))
  if (state.scoreMin !== undefined) params.set('scoreMin', String(state.scoreMin))
  if (state.diet) params.set('diet', state.diet)
  if (state.gf) params.set('gf', '1')
  if (state.course) params.set('course', state.course)
  if (state.type) params.set('type', state.type)
  if (state.open) params.set('open', '1')
  if (state.dist !== undefined) params.set('dist', String(state.dist))
  for (const k of state.kiez) params.append('kiez', k)
  return params.toString()
}

export function sameState(a: SearchState, b: SearchState): boolean {
  return serializeSearch(a) === serializeSearch(b)
}

/** The API query for a state. Position is rounded so small GPS jitter keeps the cache key. */
export function toFilters(state: SearchState, near: LatLng): DishFilters {
  return {
    q: state.q || undefined,
    sort: state.sort,
    priceMax: state.priceMax,
    kcalMax: state.kcalMax,
    proteinMin: state.proteinMin,
    healthScoreMin: state.scoreMin,
    diet: state.diet ? [state.diet] : undefined,
    glutenFree: state.gf || undefined,
    course: state.course ? [state.course] : undefined,
    dishType: state.type ? [state.type] : undefined,
    // Without a chosen course the list is whole meals only, so a side or a dip never leads it.
    fullMealsOnly: state.course ? undefined : true,
    openNow: state.open || undefined,
    near: { lat: Math.round(near.lat * 1000) / 1000, lng: Math.round(near.lng * 1000) / 1000 },
    maxDistance: state.dist,
    // No limit: the count matches Discover and the map for the same choices, and the list renders page by page.
    kiez: state.kiez.length ? state.kiez : undefined,
  }
}

// ---------- Labels ----------

const euro = (n: number) => formatPrice(n, Number.isInteger(n) ? 0 : 2)

export const LABEL = {
  priceMax: (n: number) => translate('underBudget', euro(n)),
  kcalMax: (n: number) => translate('under1Kcal', formatNumber(n)),
  proteinMin: (n: number) => translate('count1GProtein', formatNumber(n)),
  scoreMin: (n: number) => translate('score1', formatNumber(n)),
  dist: (n: number) => translate('upTo1', formatDistance(n)),
  diet: (d: Diet) => translate(d === 'vegan' ? 'vegan' : 'vegetarian'),
  get gf() { return translate('glutenFree') },
  course: (c: Course) => COURSE_LABEL[c],
  type: (t: DishType) => DISH_TYPE_LABEL[t],
  get open() { return translate('openNow') },
}

export interface ActiveFilter {
  id: string
  label: string
  /** The state without this one filter. */
  without: (state: SearchState) => SearchState
}

/** Every filter that narrows the list, in display order. The search text is listed first when present. */
export function activeFilters(state: SearchState, { withQuery = false } = {}): ActiveFilter[] {
  const list: ActiveFilter[] = []
  if (withQuery && state.q) list.push({ id: 'q', label: `„${state.q}“`, without: (s) => ({ ...s, q: '' }) })
  if (state.priceMax !== undefined)
    list.push({ id: 'priceMax', label: LABEL.priceMax(state.priceMax), without: (s) => ({ ...s, priceMax: undefined }) })
  if (state.proteinMin !== undefined)
    list.push({ id: 'proteinMin', label: LABEL.proteinMin(state.proteinMin), without: (s) => ({ ...s, proteinMin: undefined }) })
  if (state.kcalMax !== undefined)
    list.push({ id: 'kcalMax', label: LABEL.kcalMax(state.kcalMax), without: (s) => ({ ...s, kcalMax: undefined }) })
  if (state.diet) list.push({ id: 'diet', label: LABEL.diet(state.diet), without: (s) => ({ ...s, diet: undefined }) })
  if (state.gf) list.push({ id: 'gf', label: LABEL.gf, without: (s) => ({ ...s, gf: undefined }) })
  if (state.course) list.push({ id: 'course', label: LABEL.course(state.course), without: (s) => ({ ...s, course: undefined }) })
  if (state.type) list.push({ id: 'type', label: LABEL.type(state.type), without: (s) => ({ ...s, type: undefined }) })
  if (state.open) list.push({ id: 'open', label: LABEL.open, without: (s) => ({ ...s, open: false }) })
  if (state.scoreMin !== undefined)
    list.push({ id: 'scoreMin', label: LABEL.scoreMin(state.scoreMin), without: (s) => ({ ...s, scoreMin: undefined }) })
  if (state.dist !== undefined) list.push({ id: 'dist', label: LABEL.dist(state.dist), without: (s) => ({ ...s, dist: undefined }) })
  for (const k of state.kiez) list.push({ id: `kiez:${k}`, label: k, without: (s) => ({ ...s, kiez: s.kiez.filter((x) => x !== k) }) })
  return list
}

/** Filters, search text and sort back to the start. */
export function clearFilters(state: SearchState): SearchState {
  return { ...EMPTY_STATE, q: state.q }
}

// ---------- List titles ----------

const HEADING: Record<DishSort, string> = {
  get best() { return translate('recommendedDishes') },
  get healthScore() { return translate('healthiestDishes') },
  get protein() { return translate('highestProteinDishes') },
  get proteinPerEuro() { return translate('mostProteinPerEuro') },
  get price() { return translate('lowestPricedDishes') },
  get kcal() { return translate('lowestCalorieDishes') },
  get distance() { return translate('dishesNearby') },
}

const TOP: Record<DishSort, string> = {
  get best() { return translate('searchStateRecommendedDishes') },
  get healthScore() { return translate('healthyDishes') },
  get protein() { return translate('protein') },
  get proteinPerEuro() { return translate('proteinPerEuro') },
  get price() { return translate('lowPricedDishes') },
  get kcal() { return translate('lowCalorieDishes') },
  get distance() { return translate('dishesNearby') },
}

function joinNeighbourhoods(items: string[]): string {
  return new Intl.ListFormat(locale()).format(items)
}

/** Appends "unter 12 € in Kreuzberg" to a list name, then the flags: ", vegan, jetzt offen". */
function describe(head: string, state: SearchState): string {
  const parts: string[] = []
  if (state.q) parts.push(translate('for1', state.q))
  if (state.type) parts.push(`(${LABEL.type(state.type)})`)
  if (state.course) parts.push(`(${LABEL.course(state.course)})`)
  if (state.priceMax !== undefined) parts.push(translate('underPrice', euro(state.priceMax)).trimStart())
  if (state.kcalMax !== undefined) parts.push(translate('searchStateUnder1Kcal', formatNumber(state.kcalMax)))
  if (state.proteinMin !== undefined) parts.push(translate('withAtLeast1GProtein', formatNumber(state.proteinMin)))
  if (state.scoreMin !== undefined) parts.push(translate('withAScoreOfAtLeast', formatNumber(state.scoreMin)))
  if (state.dist !== undefined) parts.push(translate('within1', formatDistance(state.dist)))
  if (state.kiez.length) parts.push(translate('inNeighbourhood', joinNeighbourhoods(state.kiez)).trimStart())
  const flags: string[] = []
  if (state.diet) flags.push(LABEL.diet(state.diet).toLowerCase())
  if (state.gf) flags.push(LABEL.gf.toLowerCase())
  if (state.open) flags.push(translate('searchStateOpenNow'))
  return [[head, ...parts].join(' '), ...flags].join(', ')
}

/** Heading above the results: "Bestes Protein unter 12 € in Kreuzberg". */
export function listHeading(state: SearchState): string {
  return describe(HEADING[state.sort], state)
}

/** Share title: "Top 10 Protein unter 12 € in Kreuzberg". */
export function shareTitle(state: SearchState, count: number): string {
  return describe(translate('top12', Math.min(10, count), TOP[state.sort]), state)
}

/** Chip rows for Gang and Gerichtstyp: each chip toggles its value (one per row). */
export const COURSE_OPTIONS = COURSE_CHIPS.map((value) => ({ value, get label() { return COURSE_LABEL[value] } }))
export const TYPE_OPTIONS = DISH_TYPE_CHIPS.map((value) => ({ value, get label() { return DISH_TYPE_LABEL[value] } }))
