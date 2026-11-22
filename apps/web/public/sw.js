// Offline service worker, hand-written and dependency-free.
// Install: precache the app shell and every built script and stylesheet, which carry the seed data,
// so the installed app opens and browses dishes offline. The build (build/pwa-share.ts) fills in
// PRECACHE and a VERSION derived from it; a new deploy installs a new cache and drops the old one.
// Navigations: network first, falling back to the cached shell. Built assets, icons and dish images:
// cache first. Map tiles and /api stay network-only.
const VERSION = 'dev'
const PRECACHE = []
const SHELL_CACHE = `shell-${VERSION}`
const ASSET_CACHE = `assets-${VERSION}`
const MANIFESTS = ['/manifest.webmanifest', '/manifest.en.webmanifest']
const SHELL = ['/', ...MANIFESTS, '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)),
      caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHE)),
    ]).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    let pathname = url.pathname
    try {
      pathname = decodeURI(pathname)
    } catch {
      // Keep the original path if any percent encoding is invalid.
    }
    // Standalone guides have their own HTML and must not replace the offline app shell.
    if (/^\/(?:en\/)?(?:kiez|kategorie)(?:\/|$)/.test(pathname)) return

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (response.headers.get('content-type') ?? '').startsWith('text/html')) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy))
          }
          return response
        })
        .catch(() => caches.match('/', { cacheName: SHELL_CACHE }).then((hit) => hit ?? Response.error())),
    )
    return
  }

  if (MANIFESTS.includes(url.pathname)) {
    event.respondWith(caches.match(request, { cacheName: SHELL_CACHE }).then((hit) => hit ?? fetch(request)))
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
