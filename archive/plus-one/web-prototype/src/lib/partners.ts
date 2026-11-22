// Travel hand-offs. Every outbound partner link goes through the Worker's GET /go/:brand,
// which counts the click and redirects, so the links below never point at partner sites directly.
import type { Brand } from '../data/types'

export interface Partner {
  brand: Brand
  name: string
  line: string
}

/** Order of the "New here? Plan your stay" list. */
export const PARTNERS: Partner[] = [
  { brand: 'hotels', name: 'Hotels.com', line: 'Hotels for tonight or the week' },
  { brand: 'vrbo', name: 'Vrbo', line: 'Apartments for a longer stay' },
  { brand: 'expedia', name: 'Expedia', line: 'Flights and hotels together' },
  { brand: 'layla', name: 'Layla', line: 'Plan the whole trip in one chat' },
]

/** Where the click came from, matching the contract's `from` pattern ([a-z0-9_]). */
export type Placement = 'landing' | 'city_page' | 'hangout_page' | 'joined'

export function goUrl(brand: Brand, { city, hangout, from }: { city?: string; hangout?: string; from: Placement }): string {
  const query = new URLSearchParams()
  if (city) query.set('city', city)
  if (hangout) query.set('hangout', hangout)
  query.set('from', from)
  return `/go/${brand}?${query}`
}
