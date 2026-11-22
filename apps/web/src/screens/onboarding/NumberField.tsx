// Own-value input for a daily target: a large serif number with minus and plus steppers.
import { useTranslation } from '../../i18n'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { formatInt } from './targets'

export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  label,
}: {
  value: number | null
  onChange: (value: number | null) => void
  min: number
  max: number
  step: number
  unit: string
  label: string
}) {
  const t = useTranslation()
  const [text, setText] = useState(value === null ? '' : String(value))
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  const set = (n: number) => {
    const next = clamp(n)
    setText(String(next))
    onChange(next)
  }
  const invalid = text !== '' && (value === null || value < min || value > max)

  return (
    <div className="numfield">
      <div className="numfield__row">
        <button
          type="button"
          className="numfield__step"
          aria-label={t('decrease1By2', step, unit)}
          disabled={value !== null && value <= min}
          onClick={() => set((value ?? min) - step)}
        >
          <Icon name="minus" size={20} />
        </button>
        <label className="numfield__value">
          <span className="sr-only">{label}</span>
          <input
            className="numfield__input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={text}
            aria-invalid={invalid}
            aria-describedby="numfield-hint"
            placeholder={String(min)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
              setText(digits)
              onChange(digits === '' ? null : Number(digits))
            }}
            onBlur={() => {
              if (value !== null) set(value)
            }}
          />
          <span className="numfield__unit">{unit}</span>
        </label>
        <button
          type="button"
          className="numfield__step"
          aria-label={t('increase1By2', step, unit)}
          disabled={value !== null && value >= max}
          onClick={() => set((value ?? min) + step)}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
      <p id="numfield-hint" className={`numfield__hint ${invalid ? 'is-invalid' : ''}`}>{t('between')}{' '}{formatInt(min)}{' '}{t('and')}{' '}{formatInt(max)} {unit}
      </p>
    </div>
  )
}
