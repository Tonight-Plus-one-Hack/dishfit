// Click-through regression of the main flows, headless Chromium at desktop and phone size.
// `npm run e2e` tests a local Worker (e2e/serve.ts); `E2E_BASE_URL=<url> npm run e2e` tests a live deployment.
import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import { artifactsDir } from './artifacts.ts'

const live = process.env.E2E_BASE_URL?.replace(/\/$/, '')
if (process.env.E2E_LIVE_AI === '1' && !live) throw new Error('E2E_LIVE_AI=1 needs E2E_BASE_URL: the live scan check must name the deployed URL.')
const port = process.env.E2E_PORT ?? '8797'
const baseURL = live ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: resolve(artifactsDir, 'test-results'),
  fullyParallel: true,
  forbidOnly: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  // One retry absorbs a slow third-party tile server; a flow that fails twice is a regression.
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The whole run, build included, takes about 4 to 5 minutes on four workers; the cap leaves room for retries.
  globalTimeout: 8 * 60_000,
  reporter: [['list'], ['html', { outputFolder: resolve(artifactsDir, 'report'), open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Kreuzberg, near Moritzplatz: the app's own fallback origin, so distances look like a real visit.
    geolocation: { latitude: 52.5035, longitude: 13.4105 },
    permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
  webServer: live
    ? undefined
    : {
        command: 'node e2e/serve.ts',
        cwd: resolve(import.meta.dirname, '..'),
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
