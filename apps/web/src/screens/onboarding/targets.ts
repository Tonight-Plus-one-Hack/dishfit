// Goal options and target suggestions for onboarding and the goal edits on the Today screen.
import { localizedFormatter, translate } from '../../i18n'
import type { IconName } from '../../components/Icon'
import { DEFAULT_TARGETS, type Goal, type Profile } from '../../lib/profile'

export const GOALS: Array<{ goal: Goal; label: string; hint: string; icon: IconName }> = [
  { goal: 'lose', get label() { return translate('loseWeight') }, get hint() { return translate('fewerCaloriesWithProteinToHelp') }, icon: 'flame' },
  { goal: 'gain', get label() { return translate('buildMuscle') }, get hint() { return translate('plentyOfProteinAndEnoughEnergy') }, icon: 'bolt' },
  { goal: 'maintain', get label() { return translate('eatABalancedDiet') }, get hint() { return translate('aGoodMixWithoutGivingThings') }, icon: 'leaf' },
]

export const GOAL_LABEL: Record<Goal, string> = { get lose() { return translate('loseWeight') }, get gain() { return translate('buildMuscle') }, get maintain() { return translate('eatABalancedDiet') } }

/** "Ein Richtwert ..." phrase per goal. */
export const GOAL_PHRASE: Record<Goal, string> = { get lose() { return translate('forWeightLoss') }, get gain() { return translate('forBuildingMuscle') }, get maintain() { return translate('forBalancedEating') } }

export interface Suggestion {
  value: number
  hint: string
  recommended?: boolean
}

export const KCAL_SUGGESTIONS: Record<Goal, Suggestion[]> = {
  lose: [
    { value: 1600, get hint() { return translate('fasterTakesDiscipline') } },
    { value: DEFAULT_TARGETS.lose.kcalTarget, get hint() { return translate('steadyAndManageable') }, recommended: true },
    { value: 2000, get hint() { return translate('gradualAndRelaxed') } },
  ],
  maintain: [
    { value: 2000, get hint() { return translate('lowDailyActivity') } },
    { value: DEFAULT_TARGETS.maintain.kcalTarget, get hint() { return translate('suitsMostPeople') }, recommended: true },
    { value: 2400, get hint() { return translate('highDailyActivity') } },
  ],
  gain: [
    { value: 2500, get hint() { return translate('slowerGains') } },
    { value: DEFAULT_TARGETS.gain.kcalTarget, get hint() { return translate('aSteadyCalorieSurplus') }, recommended: true },
    { value: 2900, get hint() { return translate('forFrequentTraining') } },
  ],
}

export const PROTEIN_SUGGESTIONS: Record<Goal, Suggestion[]> = {
  lose: [
    { value: 110, get hint() { return translate('aGoodBaseline') } },
    { value: DEFAULT_TARGETS.lose.proteinTarget, get hint() { return translate('helpsYouFeelFullAndMaintain') }, recommended: true },
    { value: 150, get hint() { return translate('withFrequentTraining') } },
  ],
  maintain: [
    { value: 90, get hint() { return translate('aGoodBaseline') } },
    { value: DEFAULT_TARGETS.maintain.proteinTarget, get hint() { return translate('suitsMostPeople') }, recommended: true },
    { value: 130, get hint() { return translate('withRegularExercise') } },
  ],
  gain: [
    { value: 140, get hint() { return translate('aGoodBaseline') } },
    { value: DEFAULT_TARGETS.gain.proteinTarget, get hint() { return translate('supportsMuscleGrowth') }, recommended: true },
    { value: 180, get hint() { return translate('forIntenseTraining') } },
  ],
}

export const KCAL_LIMITS = { min: 1200, max: 4500, step: 50 }
export const PROTEIN_LIMITS = { min: 40, max: 250, step: 5 }

export type DietChoice = 'all' | 'vegetarian' | 'vegan'

export const DIETS: Array<{ diet: DietChoice; label: string; hint: string; icon: IconName }> = [
  { diet: 'all', get label() { return translate('iEatEverything') }, get hint() { return translate('meatFishAndPlantBasedFoods') }, icon: 'check' },
  { diet: 'vegetarian', get label() { return translate('vegetarian') }, get hint() { return translate('noMeatOrFish') }, icon: 'leaf' },
  { diet: 'vegan', get label() { return translate('vegan') }, get hint() { return translate('plantBasedOnly') }, icon: 'leaf' },
]

export const DIET_LABEL: Record<DietChoice, string> = { get all() { return translate('filterSheetAll') }, get vegetarian() { return translate('vegetarian') }, get vegan() { return translate('vegan') } }

export function dietOf(choice: DietChoice): Profile['diet'] {
  return choice === 'all' ? [] : [choice]
}

export function dietChoice(diet: Profile['diet']): DietChoice {
  if (diet.includes('vegan')) return 'vegan'
  if (diet.includes('vegetarian')) return 'vegetarian'
  return 'all'
}

/** Usual spend per meal when the profile has none yet. */
export const DEFAULT_MEAL_BUDGET = 12
/** Meals out per day that the daily euro budget assumes. */
export const MEALS_PER_DAY = 2

export function dayBudget(profile: Pick<Profile, 'mealBudget'>): number {
  return profile.mealBudget * MEALS_PER_DAY
}

export function inLimits(value: number | null, limits: { min: number; max: number }): value is number {
  return value !== null && Number.isFinite(value) && value >= limits.min && value <= limits.max
}

const thousands = localizedFormatter((lang) => new Intl.NumberFormat(lang))

export function formatInt(value: number): string {
  return thousands().format(value)
}
