// Dishes the user saved with the heart. Device-local until accounts exist.
// Only ids are stored: screens load the dish through src/data/api.ts, so values stay current.
import { persisted, useStore } from './store'

export interface SavedDish {
  dishId: string
  /** ISO date-time the dish was saved. */
  at: string
}

export const savedStore = persisted<SavedDish[]>('dishfit.saved.v1', [])

/** Saved dishes, newest first. */
export function useSaved(): SavedDish[] {
  return useStore(savedStore)
}

export function useIsSaved(dishId: string): boolean {
  return useStore(savedStore).some((s) => s.dishId === dishId)
}

/** Save or unsave a dish. Returns true when the dish is saved afterwards. */
export function toggleSaved(dishId: string, at: Date = new Date()): boolean {
  const wasSaved = savedStore.get().some((s) => s.dishId === dishId)
  savedStore.set((prev) =>
    wasSaved ? prev.filter((s) => s.dishId !== dishId) : [{ dishId, at: at.toISOString() }, ...prev],
  )
  return !wasSaved
}

export function unsave(dishId: string) {
  savedStore.set((prev) => prev.filter((s) => s.dishId !== dishId))
}

export function clearSaved() {
  savedStore.set([])
}
