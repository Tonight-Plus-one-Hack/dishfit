// URL builders and imperative navigation for the History API router.
import { parseAppRoute as parse, type AppRoute as Route } from '../../../../packages/contract/src/app-route'

export { parse, type Route }
export type Tab = 'home' | 'map' | 'search' | 'today'

export const paths = {
  /** The start page: the map. */
  start: () => '/',
  map: (focus?: string) => (focus ? `/?r=${encodeURIComponent(focus)}` : '/'),
  /** Discover (route name home): the ranked dishes of a Kiez as big cards. */
  discover: () => '/entdecken',
  /** Search and filters. The query string holds the filter state (see screens/filters). */
  search: (query = '') => (query ? `/search?${query}` : '/search'),
  today: () => '/today',
  onboarding: () => '/onboarding',
  restaurant: (id: string) => `/r/${encodeURIComponent(id)}`,
  dish: (id: string) => `/d/${encodeURIComponent(id)}`,
  /** Private camera scan: a plate (default) or a menu. */
  camera: (kind: 'plate' | 'menu' = 'plate') => `/kamera?art=${kind === 'menu' ? 'karte' : 'teller'}`,
  /** Community menu scan; r and n prefill the restaurant when opened from its page. */
  snap: (restaurant?: { id: string; name: string }) =>
    restaurant ? `/scan?${new URLSearchParams({ r: restaurant.id, n: restaurant.name })}` : '/scan',
  snapStatus: (id: string) => `/scan/${encodeURIComponent(id)}`,
  /** Community profile: contributions, badges, nickname. */
  me: () => '/me',
  /** Kiez leaderboard of scanners; k picks the Kiez, p the period (week | all). */
  leaderboard: (kiez?: string | null) => (kiez ? `/bestenliste?k=${encodeURIComponent(kiez)}` : '/bestenliste'),
  impressum: () => '/impressum',
  datenschutz: () => '/datenschutz',
  waitlist: () => '/waitlist',
}

/** The bottom tab a route belongs to; detail routes keep the tab they were opened from highlighted. */
export function tabOf(route: Route): Tab | null {
  switch (route.name) {
    case 'home':
    case 'map':
    case 'search':
    case 'today':
      return route.name
    case 'camera':
      return 'today'
    default:
      return null
  }
}

export const NAV_EVENT = 'app:navigate'

export interface Location {
  pathname: string
  search: string
  hash: string
}

export function current(): Location {
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.href)
  if (url.pathname + url.search + url.hash === window.location.pathname + window.location.search + window.location.hash) return
  // inApp marks entries pushed by the app, so back() knows a previous in-app page exists.
  if (options.replace) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState({ inApp: true }, '', url)
  window.dispatchEvent(new Event(NAV_EVENT))
}

/** Go back inside the app, or to a fallback when the page was opened directly. */
export function back(fallback: string) {
  if (window.history.state?.inApp) window.history.back()
  else navigate(fallback, { replace: true })
}
