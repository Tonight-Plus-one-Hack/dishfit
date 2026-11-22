// What this device contributed, for the thank-you moment: submission id -> restaurant key, kept in localStorage.
// Rejected photos drop out again, so "Du hast N Restaurants hinzugefügt" only counts photos that are still in.
const KEY = 'dishfit.snaps.v1'

type Ledger = Record<string, string>

function read(): Ledger {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Ledger) : {}
  } catch {
    return {}
  }
}

function write(ledger: Ledger) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ledger))
  } catch {
    // Private mode or blocked storage: the count just starts from this photo.
  }
}

export function recordContribution(submissionId: string, restaurantKey: string) {
  write({ ...read(), [submissionId]: restaurantKey })
}

export function dropContribution(submissionId: string) {
  const ledger = read()
  if (!(submissionId in ledger)) return
  delete ledger[submissionId]
  write(ledger)
}

/** Distinct restaurants this device added menus for; at least 1 for the photo on screen. */
export function contributedRestaurants(currentKey: string | null): number {
  const keys = new Set(Object.values(read()))
  if (currentKey) keys.add(currentKey)
  return Math.max(1, keys.size)
}

export const restaurantKey = (r: { id: string | null; name: string }) => r.id ?? `new:${r.name.trim().toLowerCase()}`
