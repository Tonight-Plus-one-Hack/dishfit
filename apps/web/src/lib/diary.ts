// The eaten-food log behind the Today tab. Entries keep a snapshot of the values, so the overview renders
// without refetching and stays stable when estimates change later.
// Device-local (no login). Every entry has a stable id and updatedAt, so an optional account can later
// sync by merging on id (newest updatedAt wins) without changing this shape.
import type { Dish, Restaurant } from '../data/contract'
import type { ScanPhoto } from '../data/scans'
import { persisted, useStore } from './store'

/** Where an entry came from: a dish in the app, a plate photo, or a dish read from my own menu photo. */
export type EntrySource = 'app' | 'plate' | 'menu'

/** The AI estimate's kcal range, shown next to the value ("520-680 kcal"). */
export interface KcalRange {
  low: number
  high: number
}

type DiaryPhoto = ScanPhoto & { scanId: string }

export interface DiaryEntry {
  id: string
  /** The app's dish id; null for camera entries. */
  dishId: string | null
  restaurantId: string | null
  name: string
  restaurantName: string
  price: number | null
  kcal: number
  protein: number
  carbs: number
  fat: number
  isEstimate: boolean
  /** ISO date-time. */
  at: string
  /** Berlin calendar day, YYYY-MM-DD. */
  day: string
  /** Missing on entries written before camera scans: those are 'app'. */
  source?: EntrySource
  range?: KcalRange
  /** Plate scans: the private photo and its expiry. */
  photo?: DiaryPhoto
  /** ISO date-time of the last change, for a later account sync. */
  updatedAt?: string
}

export function berlinDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(date)
}

export const diaryStore = persisted<DiaryEntry[]>('dishfit.diary.v1', [])

const add = (entry: DiaryEntry): DiaryEntry => {
  diaryStore.set((prev) => [...prev, entry])
  return entry
}

export function logDish(dish: Dish, restaurant: Restaurant, at: Date = new Date()): DiaryEntry {
  return add({
    id: `${dish.id}@${at.getTime()}`,
    dishId: dish.id,
    restaurantId: restaurant.id,
    name: dish.name,
    restaurantName: restaurant.name,
    price: dish.price,
    kcal: dish.nutrition.kcal.value,
    protein: dish.nutrition.protein.value,
    carbs: dish.nutrition.carbs.value,
    fat: dish.nutrition.fat.value,
    isEstimate: dish.nutrition.source === 'ai',
    source: 'app',
    at: at.toISOString(),
    day: berlinDay(at),
    updatedAt: at.toISOString(),
  })
}

export interface Estimate {
  name: string
  /** Where it was eaten or which menu it came from. */
  place: string
  price: number | null
  kcal: number
  protein: number
  carbs: number
  fat: number
  range: KcalRange
  photo?: DiaryPhoto
}

/** Logs an AI estimate from a camera scan (always marked as estimate). */
export function logEstimate(source: 'plate' | 'menu', estimate: Estimate, at: Date = new Date()): DiaryEntry {
  return add({
    id: `${source}:${crypto.randomUUID()}`,
    dishId: null,
    restaurantId: null,
    name: estimate.name,
    restaurantName: estimate.place,
    price: estimate.price,
    kcal: estimate.kcal,
    protein: estimate.protein,
    carbs: estimate.carbs,
    fat: estimate.fat,
    isEstimate: true,
    source,
    range: estimate.range,
    ...(estimate.photo ? { photo: estimate.photo } : {}),
    at: at.toISOString(),
    day: berlinDay(at),
    updatedAt: at.toISOString(),
  })
}

/** Logs an earlier entry again, now (the "Zuletzt gegessen" one-tap). */
export function relog(entry: DiaryEntry, at: Date = new Date()): DiaryEntry {
  return add({
    ...entry,
    id: `${entry.dishId ?? entry.source ?? 'entry'}@${at.getTime()}`,
    at: at.toISOString(),
    day: berlinDay(at),
    updatedAt: at.toISOString(),
  })
}

export function removeEntry(id: string) {
  diaryStore.set((prev) => prev.filter((e) => e.id !== id))
}

/** Drops a deleted photo from every entry that shows it. */
export function forgetEntryPhoto(url: string) {
  diaryStore.set((prev) => (prev.some((e) => e.photo?.url === url) ? prev.map((e) => (e.photo?.url === url ? { ...e, photo: undefined } : e)) : prev))
}

export function useDiary(day: string = berlinDay()): DiaryEntry[] {
  return useStore(diaryStore).filter((e) => e.day === day)
}

const DAY_MS = 86_400_000
const shift = (day: string, days: number) => berlinDay(new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS))

/**
 * Days in a row with at least one entry, ending today. A day without entries yet does not break the
 * streak until it is over: before the first log today, the streak still counts up to yesterday.
 */
export function streakOf(entries: DiaryEntry[], today: string): number {
  const days = new Set(entries.map((e) => e.day))
  let day = days.has(today) ? today : shift(today, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = shift(day, -1)
  }
  return n
}

/** The most recent distinct foods (by dish id, else by name and place), newest first. */
export function recentEntries(entries: DiaryEntry[], limit = 8): DiaryEntry[] {
  const seen = new Set<string>()
  const out: DiaryEntry[] = []
  for (const e of [...entries].sort((a, b) => b.at.localeCompare(a.at))) {
    const key = e.dishId ?? `${e.name}|${e.restaurantName}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
    if (out.length === limit) break
  }
  return out
}

export interface DayTotal {
  day: string
  kcal: number
  protein: number
  logged: boolean
}

/** Monday to Sunday of the Berlin week containing today, with kcal and protein per day. */
export function weekTotals(entries: DiaryEntry[], today: string): DayTotal[] {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7
  const monday = shift(today, -weekday)
  return Array.from({ length: 7 }, (_, i) => {
    const day = shift(monday, i)
    const items = entries.filter((e) => e.day === day)
    return {
      day,
      kcal: items.reduce((s, e) => s + e.kcal, 0),
      protein: items.reduce((s, e) => s + e.protein, 0),
      logged: items.length > 0,
    }
  })
}
