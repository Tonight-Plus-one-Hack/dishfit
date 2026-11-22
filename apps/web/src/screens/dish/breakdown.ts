// Derived views of one dish for the detail screen: assumed portion, score band, share of the day, spread.
import { translate } from '../../i18n'
import type { Ingredient, NutritionEstimate, Range } from '../../data/contract'
import { persisted, useStore } from '../../lib/store'

/**
 * The assumed portion, ingredient by ingredient. Uses nutrition.ingredients when the pipeline sends it;
 * until then reads the amounts out of the "Portion: ..." sentence the spike estimates carry in their method note.
 */
export function portionOf(n: NutritionEstimate): { items: Ingredient[]; note: string } {
  if (n.ingredients?.length) return { items: n.ingredients, note: n.method }
  const match = n.method.match(/^Portion:\s*(.+?)\.(?:\s+(.*))?$/s)
  if (!match) return { items: [], note: n.method }
  const items: Ingredient[] = []
  for (const part of match[1].split(/,|;|\band\b|\bplus\b|\bwith\b/i)) {
    const after = part.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b\s*(?:of\s+)?(.+)/i)
    const before = part.match(/^\s*(.+?)\s+(?:about\s+|around\s+|approx\.?\s+)?(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i)
    if (after && after[3].trim()) {
      items.push({ name: clean(after[3]), amount: Number(after[1].replace(',', '.')), unit: after[2].toLowerCase() as Ingredient['unit'] })
    } else if (before) {
      items.push({ name: clean(before[1]), amount: Number(before[2].replace(',', '.')), unit: before[3].toLowerCase() as Ingredient['unit'] })
    }
  }
  return { items, note: [match[1].trim(), match[2]?.trim()].filter(Boolean).join('. ') }
}

function clean(name: string): string {
  const text = name.replace(/^(?:about|around|approx\.?|roughly)\s+/i, '').replace(/\s+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Menu description split into its listed components, for dishes without an assumed portion. */
export function componentsOf(description: string): string[] {
  return description
    .split(/,|\bund\b|\bmit\b|\band\b|\bwith\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
}

export type ScoreTone = 'top' | 'good' | 'ok' | 'low'

export function scoreBand(score: number): { label: string; tone: ScoreTone } {
  if (score >= 80) return { label: translate('veryBalanced'), tone: 'top' }
  if (score >= 60) return { label: translate('balanced'), tone: 'good' }
  if (score >= 40) return { label: translate('fair'), tone: 'ok' }
  return { label: translate('onTheHeavySide'), tone: 'low' }
}

/** Half-width of a range as a share of its value, in whole percent: ±25 %. */
export function spreadPercent(r: Range): number {
  return r.value ? Math.round(((r.max - r.value) / r.value) * 100) : 0
}

/** Energy shares of protein, carbs and fat in percent (4, 4 and 9 kcal per gram). */
export function energySplit(n: NutritionEstimate): { protein: number; carbs: number; fat: number } {
  const p = n.protein.value * 4
  const c = n.carbs.value * 4
  const f = n.fat.value * 9
  const total = Math.max(p + c + f, 1)
  return { protein: Math.round((p / total) * 100), carbs: Math.round((c / total) * 100), fat: Math.round((f / total) * 100) }
}

// ---------- "Wert melden": kept on this device until reports have a backend ----------

export type ReportField = 'nutrition' | 'price' | 'name' | 'gone' | 'other'

export const REPORT_FIELDS: Array<{ key: ReportField; label: string }> = [
  { key: 'nutrition', get label() { return translate('caloriesOrMacros') } },
  { key: 'price', get label() { return translate('price') } },
  { key: 'name', get label() { return translate('nameOrDescription') } },
  { key: 'gone', get label() { return translate('noLongerAvailable') } },
  { key: 'other', get label() { return translate('somethingElse') } },
]

export interface DishReport {
  id: string
  dishId: string
  field: ReportField
  note: string
  /** ISO date-time. */
  at: string
}

const reportStore = persisted<DishReport[]>('dishfit.reports.v1', [])

export function saveReport(report: Omit<DishReport, 'id' | 'at'>, at: Date = new Date()) {
  reportStore.set((prev) => [...prev, { ...report, id: `${report.dishId}@${at.getTime()}`, at: at.toISOString() }])
}

export function useReported(dishId: string): boolean {
  return useStore(reportStore).some((r) => r.dishId === dishId)
}
