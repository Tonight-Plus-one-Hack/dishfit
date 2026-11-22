// Global filters of the desktop filter bar. The URL query is the source of truth on the map (/) and uses the same keys
// as the phone map (kiez, open=1, budget=0, protein=1), so a link opens the same selection on both layouts.
// Like the phone map, no `kiez` means the home Kiez from onboarding and `kiez=nah` means "in deiner Nähe".
// Detail routes (/r/:id, /d/:id) carry no query; they keep the last choice from a store.
import { useEffect } from 'react'
import type { Kiez } from '../../data/api'
import { track } from '../../lib/analytics'
import { useLocation } from '../../lib/location'
import { readMapCategory, type MapCategory } from '../../lib/map-category'
import { useHomeKiez } from '../../lib/position'
import { BUDGET_EUR, kiezFromParam, kiezParam, PROTEIN_GOAL_G, type RankingChoice } from '../../lib/ranking'
import { navigate, parse } from '../../lib/routes'
import { persisted, useStore } from '../../lib/store'
import { EMPTY_STATE, serializeSearch } from '../../screens/filters/searchState'

export type GlobalFilters = Pick<RankingChoice, 'kiez' | 'underBudget' | 'proteinPlus' | 'openNow'> & { mapCategory?: MapCategory }

/** The choice before any filter is touched: under 12 EUR, in the home Kiez or near the user. */
export function defaultFilters(home: Kiez | null): GlobalFilters {
  return { kiez: home, underBudget: true, proteinPlus: false, openNow: false }
}

/** The last choice on the map; null until the user has been there. */
const filterStore = persisted<GlobalFilters | null>('dishfit.desktop.filters.v2', null)

export function readFilters(params: URLSearchParams, home: Kiez | null): GlobalFilters {
  return {
    kiez: kiezFromParam(params.get('kiez'), home),
    underBudget: params.get('budget') !== '0',
    proteinPlus: params.get('protein') === '1',
    openNow: params.get('open') === '1',
    mapCategory: readMapCategory(params.get('category')),
  }
}

/** The map URL (the start page) for a choice; same keys as the phone map. */
export function mapHref(filters: GlobalFilters, home: Kiez | null): string {
  const p = new URLSearchParams()
  const kiez = kiezParam(filters.kiez, home)
  if (kiez) p.set('kiez', kiez)
  if (!filters.underBudget) p.set('budget', '0')
  if (filters.proteinPlus) p.set('protein', '1')
  if (filters.openNow) p.set('open', '1')
  if (filters.mapCategory) p.set('category', filters.mapCategory)
  const qs = p.toString()
  return qs ? `/?${qs}` : '/'
}

/** Discover only narrows by Kiez; the rest of its ranking is fixed (under 12 EUR, by protein). */
export function homeHref(filters: GlobalFilters, home: Kiez | null): string {
  const kiez = kiezParam(filters.kiez, home)
  return kiez ? `/entdecken?kiez=${encodeURIComponent(kiez)}` : '/entdecken'
}

/** The /search URL for a free-text query plus the global filters, in the search screen's own query keys. */
export function searchHref(q: string, filters: GlobalFilters): string {
  return `/search?${serializeSearch({
    ...EMPTY_STATE,
    q: q.trim().slice(0, 80),
    open: filters.openNow,
    priceMax: filters.underBudget ? BUDGET_EUR : undefined,
    proteinMin: filters.proteinPlus ? PROTEIN_GOAL_G : undefined,
    kiez: filters.kiez ? [filters.kiez as Kiez] : [],
  })}`.replace(/\?$/, '')
}

/** The active filters and a setter. Setting a filter shows the filtered map list. */
export function useGlobalFilters(): [GlobalFilters, (next: Partial<GlobalFilters>) => void, Kiez | null] {
  const { pathname, search } = useLocation()
  const stored = useStore(filterStore)
  const home = useHomeKiez()
  const onMap = parse(pathname).name === 'map'
  const value = onMap ? readFilters(new URLSearchParams(search), home) : (stored ?? defaultFilters(home))

  // Mirror the URL into the store, so detail routes and the sidebar link keep the choice.
  useEffect(() => {
    if (!onMap) return
    const fromUrl = readFilters(new URLSearchParams(search), home)
    if (JSON.stringify(fromUrl) !== JSON.stringify(filterStore.get())) filterStore.set(fromUrl)
  }, [onMap, search, home])

  const set = (next: Partial<GlobalFilters>) => {
    const merged = { ...value, ...next }
    if (mapHref(merged, home) !== mapHref(value, home)) track('filter_change')
    filterStore.set(merged)
    navigate(mapHref(merged, home), { replace: onMap })
  }
  return [value, set, home]
}

/** The remembered choice and the home Kiez, for links into the map and Discover. */
export function useStoredFilters(): { filters: GlobalFilters; home: Kiez | null } {
  const home = useHomeKiez()
  const stored = useStore(filterStore)
  return { filters: stored ?? defaultFilters(home), home }
}
