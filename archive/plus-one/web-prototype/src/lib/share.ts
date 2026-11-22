import type { ShareChannel } from '../data/types'

/** Shared links carry utm_source=share and the channel, so joins can be traced back to the share that brought them. */
export function sharedUrl(url: string, channel: ShareChannel): string {
  const shared = new URL(url, window.location.origin)
  shared.searchParams.set('utm_source', 'share')
  shared.searchParams.set('utm_medium', channel)
  return shared.toString()
}
