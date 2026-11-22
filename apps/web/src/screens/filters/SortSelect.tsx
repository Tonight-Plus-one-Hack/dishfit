// Sort order as a native select styled as a chip: the phone's own picker, fully accessible.
import { useTranslation } from '../../i18n'
import { Icon } from '../../components/Icon'
import type { DishSort } from '../../data/api'
import { SORTS } from './searchState'

export function SortSelect({ value, onChange }: { value: DishSort; onChange: (sort: DishSort) => void }) {
  const t = useTranslation()
  return (
    <label className="sort-select">
      <span className="sr-only">{t('sortBy')}</span>
      <Icon name="list" size={14} className="sort-select__icon" />
      <select value={value} onChange={(e) => onChange(e.target.value as DishSort)}>
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <Icon name="chevronRight" size={14} className="sort-select__chevron" />
    </label>
  )
}
