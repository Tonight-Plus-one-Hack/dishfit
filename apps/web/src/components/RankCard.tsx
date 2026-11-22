// Ranked dish cards for the map carousel, the map sheet list and Discover (Entdecken).
// RankCard is the big card (art on top, stat chips below); RankRow is the compact list row with a rank number.
import { useState } from 'react'
import { useTranslation } from '../i18n'
import type { DishResult } from '../data/contract'
import { formatDistance, formatNumber, formatPrice, formatRange } from '../lib/format'
import { hasLivePlace } from '../lib/google-places'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { PlaceCover } from './PlaceCover'
import { DishThumb, OpenState, RestaurantName, ScoreRing, SourceBadge } from './ui'
import './rank-card.css'

function placeLine(result: DishResult, showDistance: boolean): string {
  const parts: string[] = [result.restaurant.kiez]
  if (showDistance && result.distance !== null) parts.push(formatDistance(result.distance))
  return parts.join(' · ')
}

function Stats({ result, perEuro = true }: { result: DishResult; perEuro?: boolean }) {
  const t = useTranslation()
  const n = result.dish.nutrition
  const approx = n.source === 'ai' ? t('approximatePrefix') : ''
  return (
    <span className="rank-stats">
      <span className="rank-stat rank-stat--protein">
        <b>
          {approx}
          {n.protein.value} g
        </b>{' '}{t('protein')}</span>
      <span className="rank-stat">
        <b>
          {approx}
          {n.kcal.value}
        </b>{' '}
        kcal
      </span>
      {perEuro && result.dish.proteinPerEuro !== null && (
        <span className="rank-stat" title={t('gramsOfProteinPerEuroUsing')}>
          <b>{formatNumber(result.dish.proteinPerEuro)} g</b>/€
        </span>
      )}
    </span>
  )
}

/**
 * Big dish card. `rank` adds the place number; `showDistance` only when the user shared a position.
 * The live Google cover sits outside the link to the dish,
 * so its own controls (Google Maps, attribution) stay usable; the health score and the place number then move into the head.
 */
export function RankCard({
  result,
  rank,
  showDistance = false,
  className,
  active = false,
  showPlaceCover = true,
}: {
  result: DishResult
  rank?: number
  showDistance?: boolean
  className?: string
  active?: boolean
  showPlaceCover?: boolean
}) {
  const t = useTranslation()
  const { dish, restaurant, openNow } = result
  const [failedLogo, setFailedLogo] = useState<string>()
  const placeId = showPlaceCover && hasLivePlace(restaurant) ? restaurant.placeId : null
  const logo = restaurant.logoUrl !== failedLogo ? restaurant.logoUrl : undefined
  const thumbnail = <DishThumb dish={dish} className="rank-card__thumb" labelArt />
  const testData = restaurant.isTestData ? t('testData') : ''
  const label = rank === undefined
    ? t('dishAtRestaurant', dish.name, restaurant.name, testData)
    : t('rank12At34', rank, dish.name, restaurant.name, testData)
  const body = (
    <span className="rank-card__body">
      <span className="rank-card__head">
        {placeId && rank !== undefined && <span className="rank-card__rank rank-card__rank--inline">{rank}</span>}
        <span className="rank-card__name">{dish.name}</span>
        {placeId && (
          <span className="rank-card__score-inline">
            <ScoreRing score={dish.healthScore} size={32} />
          </span>
        )}
        <span className="rank-card__price">{formatPrice(dish.price)}</span>
      </span>
      <span className="rank-card__place">
        {logo && <img src={logo} className="rank-card__logo" alt="" width={22} height={22} loading="lazy" onError={() => setFailedLogo(logo)} />}
        <RestaurantName restaurant={restaurant} />
        <span className="rank-card__where">{placeLine(result, showDistance)}</span>
      </span>
      <Stats result={result} />
      <span className="rank-card__foot">
        <SourceBadge nutrition={dish.nutrition} isTestData={dish.isTestData} compact />
        <span className="rank-card__range">{formatRange(dish.nutrition.kcal, 'kcal')}</span>
        <OpenState open={openNow} />
      </span>
    </span>
  )
  if (placeId) {
    return (
      <div className={`rank-card rank-card--cover ${active ? 'is-active' : ''} ${className ?? ''}`}>
        <div className="rank-card__cover">
          <PlaceCover key={placeId} placeId={placeId} fallback={thumbnail} />
        </div>
        <Link to={paths.dish(dish.id)} className="rank-card__link" aria-label={label}>
          {body}
        </Link>
      </div>
    )
  }
  return (
    <Link to={paths.dish(dish.id)} className={`rank-card ${active ? 'is-active' : ''} ${className ?? ''}`} aria-label={label}>
      <span className="rank-card__media">
        {thumbnail}
        {rank !== undefined && <span className="rank-card__rank">{rank}</span>}
        <span className="rank-card__score">
          <ScoreRing score={dish.healthScore} size={36} />
        </span>
      </span>
      {body}
    </Link>
  )
}

/** Compact ranked row for long lists. */
export function RankRow({ result, rank, showDistance = false }: { result: DishResult; rank: number; showDistance?: boolean }) {
  const t = useTranslation()
  const { dish, restaurant } = result
  const placeId = hasLivePlace(restaurant) ? restaurant.placeId : null
  const [photo, setPhoto] = useState(false)
  const row = (
    <Link
      to={paths.dish(dish.id)}
      className={`rank-row${photo ? ' rank-row--photo' : ''}`}
      aria-label={t('rank12At34', rank, dish.name, restaurant.name, restaurant.isTestData ? t('testData') : '')}
    >
      <span className="rank-row__rank" aria-hidden="true">
        {rank}
      </span>
      {!photo && <DishThumb dish={dish} className="rank-row__thumb" labelArt />}
      <span className="rank-row__body">
        <span className="rank-row__head">
          <span className="rank-row__name">{dish.name}</span>
          <span className="rank-row__price">{formatPrice(dish.price)}</span>
        </span>
        <span className="rank-row__place">
          <RestaurantName restaurant={restaurant} />
          <span className="rank-card__where">{placeLine(result, showDistance)}</span>
        </span>
        <Stats result={result} perEuro={false} />
        <span className="rank-row__foot">
          <SourceBadge nutrition={dish.nutrition} isTestData={dish.isTestData} compact />
          <span className="rank-card__range">{formatRange(dish.nutrition.kcal, 'kcal')}</span>
        </span>
      </span>
    </Link>
  )
  if (!placeId) return row
  return (
    <div className="rank-row-cover">
      <div className="rank-row__cover">
        <PlaceCover key={placeId} placeId={placeId} onPhoto={setPhoto} />
      </div>
      {row}
    </div>
  )
}

/** Placeholder with the same footprint as RankCard while results load. */
export function RankCardSkeleton({ className }: { className?: string }) {
  return (
    <span className={`rank-card rank-card--skeleton ${className ?? ''}`} aria-hidden="true">
      <span className="rank-card__media skeleton" />
      <span className="rank-card__body">
        <span className="skeleton rank-skel rank-skel--title" />
        <span className="skeleton rank-skel rank-skel--line" />
        <span className="skeleton rank-skel rank-skel--chips" />
      </span>
    </span>
  )
}
