import { useRef, type CSSProperties } from 'react'
import { Art } from '../../components/glyphs/Art'
import { Icon } from '../../components/Icon'
import { MAP_CATEGORIES, type MapCategory } from '../../lib/map-category'
import { useTranslation } from '../../i18n'
import './map-category-filter.css'

export function MapCategoryFilter({ value, onChange }: { value?: MapCategory; onChange?: (value?: MapCategory) => void }) {
  const t = useTranslation()
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)
  const choose = (category?: MapCategory) => {
    if (details.current) details.current.open = false
    summary.current?.focus()
    if (category !== value) onChange?.(category)
  }
  return (
    <details ref={details} className="map-category" onKeyDown={(event) => {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false
        summary.current?.focus()
      }
    }}>
      <summary ref={summary} className="map-category__trigger" aria-label={value ? t('mapCategoryAria', t(MAP_CATEGORIES[value].label)) : undefined}>
        <Icon name="pin" size={16} />
        <span>{value ? t(MAP_CATEGORIES[value].label) : t('mapCategories')}</span>
        <Icon className="map-category__chevron" name="chevronRight" size={14} />
      </summary>
      <div className="map-category__options" role="group" aria-label={t('mapLegendAndFilter')}>
        {onChange ? (
          <button type="button" className="map-category__option" aria-pressed={!value} onClick={() => choose()}>
            <span className="map-category__symbol"><Icon name="map" size={16} /></span>
            {t('allMapCategories')}
          </button>
        ) : null}
        {(Object.keys(MAP_CATEGORIES) as MapCategory[]).map((category) => {
          const { art, color, label } = MAP_CATEGORIES[category]
          const symbol = <span className="map-category__symbol" style={{ '--category-color': color } as CSSProperties}><Art name={art} size={20} /></span>
          return onChange ? (
            <button key={category} type="button" className="map-category__option" aria-pressed={value === category} onClick={() => choose(category)}>
              {symbol}
              {t(label)}
            </button>
          ) : (
            <span key={category} className="map-category__option map-category__option--static">
              {symbol}
              {t(label)}
            </span>
          )
        })}
      </div>
    </details>
  )
}
