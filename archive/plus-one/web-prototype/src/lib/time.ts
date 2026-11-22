import { now as clockNow } from './clock'

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function offsetAt(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** ISO instant for today's date (plus `dayOffset`) in `timeZone` at the local wall-clock time `hhmm`. */
export function tonightAt(timeZone: string, hhmm: string, now = clockNow(), dayOffset = 0): string {
  const [hour, minute] = hhmm.split(':').map(Number)
  const today = zonedParts(now, timeZone)
  const guess = Date.UTC(today.year, today.month - 1, today.day + dayOffset, hour, minute)
  const instant = guess - offsetAt(new Date(guess), timeZone)
  return new Date(instant).toISOString()
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  )
}

export function formatClock(timeZone: string, now = clockNow()): string {
  return formatTime(now.toISOString(), timeZone)
}

export function zoneAbbreviation(timeZone: string, now = clockNow()): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}

export function weekday(timeZone: string, now = clockNow()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(now)
}

export function localHour(iso: string, timeZone: string): number {
  return zonedParts(new Date(iso), timeZone).hour
}

export function dayOfMonth(iso: string, timeZone: string): number {
  return zonedParts(new Date(iso), timeZone).day
}

// A "night" runs from 06:00 to 06:00 local time, so 01:30 still belongs to the evening before
// and hangouts expire at the next 06:00.
const NIGHT_ENDS = 6

/** Days to add to the local date to reach the date the current night started on. */
function nightStart(timeZone: string, now: Date): number {
  return zonedParts(now, timeZone).hour < NIGHT_ENDS ? -1 : 0
}

/** The instant of wall-clock `hhmm` within the current night (times before 06:00 fall after midnight). */
export function nightAt(timeZone: string, hhmm: string, now = clockNow()): string {
  const hour = Number(hhmm.split(':')[0])
  return tonightAt(timeZone, hhmm, now, nightStart(timeZone, now) + (hour < NIGHT_ENDS ? 1 : 0))
}

/** When the current night ends: the next 06:00 local time. Hangouts expire then. */
export function nextMorning(timeZone: string, now = clockNow()): string {
  return tonightAt(timeZone, '06:00', now, nightStart(timeZone, now) + 1)
}

/** "today" through the afternoon, "tonight" from 16:00 until the night ends. */
export function nightWord(timeZone: string, now = clockNow()): 'today' | 'tonight' {
  const hour = zonedParts(now, timeZone).hour
  return hour >= NIGHT_ENDS && hour < 16 ? 'today' : 'tonight'
}

/** How a start time reads in copy: "today" for daytime plans, "tonight" for the evening and after. */
export function startWord(iso: string, timeZone: string): 'today' | 'tonight' {
  const hour = localHour(iso, timeZone)
  return hour >= NIGHT_ENDS && hour < 17 ? 'today' : 'tonight'
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Time-of-day sections for a city timeline. Every hour of the night lands in exactly one. */
export const DAY_PARTS = [
  { id: 'day', label: 'Daytime', test: (h: number) => h >= NIGHT_ENDS && h < 17 },
  { id: 'evening', label: 'Early evening', test: (h: number) => h >= 17 && h < 20 },
  { id: 'later', label: 'Later on', test: (h: number) => h >= 20 && h < 22 },
  { id: 'late', label: 'Late night', test: (h: number) => h >= 22 || h < NIGHT_ENDS },
] as const

const LEAD_MINUTES = 20
const LAST_START = '03:30'

/** Every half hour from shortly after now until the last sensible start of the night, as HH:MM. */
export function startSlots(timeZone: string, now = clockNow()): string[] {
  const earliest = now.getTime() + LEAD_MINUTES * 60_000
  const last = Date.parse(nightAt(timeZone, LAST_START, now))
  const slots: string[] = []
  for (let h = NIGHT_ENDS; h < NIGHT_ENDS + 24; h++) {
    for (const m of [0, 30]) {
      const hhmm = `${String(h % 24).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
      const at = Date.parse(nightAt(timeZone, hhmm, now))
      if (at >= earliest && at <= last) slots.push(hhmm)
    }
  }
  return slots
}

const ANCHORS = [
  { at: '12:00', label: 'Brunch' },
  { at: '15:00', label: 'Afternoon' },
  { at: '18:30', label: 'After work' },
  { at: '20:00', label: 'Evening' },
  { at: '21:30', label: 'Drinks' },
  { at: '23:00', label: 'Late' },
  { at: '00:30', label: 'After midnight' },
]

/** Suggested start times still ahead tonight; when the anchors have passed, the next free slots. */
export function anchorTimes(timeZone: string, now = clockNow(), count = 4): Array<{ at: string; label: string }> {
  const slots = startSlots(timeZone, now)
  const ahead = ANCHORS.filter((a) => slots.includes(a.at))
  if (ahead.length >= Math.min(2, slots.length)) return ahead.slice(0, count)
  return slots.slice(0, Math.min(count, 2)).map((at) => ({ at, label: 'Soon' }))
}
