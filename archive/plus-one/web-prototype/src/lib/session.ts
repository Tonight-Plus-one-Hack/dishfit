// Device-local preferences: saved spots and the last nickname used to join.
// Joins themselves go through src/data/api.ts like they will against the Worker.
import { useSyncExternalStore } from 'react'

interface SessionState {
  saved: string[]
  nickname: string
}

const KEY = 'plusone.session.v2'
const EMPTY: SessionState = { saved: [], nickname: '' }

function read(): SessionState {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SessionState>
    return { saved: parsed.saved ?? [], nickname: parsed.nickname ?? '' }
  } catch {
    return EMPTY
  }
}

let state: SessionState = typeof window === 'undefined' ? EMPTY : read()
const listeners = new Set<() => void>()

function write(next: SessionState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode or full storage: keep the in-memory state for this visit.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      state = read()
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}

export function toggleSaved(spotId: string) {
  const saved = state.saved.includes(spotId) ? state.saved.filter((s) => s !== spotId) : [...state.saved, spotId]
  write({ ...state, saved })
}

export function rememberNickname(nickname: string) {
  write({ ...state, nickname })
}

export function lastNickname(): string {
  return state.nickname
}
