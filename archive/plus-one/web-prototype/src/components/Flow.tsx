// Building blocks for the one-question-per-screen flows (join and create), in the Cal AI pattern:
// a thin progress rail, one serif question, wide actions pinned to the bottom.
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { NICKNAME_MAX } from '../data/types'
import { Link } from '../lib/router'
import { Icon } from './Icon'
import './flow.css'

export function FlowBar({
  progress,
  onBack,
  closeTo,
  label,
}: {
  /** 0 to 1. */
  progress: number
  /** Hidden when undefined (finished or working states). */
  onBack?: () => void
  closeTo: string
  label: string
}) {
  return (
    <header className="flow__bar">
      {onBack ? (
        <button className="flow__back" onClick={onBack} aria-label="Back">
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
      <Link to={closeTo} className="flow__close" aria-label="Close">
        <Icon name="close" size={20} />
      </Link>
    </header>
  )
}

export function Question({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <section className="question" aria-labelledby="q-title">
      <h1 className="t-section question__title" id="q-title">
        {title}
      </h1>
      <p className="t-muted question__hint">{hint}</p>
      {children}
    </section>
  )
}

export function FlowFooter({ children }: { children: ReactNode }) {
  return <div className="flow__footer">{children}</div>
}

export function NicknameStep({
  value,
  onChange,
  onNext,
  hint = 'A first name or nickname is enough. Never your full name.',
}: {
  value: string
  onChange: (v: string) => void
  onNext: () => void
  hint?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])
  const trimmed = value.trim()
  const valid = trimmed.length >= 2 && trimmed.length <= NICKNAME_MAX
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) onNext()
  }
  return (
    <Question title="What should the group call you?" hint={hint}>
      <form onSubmit={submit} className="nick">
        <label className="sr-only" htmlFor="nickname">
          Nickname
        </label>
        <input
          ref={input}
          id="nickname"
          className="nick__input"
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, NICKNAME_MAX))}
          placeholder="e.g. Sam"
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={NICKNAME_MAX}
        />
        <p className="t-label nick__count">
          {trimmed.length}/{NICKNAME_MAX}
        </p>
        <FlowFooter>
          <button className="btn btn--primary btn--wide" type="submit" disabled={!valid}>
            Continue
          </button>
        </FlowFooter>
      </form>
    </Question>
  )
}

export function AgeStep({ onAdult, onMinor }: { onAdult: () => void; onMinor: () => void }) {
  return (
    <Question title="Are you 18 or older?" hint="Hangouts meet at bars and clubs, so every member confirms they are an adult.">
      <div className="options">
        <button className="option option--plain" onClick={onAdult}>
          <span className="option__label">Yes, I’m 18 or older</span>
          <Icon name="arrowRight" size={18} />
        </button>
        <button className="option option--plain" onClick={onMinor}>
          <span className="option__label">No, I’m under 18</span>
          <Icon name="arrowRight" size={18} />
        </button>
      </div>
    </Question>
  )
}

export function UnderAgeStep({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  return (
    <Question
      title="Plus One is for adults only"
      hint="Hangouts happen at bars, pubs and clubs. Thanks for being honest, come back when you turn 18."
    >
      <FlowFooter>
        <Link to={backTo} className="btn btn--secondary btn--wide">
          {backLabel}
        </Link>
      </FlowFooter>
    </Question>
  )
}

/** The short checklist shown while a join or create request is saved. */
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
