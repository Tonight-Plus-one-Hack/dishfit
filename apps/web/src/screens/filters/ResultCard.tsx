// A dish result as a card: art, name, restaurant, Kiez, distance and open state, then a stat strip with
// kcal and protein (value plus range), protein per euro and price. The stat the list is sorted by is highlighted.
// The dish name is the link; its hit area stretches over the whole card.
import { menuSection } from '../../lib/menu-copy'
import { useTranslation } from '../../i18n'
import { DishThumb, OpenState, RestaurantName, ScoreRing, SourceBadge } from '../../components/ui'
import type { DishResult, DishSort, Range } from '../../data/api'
import { formatDistance, formatNumber, formatPrice } from '../../lib/format'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'

function Stat({
  label,
  value,
  unit,
  approx,
  range,
  highlight,
  quiet,
}: {
  label: string
  value: string
  unit?: string
  approx?: boolean
  range?: string
  highlight: boolean
  quiet?: boolean
}) {
  const t = useTranslation()
  return (
    <div className={`result-stat ${highlight ? 'is-key' : ''}`}>
      <dt className="result-stat__label">{label}</dt>
      <dd className="result-stat__body">
        <span className={`result-stat__value ${quiet ? 'is-quiet' : ''}`}>
          {approx && <small className="result-stat__approx">{t('approximate')}{' '}</small>}
          {value}
          {unit && <small className="result-stat__unit"> {unit}</small>}
        </span>
        {range && <span className="result-stat__range">{range}</span>}
      </dd>
    </div>
  )
}

const span = (r: Range, unit = '') => (r.min === r.max ? '' : `${r.min}–${r.max}${unit}`)

export function ResultCard({ result, sort }: { result: DishResult; sort: DishSort }) {
  const t = useTranslation()
  const { dish, restaurant, distance, openNow } = result
  const n = dish.nutrition
  const ai = n.source === 'ai'
  const diet = dish.diet.includes('vegan') ? t('vegan') : dish.diet.includes('vegetarian') ? t('vegetarian') : null
  return (
    <article className="result-card">
      <div className="result-card__top">
        <DishThumb dish={dish} className="result-card__thumb" />
        <div className="result-card__text">
          <h3 className="result-card__name">
            <Link to={paths.dish(dish.id)} className="result-card__link">
              {dish.name}
            </Link>
          </h3>
          <p className="result-card__place">
            <RestaurantName restaurant={restaurant} />
          </p>
          <p className="result-card__meta">
            <span>{restaurant.kiez}</span>
            {distance !== null && <span className={sort === 'distance' ? 'is-key' : undefined}>{formatDistance(distance)}</span>}
            <OpenState open={openNow} />
          </p>
        </div>
        <ScoreRing score={dish.healthScore} size={40} />
      </div>
      <dl className="result-card__stats">
        <Stat
          label="kcal"
          value={String(n.kcal.value)}
          approx={ai}
          range={span(n.kcal)}
          highlight={sort === 'kcal'}
        />
        <Stat
          label={t('protein')}
          value={String(n.protein.value)}
          unit="g"
          approx={ai}
          range={span(n.protein, ' g')}
          highlight={sort === 'protein'}
        />
        <Stat
          label={t('resultCardProtein')}
          value={dish.proteinPerEuro === null ? '–' : formatNumber(dish.proteinPerEuro)}
          unit={dish.proteinPerEuro === null ? undefined : 'g'}
          highlight={sort === 'proteinPerEuro'}
        />
        <Stat
          label={t('price')}
          value={formatPrice(dish.price)}
          quiet={dish.price === null}
          highlight={sort === 'price'}
        />
      </dl>
      <div className="result-card__foot">
        <SourceBadge nutrition={n} isTestData={dish.isTestData} />
        {diet && <span className="tag">{diet}</span>}
        <span className="result-card__category">{menuSection(dish.category)}</span>
      </div>
    </article>
  )
}

export function ResultCardSkeleton() {
  return (
    <div className="result-card result-card--skeleton" aria-hidden="true">
      <div className="result-card__top">
        <span className="skeleton result-card__thumb" />
        <span className="result-card__text">
          <span className="skeleton skeleton-line" style={{ width: '72%' }} />
          <span className="skeleton skeleton-line" style={{ width: '46%' }} />
          <span className="skeleton skeleton-line" style={{ width: '58%' }} />
        </span>
      </div>
      <span className="skeleton result-card__stats-skeleton" />
    </div>
  )
}
