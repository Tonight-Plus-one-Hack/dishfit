// German number formatting for prices, distances and nutrition values.
import { localizedFormatter, translate } from '../i18n'
import type { Range } from '../data/contract'
import { stripMenuNumber } from '../data/dishClass'

const euro = localizedFormatter((lang) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR' }))
const wholeEuro = localizedFormatter((lang) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))
const one = localizedFormatter((lang) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }))

export function formatPrice(price: number | null, fractionDigits: 0 | 2 = 2): string {
  return price === null ? translate('priceAtRestaurant') : (fractionDigits === 0 ? wholeEuro() : euro()).format(price)
}

export function formatDistance(metres: number | null): string {
  if (metres === null) return ''
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`
  return `${one().format(metres / 1000)} km`
}

/** Walking minutes at 80 m per minute. */
export function walkMinutes(metres: number | null): string {
  if (metres === null) return ''
  return translate('walkMinutes', Math.max(1, Math.round(metres / 80)))
}

export function formatNumber(value: number): string {
  return one().format(value)
}

/** "540–720 kcal" style range; unit is appended with a thin space. */
export function formatRange(r: Range, unit: string): string {
  return r.min === r.max ? `${r.value} ${unit}` : `${r.min}–${r.max} ${unit}`
}

/** Approximate single value for compact places: "ca. 620 kcal". */
export function approx(r: Range, unit: string, estimate: boolean): string {
  return `${estimate ? translate('approximatePrefix') : ''}${r.value} ${unit}`
}

/**
 * Names as published, except menus and signs set in capitals: "PHO HA NOI" reads as "Pho Ha Noi".
 * Only names without any lowercase letter change, so "dean&david" or "BBQ Haus" keep their spelling.
 */
export function displayName(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, '')
  if (letters.length < 4 || letters !== letters.toUpperCase()) return name
  return name.toLowerCase().replace(/(^|[\s(/&+-])(\p{L})/gu, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

/** A dish name as shown: no menu number ("13. Sashimi Sass" -> "Sashimi Sass"), capitals in title case. */
export function dishName(name: string): string {
  return displayName(stripMenuNumber(name))
}
