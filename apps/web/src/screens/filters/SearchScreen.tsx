// Search and filters over dishes and restaurants. The filter state lives in the URL query (see searchState.ts),
// so a list like "Top 10 Protein unter 12 € in Kreuzberg" can be shared as a link.
import { applyDocumentLanguage, useTranslation } from '../../i18n'
import { Suspense, useDeferredValue, useEffect, useRef, useState } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import { ShareSheet, type ShareTarget } from '../../components/ShareSheet'
import { track } from '../../lib/analytics'
import { BRAND } from '../../lib/brand'
import { SHOW_TEST_DATA } from '../../lib/flags'
import { usePosition } from '../../lib/position'
import { paths } from '../../lib/routes'
import { framer } from '../../motion'
import { DishResults, DishResultsSkeleton } from './DishResults'
import { FilterSheet } from './FilterSheet'
import { useDishResults } from './queries'
import { ClassChips, QuickChips } from './QuickChips'
import { RestaurantMatches } from './RestaurantMatches'
import { QuietBoundary, ResultsBoundary } from './ResultsBoundary'
import { SearchBar } from './SearchBar'
import { SortSelect } from './SortSelect'
import { activeFilters, listHeading, serializeSearch, shareTitle, toFilters, type SearchState } from './searchState'
import { useSearchState } from './useSearchState'
import './filters.css'

function ShareButton({ state, onShare }: { state: SearchState; onShare: (target: ShareTarget) => void }) {
  const t = useTranslation()
  const { position } = usePosition()
  const count = useDishResults(toFilters(state, position)).length
  const title = shareTitle(state, count)
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={t('shareList')}
      disabled={count === 0}
      onClick={() => {
        track('share_tap')
        onShare({
          title,
          text: t('count1NutritionAndPricesOn2', title, BRAND.name),
          url: `${BRAND.url}${paths.search(serializeSearch(state))}`,
          meta: count === 1 ? t('count1Dish') : t('count1Dishes', count),
        })
      }}
    >
      <Icon name="share" size={20} />
    </button>
  )
}

function ShareFallback() {
  const t = useTranslation()
  return (
    <button type="button" className="icon-button" aria-label={t('shareList')} disabled>
      <Icon name="share" size={20} />
    </button>
  )
}

/** Adds is-stuck to the toolbar once it pins to the top, for its divider. */
function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [sentinel, stuck] as const
}

export function SearchScreen() {
  const t = useTranslation()
  const [state, setState] = useSearchState()
  const { position } = usePosition()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [share, setShare] = useState<ShareTarget | null>(null)
  const [sentinel, stuck] = useStuck()

  // Results follow the state a beat behind: while a new query loads, the old list stays (dimmed) instead of a skeleton.
  const shown = useDeferredValue(state)
  const stale = shown !== state
  const filters = toFilters(shown, position)
  const heading = listHeading(shown)

  useEffect(() => {
    document.title = `${heading} · ${BRAND.name}`
    return () => applyDocumentLanguage()
  }, [heading])

  return (
    <AppShell tab="search">
      <ScreenHeader
        large
        eyebrow={t('dishesAndRestaurants')}
        title={<framer.CharReveal text={t('search')} trigger="mount" />}
        actions={
          <QuietBoundary fallback={<ShareFallback />} resetKey={serializeSearch(shown)}>
            <Suspense fallback={<ShareFallback />}>
              <ShareButton state={shown} onShare={setShare} />
            </Suspense>
          </QuietBoundary>
        }
      />

      <div ref={sentinel} className="search-toolbar__sentinel" aria-hidden="true" />
      <div className={`search-toolbar ${stuck ? 'is-stuck' : ''}`}>
        <SearchBar
          query={state.q}
          onQuery={(q) => setState((s) => ({ ...s, q }))}
          filterCount={activeFilters(state).length}
          onOpenFilters={() => setSheetOpen(true)}
        />
        <QuickChips state={state} onChange={setState} />
      </div>

      <div className={`page search-page ${stale ? 'is-stale' : ''}`} aria-busy={stale}>
        <ClassChips state={state} onChange={setState} />
        <ResultsBoundary resetKey={serializeSearch(shown)}>
          {shown.q && (
            <Suspense fallback={null}>
              <RestaurantMatches filters={filters} q={shown.q} />
            </Suspense>
          )}
          <section className="search-section" aria-labelledby="results-title">
            <h2 id="results-title" className="results__heading">
              {heading}
            </h2>
            <Suspense fallback={<DishResultsSkeleton />}>
              <DishResults
                state={shown}
                filters={filters}
                near={position}
                onChange={setState}
                sortControl={<SortSelect value={state.sort} onChange={(sort) => setState((s) => ({ ...s, sort }))} />}
              />
            </Suspense>
          </section>
        </ResultsBoundary>
        <p className="search-note t-muted">{t('nutritionIsEstimatedFromTheMenu')}{SHOW_TEST_DATA && t('testDataNote')}
        </p>
      </div>

      {sheetOpen && (
        <FilterSheet initial={state} near={position} onApply={setState} onClose={() => setSheetOpen(false)} />
      )}
      <ShareSheet target={share} onClose={() => setShare(null)} />
    </AppShell>
  )
}
