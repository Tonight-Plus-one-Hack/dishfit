import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

// The Worker (apps/api, wrangler dev) serves /api and /go once the backend runs locally.
const WORKER = 'http://localhost:8787'

// Dev only: while no Worker is running, partner hand-offs still land on the partner's city search,
// so the prototype stays clickable. The Worker owns the real redirect and counts the click.
const PARTNER_FALLBACK: Record<string, (city: string) => string> = {
  expedia: (city) => `https://www.expedia.com/Hotel-Search?destination=${encodeURIComponent(city)}`,
  hotels: (city) => `https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent(city)}`,
  vrbo: (city) => `https://www.vrbo.com/search?destination=${encodeURIComponent(city)}`,
  layla: () => 'https://layla.ai/',
}

const go: ProxyOptions = {
  target: WORKER,
  configure: (proxy) => {
    proxy.on('error', (_error, req: IncomingMessage, res) => {
      if (!('writeHead' in res)) return
      const url = new URL(req.url ?? '/', 'http://dev.local')
      const brand = url.pathname.split('/')[2] ?? ''
      const slug = url.searchParams.get('city') ?? ''
      const city = slug.charAt(0).toUpperCase() + slug.slice(1)
      const target = PARTNER_FALLBACK[brand]?.(city)
      const response = res as ServerResponse
      if (target) response.writeHead(302, { Location: target }).end()
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    // MapLibre (about 1 MB) sits in its own lazy chunk that only map screens load.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      '/api': WORKER,
      '/go': go,
    },
  },
})
