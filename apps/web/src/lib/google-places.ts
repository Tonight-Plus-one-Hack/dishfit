// Live Google Places content through the Places UI Kit web components, shared by the restaurant screen
// (<gmp-place-details>) and the map card cover (<gmp-place-details-compact>), so the Maps JavaScript API loads once.
// The elements fetch and render Google's photos, rating and hours themselves, keyed by placeId, with Google's
// attribution; nothing from them is stored (EEA Places terms, see README "Google Places key").
import { currentLanguage } from '../i18n'
import type { Restaurant } from '../data/contract'

const env = import.meta.env as Record<string, string | undefined>

/** Browser key for the Maps JavaScript API with the Places UI Kit; either variable name works. */
export const GOOGLE_MAPS_KEY = (env.VITE_GOOGLE_MAPS_API_KEY ?? env.VITE_GOOGLE_MAPS_BROWSER_KEY)?.trim() || null

const CALLBACK = '__dishfitPlacesReady'

type MapsWindow = Window & {
  google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } }
  [CALLBACK]?: () => void
}

let loading: Promise<unknown> | null = null

/** Loads the Maps JavaScript API once and resolves when the places library (with the UI Kit elements) is ready. */
export function loadPlacesKit(): Promise<unknown> {
  if (!PLACES_ENABLED || !GOOGLE_MAPS_KEY) return Promise.reject(new Error('No Google Maps key in this build'))
  if (loading) return loading
  const key = GOOGLE_MAPS_KEY
  const w = window as MapsWindow
  loading = new Promise<void>((resolve, reject) => {
    w[CALLBACK] = () => resolve()
    const script = document.createElement('script')
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', language: currentLanguage(), region: 'DE', callback: CALLBACK })
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => reject(new Error('Maps JavaScript API did not load'))
    document.head.append(script)
  })
    .then(() => w.google?.maps?.importLibrary?.('places'))
    .catch((error: unknown) => {
      loading = null
      throw error
    })
  return loading
}

/** Places content is off unless the build sets VITE_PLACES_ENABLED=1; the Maps JavaScript API itself stays available. */
export const PLACES_ENABLED = env.VITE_PLACES_ENABLED?.trim() === '1'

/** Live Google content needs the switch, a key in the build, a matched placeId and a real place (never test data). */
export function hasLivePlace(restaurant: Pick<Restaurant, 'placeId' | 'isTestData'>): boolean {
  return Boolean(PLACES_ENABLED && GOOGLE_MAPS_KEY && restaurant.placeId && !restaurant.isTestData)
}

function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  return node
}

/**
 * Vertical place card for a cover: Google's large photo (tap for the lightbox), rating and attribution.
 * Content elements go straight into the element; gmp-place-content-config is deprecated.
 */
export function placeDetailsCompact(placeId: string): HTMLElement {
  const details = el('gmp-place-details-compact', { orientation: 'vertical', 'truncation-preferred': '' })
  details.append(
    el('gmp-place-details-place-request', { place: placeId }),
    el('gmp-place-media', { 'lightbox-preferred': '', 'preferred-size': 'large' }),
    el('gmp-place-rating'),
    el('gmp-place-attribution', { 'light-scheme-color': 'gray', 'dark-scheme-color': 'white' }),
  )
  return details
}
