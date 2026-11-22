// Data reads for the search screen, all through src/data/api.ts and the shared Suspense cache.
import { filtersKey, topDishes, type DishFilters, type DishResult } from '../../data/api'
import { useResource } from '../../lib/resource'

/** Every resource key of this screen starts with this prefix, so a retry can reload exactly these. */
export const KEY_PREFIX = 'search:'

export function useDishResults(filters: DishFilters): DishResult[] {
  return useResource(`${KEY_PREFIX}dishes:${filtersKey(filters)}`, () => topDishes(filters))
}

/** How many dishes each candidate query returns, loaded in one go. */
export function useCounts(queries: DishFilters[]): number[] {
  const key = `${KEY_PREFIX}counts:${queries.map(filtersKey).join('|')}`
  return useResource(key, () => Promise.all(queries.map((q) => topDishes(q).then((r) => r.length))))
}
