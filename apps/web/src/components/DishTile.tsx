// Dish card in the MenuFit/Cal AI manner: image left, name and short description, health ring top right,
// a macro row with dividers, and a footer with the restaurant chip and the Route action.
import { useState } from 'react'
import { dishDescription } from '../lib/menu-copy'
import { useTranslation } from '../i18n'
import type { DishResult, NutritionEstimate } from '../data/contract'
import { track } from '../lib/analytics'
import { restaurantIcon } from '../lib/category'
import { formatDistance, formatPrice, formatRange } from '../lib/format'
import { hasLivePlace } from '../lib/google-places'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { routeUrl } from '../screens/restaurant/info'
import { Glyph, type GlyphName } from './glyphs/Glyph'
import { PlaceCover } from './PlaceCover'
import { HealthRing } from './Rings'
import { DishThumb, SourceBadge, TestBadge } from './ui'
import './dish-tile.css'

/** 440 kcal | 48 g Protein | 8 g KH | 21 g Fett. Estimates carry a "~"; test data never reads as official. */
export function MacroRow({ nutrition, isTestData = false }: { nutrition: NutritionEstimate; isTestData?: boolean }) {
  const t = useTranslation()
  const approx = nutrition.source !== 'official' || isTestData ? '~' : ''
  const cells: Array<{ key: string; glyph: GlyphName; value: number; unit: string; label: string }> = [
    { key: 'kcal', glyph: 'flame', value: nutrition.kcal.value, unit: '', label: 'kcal' },
    { key: 'protein', glyph: 'protein', value: nutrition.protein.value, unit: 'g', label: t('protein') },
    { key: 'carbs', glyph: 'carbs', value: nutrition.carbs.value, unit: 'g', label: t('carbsShort') },
    { key: 'fat', glyph: 'fat', value: nutrition.fat.value, unit: 'g', label: t('fat') },
  ]
  const spoken = cells.map((c) => `${approx ? t('approximatePrefix') : ''}${c.value}${c.unit ? ' g' : ''} ${c.key === 'carbs' ? t('carbs') : c.label}`).join(', ')
  return (
    <dl className="macro-row" aria-label={spoken}>
      {cells.map((c) => (
        <div key={c.key} className={`macro-row__cell macro-row__cell--${c.key}`} aria-hidden="true">
          <dt>
            <Glyph name={c.glyph} size={13} />
            {c.label}
          </dt>
          <dd>
            {approx}
            {c.value}
            {c.unit && <small>{c.unit}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function DishTile({ result, rank, showDistance = false }: { result: DishResult; rank?: number; showDistance?: boolean }) {
  const t = useTranslation()
  const { dish, restaurant } = result
  const [failedLogo, setFailedLogo] = useState<string>()
  const placeId = hasLivePlace(restaurant) ? restaurant.placeId : null
  const logo = restaurant.logoUrl !== failedLogo ? restaurant.logoUrl : undefined
  const hasCover = Boolean(placeId)
  const thumb = <DishThumb dish={dish} className="dtile__thumb" labelArt />
  const n = dish.nutrition
  const where = [restaurant.kiez, showDistance && result.distance !== null ? formatDistance(result.distance) : null].filter(Boolean).join(' · ')
  return (
    <article className={`dtile${hasCover ? ' dtile--cover' : ''}`}>
      {hasCover && (
        <div className="dtile__cover">
          {placeId && <PlaceCover key={placeId} placeId={placeId} fallback={thumb} />}
        </div>
      )}
      <div className="dtile__top">
        {!hasCover && (
          <span className="dtile__media">
            {thumb}
            {rank !== undefined && <span className="dtile__rank" aria-hidden="true">{rank}</span>}
          </span>
        )}
        <div className="dtile__body">
          {logo && (
            <p className="dtile__brand">
              <img src={logo} alt="" width={20} height={20} loading="lazy" onError={() => setFailedLogo(logo)} />
              <span>{restaurant.name}</span>
            </p>
          )}
          <h3 className="dtile__name">
            <Link to={paths.dish(dish.id)} className="dtile__link">
              {rank !== undefined && (hasCover ? (
                <span className="dtile__rank dtile__rank--inline"><span className="sr-only">{t('rank')}{' '}</span>{rank}</span>
              ) : (
                <span className="sr-only">{t('rank')}{' '}{rank}: </span>
              ))}
              {dish.name}
            </Link>
          </h3>
          {dishDescription(dish) && <p className="dtile__desc">{dishDescription(dish)}</p>}
          <p className="dtile__price">{formatPrice(dish.price)}</p>
        </div>
        <HealthRing score={dish.healthScore} size={46} />
      </div>

      <MacroRow nutrition={n} isTestData={dish.isTestData} />

      <p className="dtile__source">
        <SourceBadge nutrition={n} isTestData={dish.isTestData} compact />
        <span>{formatRange(n.kcal, 'kcal')}</span>
      </p>

      <footer className="dtile__foot">
        <Link to={paths.restaurant(restaurant.id)} className="place-chip">
          <span className="place-chip__avatar" aria-hidden="true">
            <Glyph name={`cat-${restaurantIcon(restaurant)}`} size={20} />
          </span>
          <span className="place-chip__text">
            <span className="place-chip__name">{restaurant.name}</span>
            <span className="place-chip__where">{where}</span>
          </span>
          {restaurant.isTestData && <TestBadge />}
        </Link>
        <a
          href={routeUrl(restaurant)}
          target="_blank"
          rel="noreferrer"
          className="btn-brand"
          aria-label={t('directionsTo1', restaurant.name)}
          onClick={() => track('directions_tap')}
          onAuxClick={(e) => e.button === 1 && track('directions_tap')}
        >
          <Glyph name="route" size={16} />
          {t('directions')}
        </a>
      </footer>
    </article>
  )
}
