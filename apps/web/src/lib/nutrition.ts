// Daily targets, macro names and health score bands shared by the rings, the dish screen and Today.
import { translate } from '../i18n'
import type { Profile } from './profile'

export type Macro = 'protein' | 'carbs' | 'fat'

export const MACRO_LABEL: Record<Macro, string> = { get protein() { return translate('protein') }, get carbs() { return translate('carbs') }, get fat() { return translate('fat') } }
export const MACRO_SHORT: Record<Macro, string> = { get protein() { return translate('protein') }, get carbs() { return translate('carbsShort') }, get fat() { return translate('fat') } }

export interface DayTargets {
  kcal: number
  protein: number
  carbs: number
  fat: number
  /** False when the targets are the general guide values because no goal is set. */
  personal: boolean
}

/** Daily targets from the goal; carbs and fat follow a 45 % / 30 % energy split of the kcal target. */
export function dayTargets(profile: Pick<Profile, 'kcalTarget' | 'proteinTarget'> | null): DayTargets {
  const kcal = profile?.kcalTarget ?? 2200
  return {
    kcal,
    protein: profile?.proteinTarget ?? 110,
    carbs: Math.round((kcal * 0.45) / 4),
    fat: Math.round((kcal * 0.3) / 9),
    personal: profile !== null,
  }
}

export type ScoreTone = 'green' | 'orange' | 'red'

/** Health score bands: 80 and up green, 60 to 79 orange, below 60 red. */
export function scoreTone(score: number): ScoreTone {
  return score >= 80 ? 'green' : score >= 60 ? 'orange' : 'red'
}
