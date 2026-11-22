// No dish matches: suggest the single filters whose removal brings back the most dishes.
import { useTranslation } from '../../i18n'
import { Art } from '../../components/glyphs/Art'
import { Icon } from '../../components/Icon'
import type { LatLng } from '../../data/api'
import { useCounts } from './queries'
import { activeFilters, clearFilters, toFilters, type SearchState } from './searchState'

const MAX_SUGGESTIONS = 3

export function EmptyResults({
  state,
  near,
  onChange,
}: {
  state: SearchState
  near: LatLng
  onChange: (next: SearchState) => void
}) {
  const t = useTranslation()
  const filters = activeFilters(state, { withQuery: true })
  const relaxed = filters.map((f) => f.without(state))
  const counts = useCounts(relaxed.map((s) => toFilters(s, near)))
  const suggestions = filters
    .map((f, i) => ({ filter: f, next: relaxed[i], count: counts[i] }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_SUGGESTIONS)
  const canClear = filters.some((f) => f.id !== 'q')

  return (
    <div className="search-empty" role="status">
      <Art name="empty-no-results" size={132} className="search-empty__art" />
      <h3 className="search-empty__title">{t('noMatchingDishes')}</h3>
      <p className="t-muted search-empty__text">
        {suggestions.length > 0
          ? t('tryLooseningAFilterToSee')
          : state.q
            ? t('checkYourSpellingOrSearchFor')
            : t('weDontHaveAnyMenusIn')}
      </p>
      {suggestions.length > 0 && (
        <ul className="search-empty__list">
          {suggestions.map((s) => (
            <li key={s.filter.id}>
              <button type="button" className="relax-row" onClick={() => onChange(s.next)}>
                <span>{t('without')}{' '}<b>{s.filter.label}</b>
                </span>
                <span className="relax-row__count">
                  {s.count === 1 ? t('count1Dish') : t('count1Dishes', s.count)}
                  <Icon name="arrowRight" size={16} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canClear && (
        <button type="button" className="btn btn--secondary" onClick={() => onChange(clearFilters(state))}>{t('resetAllFilters')}</button>
      )}
    </div>
  )
}
