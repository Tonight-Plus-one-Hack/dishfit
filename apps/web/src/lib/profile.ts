// The user's goal setup from onboarding. Device-local until accounts exist.
import type { Kiez } from '../data/contract'
import { persisted, useStore } from './store'

export type Goal = 'lose' | 'maintain' | 'gain'

export interface Profile {
  goal: Goal
  /** Daily energy target in kcal. */
  kcalTarget: number
  /** Daily protein target in grams. */
  proteinTarget: number
  /** Usual spend per meal in EUR. */
  mealBudget: number
  diet: Array<'vegan' | 'vegetarian'>
  /** Home neighbourhood, used when no location is shared. */
  kiez: Kiez | null
  /** ISO date-time onboarding finished. */
  onboardedAt: string
}

export const DEFAULT_TARGETS: Record<Goal, Pick<Profile, 'kcalTarget' | 'proteinTarget'>> = {
  lose: { kcalTarget: 1800, proteinTarget: 130 },
  maintain: { kcalTarget: 2200, proteinTarget: 110 },
  gain: { kcalTarget: 2700, proteinTarget: 160 },
}

export const profileStore = persisted<Profile | null>('dishfit.profile.v1', null)

export function useProfile(): Profile | null {
  return useStore(profileStore)
}

export function saveProfile(profile: Profile) {
  profileStore.set(profile)
}

export function clearProfile() {
  profileStore.set(null)
}
