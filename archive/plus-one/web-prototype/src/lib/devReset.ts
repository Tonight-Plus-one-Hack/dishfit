// Test hook (E2E review T3, web side): in development, ?reset on any URL forgets this device
// (joins, hosted plans, chat, blocks, saved spots, nickname, pinned clock) before anything reads storage.
// Imported first in main.tsx so it runs before the modules that read localStorage at load time.
if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reset')) {
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (const key of Object.keys(store)) if (key.startsWith('plusone.')) store.removeItem(key)
  }
  const url = new URL(window.location.href)
  url.searchParams.delete('reset')
  window.history.replaceState(null, '', url)
}

export {}
