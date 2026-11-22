import type { LatLng } from '../data/contract'
import { BERLIN_RINGS } from './berlinBoundary'

/** Fallback origin when the user shares no location: Moritzplatz, between Mitte, Kreuzberg and Neukölln. */
export const BERLIN_CENTER: LatLng = { lat: 52.5035, lng: 13.4108 }

/** Whether the point lies inside Berlin's boundary (not just its bounding box). */
export function isInBerlin({ lat, lng }: LatLng): boolean {
  return BERLIN_RINGS.some((ring) => {
    let inside = false
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const [yi, xi, yj, xj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]]
      if (xi > lng !== xj > lng && lat < ((yj - yi) * (lng - xi)) / (xj - xi) + yi) inside = !inside
    }
    return inside
  })
}

export function distanceTier(metres: number | null): number {
  return metres === null ? Number.MAX_SAFE_INTEGER : Math.floor(metres / 1000)
}

/** Great-circle distance in metres. */
export function distance(a: LatLng, b: LatLng): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}
