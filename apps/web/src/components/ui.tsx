// Shared nutrition and data primitives. Screens compose these; new primitives go in new files.
import { useTranslation } from '../i18n'
import { useState, type CSSProperties } from 'react'
import type { Confidence, Dish, NutritionEstimate, Restaurant } from '../data/contract'
import { dishImageSrc } from '../lib/dish-image'
import { formatPrice, formatRange } from '../lib/format'
import { dishMapCategory, MAP_CATEGORIES } from '../lib/map-category'
import { scoreTone } from '../lib/nutrition'
import { Art } from './glyphs/Art'
import { Icon } from './Icon'
import './ui.css'

/** Marks seed values that do not describe a real place. Required wherever test data shows. */
export function TestBadge({ className }: { className?: string }) {
  const t = useTranslation()
  return (
    <span className={`test-badge ${className ?? ''}`} title={t('fictionalDataForTestingTheApp')}>{t('uiTestData')}</span>
  )
}

const CONFIDENCE_LABEL = { high: 'highConfidence', medium: 'mediumConfidence', low: 'lowConfidence' } as const

/**
 * "KI-Schätzung" or "Offizielle Angabe", plus how sure the estimate is. "Offizielle Angabe" needs a value the
 * restaurant published itself on a real record: pass the dish's isTestData, test data never claims official values.
 */
export function SourceBadge({ nutrition, compact = false, isTestData = false }: { nutrition: NutritionEstimate; compact?: boolean; isTestData?: boolean }) {
  const t = useTranslation()
  const ai = nutrition.source !== 'official' || isTestData
  return (
    <span className={`source-badge ${ai ? 'source-badge--ai' : 'source-badge--official'}`}>
      <Icon name={ai ? 'spark' : 'shieldCheck'} size={12} strokeWidth={1.8} />
      {ai ? t('aiEstimate') : t('officialValues')}
      {ai && !compact && <span className="source-badge__conf">{t('confidence')}{' '}{t(CONFIDENCE_LABEL[nutrition.confidence])}</span>}
    </span>
  )
}

export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const t = useTranslation()
  const level = { low: 1, medium: 2, high: 3 }[confidence]
  return (
    <span className="conf" role="img" aria-label={t('count1Confidence', t(CONFIDENCE_LABEL[confidence]))}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= level ? 'is-on' : ''} />
      ))}
    </span>
  )
}

/** Compact kcal and macros line for cards: "ca. 620 kcal · ca. 42 g Protein · 11,90 €". */
export function MacroLine({ dish, showPrice = true }: { dish: Dish; showPrice?: boolean }) {
  const t = useTranslation()
  const n = dish.nutrition
  const approx = n.source === 'ai' ? t('approximatePrefix') : ''
  return (
    <p className="macro-line">
      <span>
        <b>
          {approx}
          {n.kcal.value}
        </b>{' '}
        kcal
      </span>
      <span>
        <b>
          {approx}
          {n.protein.value} g
        </b>{' '}{t('protein')}</span>
      {showPrice && <span className="macro-line__price">{formatPrice(dish.price)}</span>}
    </p>
  )
}

/** The four values with their ranges, for detail views. */
export function MacroGrid({ nutrition }: { nutrition: NutritionEstimate }) {
  const t = useTranslation()
  const rows = [
    { label: t('calories'), value: nutrition.kcal, unit: 'kcal' },
    { label: t('protein'), value: nutrition.protein, unit: 'g' },
    { label: t('carbs'), value: nutrition.carbs, unit: 'g' },
    { label: t('fat'), value: nutrition.fat, unit: 'g' },
  ]
  return (
    <dl className="macro-grid">
      {rows.map((r) => (
        <div key={r.label} className="macro-grid__cell">
          <dt className="t-label">{r.label}</dt>
          <dd>
            <span className="macro-grid__value">
              {nutrition.source === 'ai' && <small className="macro-grid__approx">{t('approximate')}{' '}</small>}
              {r.value.value}
              <small> {r.unit}</small>
            </span>
            <span className="macro-grid__range">{formatRange(r.value, r.unit)}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Health score 0 to 100 as a small ring. */
export function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const t = useTranslation()
  const r = 16
  const c = 2 * Math.PI * r
  return (
    <span className={`score-ring score-ring--${scoreTone(score)}`} style={{ width: size, height: size } as CSSProperties} role="img" aria-label={t('healthScore1OutOf100', score)}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={r} className="score-ring__track" />
        <circle
          cx="20"
          cy="20"
          r={r}
          className="score-ring__value"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span className="score-ring__num">{score}</span>
    </span>
  )
}

/**
 * Our AI illustration with its required "KI-Bild" label. Without one, the clay icon (icon set A) for the dish's
 * section stands in on a brand tile. `labelArt` marks that tile as "Illustration" where it replaces a photo.
 */
export function DishThumb({
  dish,
  className,
  labelArt = false,
}: {
  dish: Pick<Dish, 'id' | 'name' | 'image'> & Partial<Pick<Dish, 'category' | 'dishClass' | 'diet'>>
  className?: string
  labelArt?: boolean
}) {
  const t = useTranslation()
  const [failed, setFailed] = useState<string | null>(null)
  const image = dish.image
  if (image && failed !== image.ref) {
    return (
      <span className={`dish-thumb ${className ?? ''}`}>
        <img src={dishImageSrc(image.ref)} alt={t('estimationIllustration', dish.name)} loading="lazy" decoding="async" onError={() => setFailed(image.ref)} />
        <span className="dish-thumb__label">{t('aiImage')}</span>
      </span>
    )
  }
  return (
    <span className={`dish-thumb dish-thumb--art ${className ?? ''}`} aria-hidden={labelArt ? undefined : true}>
      <Art name={MAP_CATEGORIES[dishMapCategory(dish)].art} size={256} className="dish-thumb__art" />
      {labelArt && <span className="dish-thumb__label dish-thumb__label--art" role="img" title={t('illustration')} aria-label={t('illustration')}>{t('aiShort')}</span>}
    </span>
  )
}

export function OpenState({ open }: { open: boolean | null }) {
  const t = useTranslation()
  // Unknown hours say nothing useful in a list, so nothing is shown rather than "Öffnungszeiten unbekannt".
  if (open === null) return null
  return <span className={`open-state ${open ? 'is-open' : 'is-closed'}`}>{open ? t('open') : t('closed')}</span>
}

/** The restaurant name with its Testdaten badge when needed. */
export function RestaurantName({ restaurant }: { restaurant: Pick<Restaurant, 'name' | 'isTestData'> }) {
  return (
    <span className="restaurant-name">
      {restaurant.name}
      {restaurant.isTestData && <TestBadge />}
    </span>
  )
}
