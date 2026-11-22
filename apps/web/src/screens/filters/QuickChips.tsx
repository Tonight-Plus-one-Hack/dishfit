// One-tap filters under the search field. Filters set in the sheet that have no quick chip show first, removable.
import { useTranslation } from '../../i18n'
import { Icon } from '../../components/Icon'
import { COURSE_OPTIONS, LABEL, QUICK, TYPE_OPTIONS, activeFilters, type SearchState } from './searchState'

interface Quick {
  id: string
  label: string
  on: boolean
  toggle: (s: SearchState) => SearchState
}

function quickChips(state: SearchState): Quick[] {
  return [
    {
      id: 'priceMax',
      label: LABEL.priceMax(state.priceMax ?? QUICK.priceMax),
      on: state.priceMax !== undefined,
      toggle: (s) => ({ ...s, priceMax: s.priceMax === undefined ? QUICK.priceMax : undefined }),
    },
    {
      id: 'proteinMin',
      label: LABEL.proteinMin(state.proteinMin ?? QUICK.proteinMin),
      on: state.proteinMin !== undefined,
      toggle: (s) => ({ ...s, proteinMin: s.proteinMin === undefined ? QUICK.proteinMin : undefined }),
    },
    {
      id: 'kcalMax',
      label: LABEL.kcalMax(state.kcalMax ?? QUICK.kcalMax),
      on: state.kcalMax !== undefined,
      toggle: (s) => ({ ...s, kcalMax: s.kcalMax === undefined ? QUICK.kcalMax : undefined }),
    },
    {
      id: 'diet',
      label: state.diet === 'vegetarian' ? LABEL.diet('vegetarian') : LABEL.diet('vegan'),
      on: state.diet !== undefined,
      toggle: (s) => ({ ...s, diet: s.diet ? undefined : 'vegan' }),
    },
    {
      id: 'gf',
      label: LABEL.gf,
      on: !!state.gf,
      toggle: (s) => ({ ...s, gf: s.gf ? undefined : true }),
    },
    {
      id: 'open',
      label: LABEL.open,
      on: state.open,
      toggle: (s) => ({ ...s, open: !s.open }),
    },
  ]
}

const QUICK_IDS = new Set(['priceMax', 'proteinMin', 'kcalMax', 'diet', 'gf', 'open', 'course', 'type'])

export function QuickChips({ state, onChange }: { state: SearchState; onChange: (next: SearchState) => void }) {
  const t = useTranslation()
  const extra = activeFilters(state).filter((f) => !QUICK_IDS.has(f.id))
  return (
    <div className="quick-chips" role="group" aria-label={t('quickFilters')}>
      {extra.map((f) => (
        <button
          key={f.id}
          type="button"
          className="chip search-chip"
          aria-pressed="true"
          aria-label={t('remove1', f.label)}
          onClick={() => onChange(f.without(state))}
        >
          {f.label}
          <Icon name="close" size={12} strokeWidth={2} />
        </button>
      ))}
      {quickChips(state).map((c) => (
        <button
          key={c.id}
          type="button"
          className="chip search-chip"
          aria-pressed={c.on}
          onClick={() => onChange(c.toggle(state))}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

/** Gang and Gerichtstyp chip rows under the quick chips; one choice per row, tap again to clear. */
export function ClassChips({ state, onChange }: { state: SearchState; onChange: (next: SearchState) => void }) {
  const t = useTranslation()
  return (
    <div className="class-chips">
      <div className="quick-chips quick-chips--class" role="group" aria-label={t('course')}>
        {COURSE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip search-chip"
            aria-pressed={state.course === o.value}
            onClick={() => onChange({ ...state, course: state.course === o.value ? undefined : o.value })}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="quick-chips quick-chips--class" role="group" aria-label={t('dishType')}>
        {TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip search-chip"
            aria-pressed={state.type === o.value}
            onClick={() => onChange({ ...state, type: state.type === o.value ? undefined : o.value })}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
