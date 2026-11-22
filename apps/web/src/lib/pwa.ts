// Installable app: the offline service worker (public/sw.js, production builds only so development never
// serves stale modules) and the "Zum Home-Bildschirm" hint, offered once after a meaningful action
// (saving or logging a dish, sharing). Android and desktop Chrome get the browser's own install
// prompt; iOS Safari has none, so it gets a short instructions sheet.

export function registerServiceWorker() {
  listenForInstallPrompt()
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is an enhancement; the app works without it.
    })
  })
}

/** Chrome's install event; not in the DOM typings yet. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null

function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's mini bar away; we offer installing at a better moment.
    event.preventDefault()
    deferred = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    markInstallHintDone()
  })
}

export function installPrompt(): InstallPromptEvent | null {
  return deferred
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone or iPad Safari, the browser where adding to the home screen is a manual step. */
export function isIosSafari(ua: string = navigator.userAgent, touchPoints = navigator.maxTouchPoints): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)
}

export type InstallHintKind = 'prompt' | 'ios' | null

/** Which hint this browser can get right now, or null when it is installed already or cannot install. */
export function installHintKind(): InstallHintKind {
  if (isStandalone()) return null
  if (deferred) return 'prompt'
  return isIosSafari() ? 'ios' : null
}

const HINT_KEY = 'dishfit.installHint.v1'

export function installHintDone(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) !== null
  } catch {
    return true
  }
}

export function markInstallHintDone() {
  try {
    window.localStorage.setItem(HINT_KEY, String(Date.now()))
  } catch {
    // Blocked storage: the hint may come again next visit, which is acceptable.
  }
}

export const MEANINGFUL_EVENT = 'app:meaningful-action'

/** Call after something worth keeping the app for: a share, a saved or logged dish. */
export function noteMeaningfulAction() {
  window.dispatchEvent(new Event(MEANINGFUL_EVENT))
}
