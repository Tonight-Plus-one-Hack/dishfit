// Building blocks for one-question-per-screen flows (onboarding, goal edits), in the Cal AI pattern:
// a thin progress rail, one serif question, large options, a wide action pinned to the bottom.
import { useTranslation } from '../i18n'
import type { ReactNode } from 'react'
import { Art, type ArtName } from './glyphs/Art'
import { Icon, type IconName } from './Icon'
import './flow.css'

export function FlowBar({
  progress,
  onBack,
  onClose,
  label,
}: {
  /** 0 to 1. */
  progress: number
  /** Hidden when undefined (first step, finished or working states). */
  onBack?: () => void
  /** Hidden when undefined. */
  onClose?: () => void
  label: string
}) {
  const t = useTranslation()
  return (
    <header className="flow__bar">
      {onBack ? (
        <button className="flow__back" onClick={onBack} aria-label={t('back')}>
          <Icon name="arrowLeft" size={20} />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <div
        className="flow__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={label}
      >
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
      {onClose ? (
        <button className="flow__close" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={20} />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </header>
  )
}

export function Question({ title, hint, children, art }: { title: string; hint?: string; children?: ReactNode; art?: ArtName }) {
  return (
    <section className="question" aria-labelledby="q-title">
      {art && <Art name={art} size={152} className="question__art" />}
      <h1 className="t-section question__title" id="q-title">
        {title}
      </h1>
      {hint && <p className="t-muted question__hint">{hint}</p>}
      {children}
    </section>
  )
}

export function FlowFooter({ children }: { children: ReactNode }) {
  return <div className="flow__footer">{children}</div>
}

/** A large single-choice option. Use inside <div className="options" role="radiogroup">. */
export function Option({
  label,
  hint,
  icon,
  checked,
  onSelect,
  art,
}: {
  label: string
  hint?: string
  icon?: IconName
  checked: boolean
  onSelect: () => void
  /** Illustration from the icon set; replaces the icon. */
  art?: ArtName
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="option" onClick={onSelect}>
      {art && (
        <span className="option__art">
          <Art name={art} size={52} />
        </span>
      )}
      {icon && !art && (
        <span className="option__icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="option__text">
        <span className="option__label">{label}</span>
        {hint && <span className="option__hint">{hint}</span>}
      </span>
    </button>
  )
}

/** The short checklist shown while something is computed or saved. */
export function Working({ title, steps }: { title: string; steps: string[] }) {
  return (
    <section className="joining" aria-live="polite">
      <h1 className="t-section">{title}</h1>
      <ul className="joining__steps">
        {steps.map((s, i) => (
          <li key={s} style={{ animationDelay: `${i * 380}ms` }}>
            <span className="joining__tick" style={{ animationDelay: `${i * 380 + 260}ms` }}>
              <Icon name="check" size={12} strokeWidth={2.2} />
            </span>
            {s}
          </li>
        ))}
      </ul>
    </section>
  )
}
