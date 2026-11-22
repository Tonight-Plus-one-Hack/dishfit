// Suspense-friendly loader: one cached promise per key, read with React's use().
// Promises carry React's thenable status fields once settled, so cached reads never suspend again.
// refresh() reloads matching keys first and swaps them in only when ready, so mutations never flash a fallback.
import { use, useSyncExternalStore } from 'react'

type Tracked<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown }

interface Entry {
  promise: Tracked<unknown>
  load: () => Promise<unknown>
}

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0

function track<T>(promise: Promise<T>): Tracked<T> {
  const tracked = promise as Tracked<T>
  tracked.status = 'pending'
  promise.then(
    (value) => {
      tracked.status = 'fulfilled'
      tracked.value = value
    },
    (reason) => {
      tracked.status = 'rejected'
      tracked.reason = reason
    },
  )
  return tracked
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useResource<T>(key: string, load: () => Promise<T>): T {
  useSyncExternalStore(subscribe, () => version)
  let entry = entries.get(key)
  if (!entry) {
    entry = { promise: track(load()), load }
    entries.set(key, entry)
  }
  return use(entry.promise as Promise<T>)
}

/** Reload every cached key that matches, then re-render readers with the settled results. */
export async function refresh(match: (key: string) => boolean = () => true): Promise<void> {
  const targets = [...entries].filter(([key]) => match(key))
  const fresh = await Promise.all(
    targets.map(async ([key, entry]) => {
      const promise = track(entry.load())
      await promise.catch(() => undefined)
      return [key, { promise, load: entry.load }] as const
    }),
  )
  fresh.forEach(([key, entry]) => entries.set(key, entry))
  version++
  listeners.forEach((l) => l())
}
