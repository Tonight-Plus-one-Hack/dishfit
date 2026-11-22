// Three dishes that fit the user's goal today, from different restaurants where possible.
// Tries the strictest filters first and relaxes them until three dishes are found.
import { topDishes, type DishFilters, type DishResult, type Kiez, type LatLng } from '../../data/api'
import type { Goal, Profile } from '../../lib/profile'
import { goalSort } from '../../lib/ranking'

export interface PickInput {
  goal: Goal
  kcalTarget: number
  proteinTarget: number
  diet: Profile['diet']
  kiez: Kiez | null
  near: LatLng
}

export interface Picks {
  picks: DishResult[]
  /** How many dishes were looked at, for the count-up. */
  checked: number
}

/** Share of the day a main meal out may take. */
const MEAL_SHARE_KCAL = 0.4
const MEAL_SHARE_PROTEIN = 0.3
const NEAR_METRES = 5000
const COUNT = 3

export function pickInput(profile: Profile, near: LatLng): PickInput {
  return {
    goal: profile.goal,
    kcalTarget: profile.kcalTarget,
    proteinTarget: profile.proteinTarget,
    diet: profile.diet,
    kiez: profile.kiez,
    near: { lat: Math.round(near.lat * 1000) / 1000, lng: Math.round(near.lng * 1000) / 1000 },
  }
}

export function picksKey(input: PickInput): string {
  return `onboarding:picks:${JSON.stringify(input)}`
}

export async function pickDishes(input: PickInput): Promise<Picks> {
  const diet = input.diet.length ? input.diet : undefined
  const place: DishFilters = input.kiez ? { kiez: [input.kiez] } : { maxDistance: NEAR_METRES }
  const base: DishFilters = { near: input.near, diet, sort: goalSort(input.goal), fullMealsOnly: true }
  const kcalMax = Math.round((input.kcalTarget * MEAL_SHARE_KCAL) / 50) * 50
  const proteinMin = Math.round(input.proteinTarget * MEAL_SHARE_PROTEIN)

  const attempts: DishFilters[] = [
    { ...base, ...place, kcalMax, proteinMin, openNow: true },
    { ...base, ...place, kcalMax, proteinMin },
    { ...base, ...place, kcalMax },
    { ...base, kcalMax, proteinMin },
    { ...base, kcalMax },
    { ...base },
  ]
  const [all, ...rounds] = await Promise.all([topDishes({ fullMealsOnly: true }), ...attempts.map((f) => topDishes(f))])

  const picks: DishResult[] = []
  const take = (r: DishResult, varied: boolean) => {
    if (picks.length >= COUNT || picks.some((p) => p.dish.id === r.dish.id)) return
    if (varied && picks.some((p) => p.restaurant.id === r.restaurant.id)) return
    picks.push(r)
  }
  // One dish per restaurant first, then fill up from the same rounds if variety runs out.
  for (const varied of [true, false]) {
    for (const round of rounds) round.forEach((r) => take(r, varied))
  }
  return { picks, checked: all.length }
}
