// Share links and share records. Every shared link carries ?ref=<channel>, and dish links also the
// share id (&s=), so the Worker can count shares and the visits they bring (worker/src/share/routes.ts).
import { ANON_ID_PATTERN, ANON_ID_STORAGE_KEY } from '../../../../packages/contract/src/api'

export type ShareChannel = 'native' | 'whatsapp' | 'copy' | 'story'

/** Shared links carry the channel as ref, so visits can be traced back to how they were shared. */
export function sharedUrl(url: string, channel: ShareChannel, shareId?: string): string {
  const shared = new URL(url, window.location.origin)
  shared.searchParams.set('ref', channel)
  if (shareId) shared.searchParams.set('s', shareId)
  return shared.toString()
}

function randomId(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** The same random browser ID for shares, analytics and team exclusion. */
export function storedAnonId(): string | null {
  try {
    const known = window.localStorage.getItem(ANON_ID_STORAGE_KEY)
    if (known && ANON_ID_PATTERN.test(known)) return known
    const next = randomId(12)
    window.localStorage.setItem(ANON_ID_STORAGE_KEY, next)
    return next
  } catch {
    return null
  }
}

/** Card images the Worker renders per dish: the link preview (1200 x 630) and the story (1080 x 1920). */
export function dishCardUrl(dishId: string, format: 'og' | 'story', download = false): string {
  return `/api/share/${encodeURIComponent(dishId)}/${format}${download ? '?download=1' : ''}`
}

/**
 * Records a dish share and returns its link right away: the id is made here, so a WhatsApp tab can
 * open within the tap, and the record goes out in the background (keepalive outlives the page).
 */
export function shareDish(dishId: string, channel: ShareChannel, pageUrl: string): string {
  const id = randomId(8)
  fetch('/api/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, dishId, channel, anonId: storedAnonId() ?? randomId(12) }),
    keepalive: true,
  }).catch(() => {
    // Counting is best effort; the link works either way.
  })
  return sharedUrl(pageUrl, channel, id)
}
