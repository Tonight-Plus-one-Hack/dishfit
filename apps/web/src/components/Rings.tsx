// Progress rings in the Cal AI manner: thick round-capped arcs on a soft track, big numbers, small units.
// MacroRing (protein, carbs, fat), KcalRing (brand gradient with a flame) and HealthRing (score in colour bands).
import { useTranslation } from '../i18n'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { MACRO_LABEL, MACRO_SHORT, scoreTone, type Macro } from '../lib/nutrition'
import { CountUp } from './CountUp'
import { Glyph } from './glyphs/Glyph'
import './rings.css'

export function Ring({
  value,
  size,
  stroke,
  color,
  children,
  className,
}: {
  /** 0 to 1; values above 1 draw a full ring. */
  value: number
  size: number
  stroke: number
  color: string
  children?: ReactNode
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const shown = Math.max(0, Math.min(1, value))
  return (
    <span className={`ring ${className ?? ''}`} style={{ width: size, height: size } as CSSProperties}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" strokeWidth={stroke} />
        {shown > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className="ring__value"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ '--ring-c': c } as CSSProperties}
          />
        )}
      </svg>
      {children && <span className="ring__inside">{children}</span>}
    </span>
  )
}

/** One macro: ring in its colour, with the grams inside (dish) or its glyph inside (day). */
export function MacroRing({
  macro,
  grams,
  target,
  size = 76,
  inside = 'value',
  approx = false,
}: {
  macro: Macro
  grams: number
  target: number
  size?: number
  inside?: 'value' | 'glyph'
  approx?: boolean
}) {
  const t = useTranslation()
  const share = target > 0 ? grams / target : 0
  return (
    <span className={`macro-ring macro-ring--${macro}`} role="img" aria-label={t('count12G34Of', approx ? t('approximatePrefix') : '', grams, MACRO_LABEL[macro], Math.round(share * 100))}>
      <Ring value={share} size={size} stroke={Math.max(5, Math.round(size / 11))} color={`var(--macro-${macro})`}>
        {inside === 'glyph' ? (
          <span className="macro-ring__glyph">
            <Glyph name={macro} size={Math.round(size * 0.26)} />
          </span>
        ) : (
          <span className="macro-ring__value">
            <b>
              {approx && <small>~</small>}
              <CountUp value={grams} />
              <small>g</small>
            </b>
            <span>{MACRO_SHORT[macro]}</span>
          </span>
        )}
      </Ring>
    </span>
  )
}

/** The day's energy: brand gradient arc with the flame in the middle. */
export function EnergyRing({ value, size = 112, over = false }: { value: number; size?: number; over?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <span className={`energy-ring ${over ? 'is-over' : ''}`}>
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id={`kcal-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#355eda" />
            <stop offset="60%" stopColor="#6f7cf0" />
            <stop offset="100%" stopColor="#9c90fe" />
          </linearGradient>
        </defs>
      </svg>
      <Ring value={value} size={size} stroke={Math.round(size / 11)} color={over ? 'var(--band-red)' : `url(#kcal-${id})`}>
        <span className="energy-ring__flame">
          <Glyph name="flame" size={Math.round(size * 0.24)} />
        </span>
      </Ring>
    </span>
  )
}

/** Health score 0 to 100 as a ring in its colour band, number inside. */
export function HealthRing({ score, size = 46 }: { score: number; size?: number }) {
  const t = useTranslation()
  const tone = scoreTone(score)
  return (
    <span className={`health-ring health-ring--${tone}`} role="img" aria-label={t('healthScore1OutOf100', score)}>
      <Ring value={score / 100} size={size} stroke={Math.max(3, Math.round(size / 13))} color={`var(--band-${tone})`}>
        <span className="health-ring__num" style={{ fontSize: Math.round(size * 0.32) }}>
          <CountUp value={score} />
        </span>
      </Ring>
    </span>
  )
}
