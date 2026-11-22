// Right panel of the map (/): the ranking for the active filters, the same order the phone map sheet shows.
import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { DishTile } from '../../components/DishTile'
import { SHOW_TEST_DATA } from '../../lib/flags'
import { Art } from '../../components/glyphs/Art'
import { TestBadge } from '../../components/ui'
import { filtersKey, topDishes, type DishFilters } from '../../data/api'
import { usePosition } from '../../lib/position'
import { dishCount, rankingBasis, rankingTitle } from '../../lib/ranking'
import { useResource } from '../../lib/resource'
import { WaitlistMapRow } from '../../screens/waitlist/WaitlistLink'
import type { GlobalFilters } from './globalFilters'

const PAGE_SIZE = 40

export function RankingPanel({ filters, choice, onReset }: { filters: DishFilters; choice: GlobalFilters; onReset: () => void }) {
  const t = useTranslation()
  const ranking = useResource(`desk-rank:${filtersKey(filters)}`, () => topDishes(filters))
  const [shown, setShown] = useState(PAGE_SIZE)
  const remaining = ranking.length - shown
  const { status } = usePosition()
  const anyTest = ranking.some((r) => r.restaurant.isTestData)

  return (
    <div className="rank-panel">
      <header className="rank-panel__head">
        <p className="t-label">{t('map')}</p>
        <h1 className="rank-panel__title">{rankingTitle(choice)}</h1>
        <p className="rank-panel__meta">
          <span>
            {dishCount(ranking.length)}
            {remaining > 0 && ` · ${t('nShown', shown)}`}
            {ranking.length > 0 && ` · ${rankingBasis(filters)}`}
          </span>
          {anyTest && <TestBadge />}
        </p>
        <WaitlistMapRow />
      </header>
      {ranking.length === 0 ? (
        <div className="rank-panel__empty" role="status">
          <Art name="empty-no-results" size={120} className="rank-panel__empty-art" />
          <p className="rank-panel__empty-title">{t('nothingMatchesThisSelectionRightNow')}</p>
          <p className="t-muted">{t('loosenAFilterOrChooseAnother')}</p>
          <button type="button" className="btn btn--secondary" onClick={onReset}>{t('resetFilters')}</button>
        </div>
      ) : (
        <>
          <ol className="rank-panel__list">
            {ranking.slice(0, shown).map((result, i) => (
              <li key={result.dish.id}>
                <DishTile result={result} rank={i + 1} showDistance={status === 'granted'} />
              </li>
            ))}
          </ol>
          {remaining > 0 && (
            <button type="button" className="btn btn--secondary btn--wide" onClick={() => setShown((n) => n + PAGE_SIZE)}>
              {Math.min(PAGE_SIZE, remaining)}{' '}{t('more')}
            </button>
          )}
        </>
      )}
      <p className="rank-panel__note">
        {t('nutritionEstimateNote')}
        {SHOW_TEST_DATA && t('testDataNote')}
      </p>
    </div>
  )
}

export function RankingPanelSkeleton() {
  return (
    <div className="rank-panel" aria-busy="true">
      <header className="rank-panel__head">
        <span className="skeleton panel-skel panel-skel--label" />
        <span className="skeleton panel-skel panel-skel--title" />
      </header>
      <div className="rank-panel__list">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skeleton panel-skel panel-skel--row" />
        ))}
      </div>
    </div>
  )
}
