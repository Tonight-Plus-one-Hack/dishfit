// The dish result list: count, cards revealed with the motion system, page by page, or the empty state.
import { useTranslation } from '../../i18n'
import { useState, type ReactNode } from 'react'
import { filtersKey, type DishFilters, type LatLng } from '../../data/api'
import { distance, framer } from '../../motion'
import { EmptyResults } from './EmptyResults'
import { useDishResults } from './queries'
import { ResultCard, ResultCardSkeleton } from './ResultCard'
import type { SearchState } from './searchState'

const PAGE = 20
/** Only the first cards of a page stagger in; later ones reveal on scroll anyway. */
const STAGGER_CARDS = 5
const STAGGER_MS = 60

export function DishResults({
  state,
  filters,
  near,
  onChange,
  sortControl,
}: {
  state: SearchState
  filters: DishFilters
  near: LatLng
  onChange: (next: SearchState) => void
  sortControl: ReactNode
}) {
  const t = useTranslation()
  const results = useDishResults(filters)
  // A new query starts at the first page again.
  const key = filtersKey(filters)
  const [paging, setPaging] = useState({ key, shown: PAGE })
  const shown = paging.key === key ? paging.shown : PAGE

  if (results.length === 0) return <EmptyResults state={state} near={near} onChange={onChange} />

  return (
    <div className="results">
      <div className="results__bar">
        <p className="t-label results__count" aria-live="polite">
          {results.length === 1 ? t('count1Dish') : t('count1Dishes', results.length)}
        </p>
        {sortControl}
      </div>
      <ol className="results__list">
        {results.slice(0, shown).map((r, i) => (
          <framer.Reveal
            as="li"
            key={r.dish.id}
            y={distance.revealYSmall}
            delay={i % PAGE < STAGGER_CARDS ? (i % PAGE) * STAGGER_MS : 0}
            amount={0.2}
          >
            <ResultCard result={r} sort={state.sort} />
          </framer.Reveal>
        ))}
      </ol>
      {results.length > shown && (
        <button type="button" className="btn btn--secondary btn--wide" onClick={() => setPaging({ key, shown: shown + PAGE })}>
          {Math.min(PAGE, results.length - shown)}{' '}{t('more')}</button>
      )}
    </div>
  )
}

export function DishResultsSkeleton() {
  const t = useTranslation()
  return (
    <div className="results" aria-busy="true" aria-label={t('loadingResults')}>
      <div className="results__bar">
        <span className="skeleton skeleton-line results__count-skeleton" />
      </div>
      <div className="results__list">
        <ResultCardSkeleton />
        <ResultCardSkeleton />
        <ResultCardSkeleton />
      </div>
    </div>
  )
}
