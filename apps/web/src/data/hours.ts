// Opening hours: parse OpenStreetMap opening_hours strings into the Google Places period shape,
// and answer "open now" for either source.
import type { OpeningHours, OpeningPeriod } from './contract'

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const ORDER = [1, 2, 3, 4, 5, 6, 0] // Mo..Su, the order OSM day ranges run in

function dayIndex(token: string): number {
  const i = DAYS.indexOf(token.trim().slice(0, 2) as (typeof DAYS)[number])
  if (i < 0) throw new Error(`Unknown day "${token}"`)
  return i
}

function expandDays(spec: string): number[] {
  const days: number[] = []
  for (const part of spec.split(',')) {
    const [from, to] = part.split('-').map((s) => s.trim())
    if (!to) {
      days.push(dayIndex(from))
      continue
    }
    const a = ORDER.indexOf(dayIndex(from))
    const b = ORDER.indexOf(dayIndex(to))
    for (let k = a; ; k = (k + 1) % 7) {
      days.push(ORDER[k])
      if (k === b) break
    }
  }
  return days
}

/** Supports the common subset: "Mo-Fr 11:00-21:30; Sa,Su 12:30-21:30", "Mo-We off", times past midnight. */
export function parseOsmHours(input: string): OpeningHours {
  const byDay = new Map<number, OpeningPeriod[]>()
  for (const rule of input.split(';').map((r) => r.trim()).filter(Boolean)) {
    const match = rule.match(/^([A-Za-z ,-]+?)\s+(off|closed|[\d:, -]+)$/)
    if (!match) continue
    let days: number[]
    try {
      days = expandDays(match[1].replace(/\s+/g, ''))
    } catch {
      continue // Public holidays and other tokens we do not model.
    }
    if (/^(off|closed)$/.test(match[2])) {
      days.forEach((d) => byDay.set(d, []))
      continue
    }
    const spans = match[2].split(',').map((s) => s.trim().split('-'))
    for (const d of days) {
      byDay.set(
        d,
        spans.map(([open, close]) => {
          const [oh, om] = open.split(':').map(Number)
          const [ch, cm] = close.split(':').map(Number)
          const overnight = ch * 60 + cm <= oh * 60 + om || ch >= 24
          return {
            open: { day: d, hour: oh, minute: om },
            close: { day: overnight ? (d + 1) % 7 : d, hour: ch % 24, minute: cm },
          }
        }),
      )
    }
  }
  const periods = [...byDay.entries()].sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b)).flatMap(([, p]) => p)
  return { periods, weekdayText: input.split(';').map((r) => r.trim()).filter(Boolean) }
}

const WEEK = 7 * 24 * 60
const minuteOfWeek = (day: number, hour: number, minute: number) => day * 24 * 60 + hour * 60 + minute

/** Berlin wall-clock time, independent of the device time zone. */
export function berlinNow(now: Date = new Date()): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  return { day: dayIndex(get('weekday')), hour: Number(get('hour')), minute: Number(get('minute')) }
}

export function isOpenAt(hours: OpeningHours | null, now: Date = new Date()): boolean | null {
  if (!hours) return null
  const t = berlinNow(now)
  const at = minuteOfWeek(t.day, t.hour, t.minute)
  return hours.periods.some(({ open, close }) => {
    if (!close) return true
    const start = minuteOfWeek(open.day, open.hour, open.minute)
    let end = minuteOfWeek(close.day, close.hour, close.minute)
    if (end <= start) end += WEEK
    return (at >= start && at < end) || (at + WEEK >= start && at + WEEK < end)
  })
}
