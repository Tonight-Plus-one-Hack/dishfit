import { type AppEvent, type EventName } from '../../../../packages/contract/src/api'
import { storedAnonId } from './share'

const URL = '/api/events'
const BATCH_DELAY_MS = 3_000
const pending = new Map<EventName, AppEvent>()
let timer: ReturnType<typeof setTimeout> | undefined

function flush() {
  clearTimeout(timer)
  timer = undefined
  if (pending.size === 0) return
  const body = JSON.stringify({ events: [...pending.values()] })
  pending.clear()

  // Keepalive survives navigation and lets us omit the separate scan/profile cookie and page URL.
  void fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  }).catch(() => undefined)
}

export function track(name: EventName) {
  const anonId = storedAnonId()
  if (!anonId) return
  pending.set(name, { name, anonId })
  timer ??= setTimeout(flush, BATCH_DELAY_MS)
}

export function startAnalytics() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
  track('app_open')
}
