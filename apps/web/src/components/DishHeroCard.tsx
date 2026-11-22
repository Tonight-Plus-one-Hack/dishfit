// Big dish card for picks and saved dishes: art with score and heart, name, restaurant,
// kcal, protein and price with their ranges, then protein per euro and open state as chips.
import { useTranslation } from '../i18n'
import type { ReactNode } from 'react'
import type { DishResult } from '../data/contract'
import { formatDistance, formatNumber, formatPrice, formatRange } from '../lib/format'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { toggleSaved, useIsSaved } from '../lib/saved'
import { Icon } from './Icon'
import { DishThumb, RestaurantName, ScoreRing, SourceBadge } from './ui'
import './dish-hero-card.css'

/** Heart toggle that saves a dish on this device. */
export function SaveButton({ dishId, name, className }: { dishId: string; name: string; className?: string }) {
  const t = useTranslation()
  const saved = useIsSaved(dishId)
  return (
    <button
      type="button"
      className={`save-btn ${saved ? 'is-saved' : ''} ${className ?? ''}`}
      aria-pressed={saved}
      aria-label={saved ? t('unsave1', name) : t('saveDish', name)}
      onClick={() => toggleSaved(dishId)}
    >
      <Icon name="heart" size={20} filled={saved} strokeWidth={1.7} />
    </button>
  )
}

export function DishHeroCard({
  result,
  note,
  actions,
  className,
}: {
  result: DishResult
  /** One short line on why the dish fits, e.g. the share of the protein goal. */
  note?: ReactNode
  /** Extra controls under the card body, e.g. "add to today". */
  actions?: ReactNode
  className?: string
}) {
  const t = useTranslation()
  const { dish, restaurant, distance, openNow } = result
  const n = dish.nutrition
  const ai = n.source === 'ai'
  const approx = ai ? t('approximatePrefix') : ''
  return (
    <article className={`hero-card ${className ?? ''}`}>
      <div className="hero-card__media">
        <DishThumb dish={dish} className="hero-card__thumb" />
        <span className="hero-card__score">
          <ScoreRing score={dish.healthScore} size={40} />
        </span>
        <SaveButton dishId={dish.id} name={dish.name} className="hero-card__save" />
      </div>
      <div className="hero-card__body">
        <h3 className="hero-card__name">
          <Link to={paths.dish(dish.id)} className="hero-card__link">
            {dish.name}
          </Link>
        </h3>
        <p className="hero-card__meta">
          <RestaurantName restaurant={restaurant} />
          <span>
            {restaurant.kiez}
            {distance !== null && ` · ${formatDistance(distance)}`}
          </span>
        </p>
        <dl className="hero-card__stats">
          <div>
            <dt>{t('calories')}</dt>
            <dd>
              {approx}
              {n.kcal.value}
            </dd>
            <dd className="hero-card__range">{formatRange(n.kcal, 'kcal')}</dd>
          </div>
          <div>
            <dt>{t('protein')}</dt>
            <dd>
              {approx}
              {n.protein.value} g
            </dd>
            <dd className="hero-card__range">{formatRange(n.protein, 'g')}</dd>
          </div>
          <div>
            <dt>{t('price')}</dt>
            <dd>{formatPrice(dish.price)}</dd>
          </div>
        </dl>
        <p className="hero-card__chips">
          <SourceBadge nutrition={n} isTestData={dish.isTestData} compact />
          {dish.proteinPerEuro !== null && <span className="tag">{formatNumber(dish.proteinPerEuro)}{' '}{t('dishHeroCardGProtein')}</span>}
          {openNow === true && <span className="tag hero-card__open">{t('openNow')}</span>}
          {openNow === false && <span className="tag tag--outline">{t('closed')}</span>}
        </p>
        {note && <p className="hero-card__note">{note}</p>}
        {actions && <div className="hero-card__actions">{actions}</div>}
      </div>
    </article>
  )
}

/** Placeholder with the card's shape while dishes load. */
export function DishHeroCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`hero-card hero-card--skeleton ${className ?? ''}`} aria-hidden="true">
      <div className="skeleton hero-card__thumb" />
      <div className="hero-card__body">
        <div className="skeleton hero-card__sk-line" />
        <div className="skeleton hero-card__sk-line hero-card__sk-line--short" />
        <div className="skeleton hero-card__sk-stats" />
      </div>
    </div>
  )
}
