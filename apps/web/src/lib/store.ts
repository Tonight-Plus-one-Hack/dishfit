// A tiny persisted store: localStorage when available, memory otherwise (private mode, blocked storage).
import { useSyncExternalStore } from 'react'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(listener: () => void): () => void
}

export function persisted<T>(key: string, fallback: T): Store<T> {
  return createStore(fallback, key)
}

export function inMemory<T>(initial: T): Store<T> {
  return createStore(initial)
}

function createStore<T>(fallback: T, key?: string): Store<T> {
  const listeners = new Set<() => void>()
  let value: T = fallback
  try {
    const raw = key === undefined ? null : window.localStorage.getItem(key)
    if (raw) value = JSON.parse(raw) as T
  } catch {
    // Unreadable or blocked storage: start from the fallback.
  }
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      try {
        if (key !== undefined) window.localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Storage full or blocked: keep the in-memory value for this session.
      }
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
