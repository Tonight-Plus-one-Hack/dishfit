// Route recognition shared by the web router and the Worker serving document requests.
// The map is the start page at /; /map stays as an alias for older links. Discover (route name home) lives at /entdecken.
export type AppRoute =
  | { name: 'home' }
  | { name: 'map' }
  | { name: 'search' }
  | { name: 'today' }
  | { name: 'onboarding' }
  | { name: 'restaurant'; id: string }
  | { name: 'dish'; id: string }
  | { name: 'notFound' }
  | { name: 'camera' }
  | { name: 'snap' }
  | { name: 'snapStatus'; id: string }
  | { name: 'me' }
  | { name: 'leaderboard' }
  | { name: 'impressum' }
  | { name: 'datenschutz' }
  | { name: 'waitlist' }

export function parseAppRoute(pathname: string): AppRoute {
  let parts: string[]
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return { name: 'notFound' }
  }
  if (parts.length === 0) return { name: 'map' }
  if (parts.length === 1 && parts[0] === 'map') return { name: 'map' }
  if (parts.length === 1 && parts[0] === 'entdecken') return { name: 'home' }
  if (parts.length === 1 && parts[0] === 'search') return { name: 'search' }
  if (parts.length === 1 && parts[0] === 'today') return { name: 'today' }
  if (parts.length === 1 && parts[0] === 'onboarding') return { name: 'onboarding' }
  if (parts.length === 2 && parts[0] === 'r') return { name: 'restaurant', id: parts[1]! }
  if (parts.length === 2 && parts[0] === 'd') return { name: 'dish', id: parts[1]! }
  if (parts.length === 1 && parts[0] === 'kamera') return { name: 'camera' }
  if (parts.length === 1 && parts[0] === 'scan') return { name: 'snap' }
  if (parts.length === 2 && parts[0] === 'scan') return { name: 'snapStatus', id: parts[1]! }
  if (parts.length === 1 && parts[0] === 'me') return { name: 'me' }
  if (parts.length === 1 && parts[0] === 'bestenliste') return { name: 'leaderboard' }
  if (parts.length === 1 && parts[0] === 'impressum') return { name: 'impressum' }
  if (parts.length === 1 && parts[0] === 'datenschutz') return { name: 'datenschutz' }
  if (parts.length === 1 && parts[0] === 'waitlist') return { name: 'waitlist' }
  return { name: 'notFound' }
}
