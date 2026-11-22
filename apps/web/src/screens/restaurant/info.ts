// Small helpers for the restaurant and dish screens: route links, source labels, German opening hours.
import { localizedFormatter, translate } from '../../i18n'
import type { Dish, MenuSource, Restaurant } from '../../data/contract'

/** Walking directions in the phone's maps app: Apple Maps on iPhone and iPad, Google Maps elsewhere. */
export function routeUrl(r: Pick<Restaurant, 'lat' | 'lng' | 'placeId'>): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const apple = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const to = `${r.lat},${r.lng}`
  if (apple) return `https://maps.apple.com/?daddr=${to}&dirflg=w`
  const place = r.placeId ? `&destination_place_id=${encodeURIComponent(r.placeId)}` : ''
  return `https://www.google.com/maps/dir/?api=1&destination=${to}${place}&travelmode=walking`
}

/** "deananddavid.com" from a URL, or the URL itself when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const dateFormat = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }))

/** "21.11.2026" for an ISO date-time. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateFormat().format(date)
}

/** Where the menu came from, for the source line: "Website" or "Foto der Karte". */
export function sourceKind(source: MenuSource): string {
  return source.kind === 'user_snap' ? translate('menuPhoto') : translate('website')
}

const DAY_LABELS: Record<string, string> = { get Mo() { return translate('mondayShort') }, get Tu() { return translate('tue') }, get We() { return translate('wed') }, get Th() { return translate('thu') }, get Fr() { return translate('fridayShort') }, get Sa() { return translate('saturdayShort') }, get Su() { return translate('sun') }, get PH() { return translate('publicHolidays') } }

/** One OSM rule as German day and time columns: "Mo-Fr 11:00-21:30" becomes ["Mo–Fr", "11:00–21:30"]. */
export function formatOpeningHours(line: string): { days: string; times: string } {
  const match = line.trim().match(/^([A-Za-z]{2}(?:[\s,-]+[A-Za-z]{2})*)\s+(.+)$/)
  if (!match) return { days: '', times: line }
  const days = match[1].replace(/[A-Za-z]{2}/g, (d) => DAY_LABELS[d] ?? d).replace(/\s*-\s*/g, '–').replace(/\s*,\s*/g, ', ')
  const times = /^(off|closed)$/i.test(match[2].trim())
    ? translate('closedLower')
    : match[2].replace(/\s*-\s*/g, '–').replace(/\s*,\s*/g, ', ')
  return { days, times }
}

export type MenuSort = 'proteinPerEuro' | 'protein' | 'kcal' | 'price'

export const MENU_SORTS: Array<{ key: MenuSort; label: string; hint: string }> = [
  { key: 'proteinPerEuro', get label() { return translate('resultCardProtein') }, get hint() { return translate('mostProteinPerEuroFirst') } },
  { key: 'protein', get label() { return translate('protein') }, get hint() { return translate('mostProteinFirst') } },
  { key: 'kcal', get label() { return translate('calories') }, get hint() { return translate('lowestCaloriesFirst') } },
  { key: 'price', get label() { return translate('price') }, get hint() { return translate('lowestPriceFirst') } },
]

/** Protein ranks on the lower end of the range, like the rest of the app, so optimistic estimates do not win. */
export const MENU_COMPARE: Record<MenuSort, (a: Dish, b: Dish) => number> = {
  proteinPerEuro: (a, b) => (b.proteinPerEuro ?? -1) - (a.proteinPerEuro ?? -1),
  protein: (a, b) => b.nutrition.protein.min - a.nutrition.protein.min,
  kcal: (a, b) => a.nutrition.kcal.value - b.nutrition.kcal.value,
  price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
}

export function isMenuSort(value: string | null): value is MenuSort {
  return MENU_SORTS.some((s) => s.key === value)
}

/** Menu sections in printed order, each sorted; ties keep the menu order. */
export function groupMenu(dishes: Dish[], sort: MenuSort): Array<{ section: string; dishes: Dish[] }> {
  const sections = new Map<string, Dish[]>()
  for (const dish of dishes) {
    const list = sections.get(dish.category) ?? []
    list.push(dish)
    sections.set(dish.category, list)
  }
  return [...sections].map(([section, list]) => ({ section, dishes: [...list].sort(MENU_COMPARE[sort]) }))
}

/** Stable DOM id for a menu section anchor. */
export function sectionId(section: string): string {
  return `karte-${section.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}
