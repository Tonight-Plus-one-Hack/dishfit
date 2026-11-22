import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { pwaShare } from './build/pwa-share.ts'

// The backend Worker serves /api once it exists; until then src/data/api.ts answers from the seed module.
const API = 'http://localhost:8787'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), pwaShare(loadEnv(mode, process.cwd(), 'DISHFIT_').DISHFIT_CANONICAL_URL)],
  worker: {
    format: 'es',
  },
  build: {
    // MapLibre (about 1 MB) sits in its own lazy chunk that only the map screen loads.
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      '/api': API,
    },
  },
}))
