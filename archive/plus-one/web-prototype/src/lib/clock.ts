// The one place the app reads the current time.
// In development, ?now=<ISO timestamp> shifts the clock for this tab (an empty ?now= resets it),
// so daytime, evening and after-midnight states can be checked without waiting for them.
const KEY = 'plusone.now'

function pinnedAt(): number | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  try {
    const param = new URLSearchParams(window.location.search).get('now')
    if (param === '') sessionStorage.removeItem(KEY)
    else if (param) sessionStorage.setItem(KEY, param)
    const value = Date.parse(sessionStorage.getItem(KEY) ?? '')
    return Number.isNaN(value) ? null : value
  } catch {
    return null
  }
}

const pinned = pinnedAt()
const offset = pinned === null ? 0 : pinned - Date.now()

export function now(): Date {
  return new Date(Date.now() + offset)
}
