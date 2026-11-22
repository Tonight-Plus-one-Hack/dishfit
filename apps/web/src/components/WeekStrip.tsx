// The week as day circles (Cal AI manner): green ring for a day within the kcal target, red when over,
// dashed when nothing was logged, faint for days still to come; today sits on a raised pill.
import { localizedFormatter, useTranslation } from '../i18n'
import { berlinDay, diaryStore } from '../lib/diary'
import { useStore } from '../lib/store'
import './week-strip.css'

const weekday = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', weekday: 'short' }))
const dayNum = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', day: 'numeric' }))
const longDay = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }))

type DayState = 'on' | 'over' | 'empty' | 'today' | 'future'

/** Monday to Sunday of the current Berlin week. */
function weekOf(now: Date): Date[] {
  const noon = new Date(now)
  noon.setHours(12, 0, 0, 0)
  const offset = (noon.getDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) => new Date(noon.getTime() + (i - offset) * 86_400_000))
}

export function WeekStrip({ now, kcalTarget }: { now: Date; kcalTarget: number }) {
  const t = useTranslation()
  const entries = useStore(diaryStore)
  const today = berlinDay(now)
  const totals = new Map<string, number>()
  for (const e of entries) totals.set(e.day, (totals.get(e.day) ?? 0) + e.kcal)

  return (
    <ol className="week" aria-label={t('thisWeek')}>
      {weekOf(now).map((date) => {
        const day = berlinDay(date)
        const kcal = totals.get(day)
        const state: DayState =
          kcal !== undefined ? (kcal <= kcalTarget * 1.1 ? 'on' : 'over') : day === today ? 'today' : day > today ? 'future' : 'empty'
        const spoken =
          kcal !== undefined ? t(state === 'on' ? 'count1KcalOnTarget' : 'count1KcalOverTarget', kcal) : state === 'future' ? t('notYet') : t('nothingLogged')
        return (
          <li key={day} className={`week__day week__day--${state} ${day === today ? 'is-today' : ''}`} aria-current={day === today ? 'date' : undefined}>
            <span className="week__name" aria-hidden="true">
              {weekday().format(date).replace('.', '')}
            </span>
            <span className="week__circle" aria-hidden="true">
              {dayNum().format(date).replace('.', '')}
            </span>
            <span className="sr-only">
              {longDay().format(date)}: {spoken}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
