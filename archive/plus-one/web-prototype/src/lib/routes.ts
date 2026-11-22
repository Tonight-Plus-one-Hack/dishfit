// Route table and imperative navigation for the History API router.
export type Route =
  | { name: 'landing' }
  | { name: 'cities' }
  | { name: 'city'; city: string }
  | { name: 'spots'; city: string }
  | { name: 'hangout'; id: string }
  | { name: 'join'; id: string }
  | { name: 'create'; city: string | null }
  | { name: 'imprint' }
  | { name: 'privacy' }
  | { name: 'notFound' }

export const paths = {
  landing: () => '/',
  cities: () => '/cities',
  city: (city: string) => `/c/${city}`,
  spots: (city: string) => `/c/${city}/spots`,
  hangout: (id: string) => `/h/${id}`,
  join: (id: string) => `/h/${id}/join`,
  imprint: () => '/impressum',
  privacy: () => '/datenschutz',
  /** Start a hangout; presets skip the matching steps. */
  create: (city?: string, preset: { time?: string; spot?: string } = {}) => {
    const query = new URLSearchParams(Object.entries(preset).filter((e): e is [string, string] => Boolean(e[1])))
    const search = query.size ? `?${query}` : ''
    return city ? `/c/${city}/new${search}` : `/new${search}`
  },
}

export function parse(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0) return { name: 'landing' }
  if (parts[0] === 'cities' && parts.length === 1) return { name: 'cities' }
  if (parts[0] === 'new' && parts.length === 1) return { name: 'create', city: null }
  if (parts[0] === 'impressum' && parts.length === 1) return { name: 'imprint' }
  if (parts[0] === 'datenschutz' && parts.length === 1) return { name: 'privacy' }
  if (parts[0] === 'c' && parts.length === 3 && parts[2] === 'new') return { name: 'create', city: parts[1] }
  if (parts[0] === 'c' && parts.length === 2) return { name: 'city', city: parts[1] }
  if (parts[0] === 'c' && parts.length === 3 && parts[2] === 'spots') return { name: 'spots', city: parts[1] }
  if (parts[0] === 'h' && parts.length === 2) return { name: 'hangout', id: parts[1] }
  if (parts[0] === 'h' && parts.length === 3 && parts[2] === 'join') return { name: 'join', id: parts[1] }
  return { name: 'notFound' }
}

export const NAV_EVENT = 'plusone:navigate'

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
  if (options.replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(NAV_EVENT))
}

