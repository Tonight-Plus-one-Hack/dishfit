// Shared fixtures for the flows: a guarded page that fails the test on console errors and failed network
// requests, a step screenshot helper, a fixed clock, and the healthy-only rule for dish lists.
import { test as base, expect, type Page, type Request } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { artifactsDir } from './artifacts.ts'

export { expect }

/** True when the suite runs against a deployment instead of the local Worker. */
export const live = Boolean(process.env.E2E_BASE_URL)

/**
 * Wednesday lunchtime in Berlin. A fixed clock makes "open now", the Passt-zu-deinem-Tag picks and the
 * Today diary the same on every run, whenever the suite runs.
 */
const FIXED_NOW = new Date('2026-11-18T12:30:00+01:00')

/**
 * Third parties the app may load that are allowed to fail: the Google Places UI Kit renders nothing
 * without a browser key (the app shows its own placeholder then), and its scripts and fonts come from these hosts.
 */
const OPTIONAL_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)gstatic\.com$/, /(^|\.)google\.com$/]
const OPTIONAL_CONSOLE = [/Google Maps JavaScript API/i, /gmp-place/i]

/**
 * E2E_LIVE_AI=1 lets live runs send their camera photos to the real scan AI (a few cents and rate
 * limited per IP); without it a live run gets the canned reading below, so every merge stays free.
 */
const liveAi = process.env.E2E_LIVE_AI === '1'

const range = (value: number, low: number, high: number) => ({ value, low, high })
const NUTRIENTS = { kcal: range(620, 540, 700), protein: range(42, 36, 48), carbs: range(70, 60, 80), fat: range(16, 12, 20) }
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

/** What a live run's blocked write answers: the response shape the app expects, nothing stored. */
function liveWrite(request: Request): { status: number; contentType?: string; body?: string } {
  const path = new URL(request.url()).pathname
  const scan = { id: 'e2e-live', createdAt: new Date().toISOString(), mode: 'e2e', costUsd: 0 }
  if (request.method() === 'POST' && path === '/api/scans') {
    // The multipart body names the kind: plate or menu.
    return /name="kind"\r\n\r\nmenu/.test(request.postDataBuffer()?.toString('latin1') ?? '')
      ? json({
          scan: {
            ...scan,
            kind: 'menu',
            menu: { restaurantName: 'E2E-Karte', dishes: [{ name: 'Hähnchen-Bowl', description: 'Reis, Hähnchen, Brokkoli', priceEur: 11.9, nutrients: NUTRIENTS }] },
          },
        })
      : json({ scan: { ...scan, kind: 'plate', plate: { name: 'Hähnchen-Reis-Bowl', items: ['Reis', 'Hähnchen'], nutrients: NUTRIENTS, confidence: 'medium', note: null } } })
  }
  const vote = /^\/api\/dishes\/([^/]+)\/confirmations$/.exec(path)
  if (request.method() === 'POST' && vote) {
    const body = request.postDataJSON() as { verdict: 'yes' | 'no'; correction?: string }
    return json({
      dishId: decodeURIComponent(vote[1]!),
      yes: body.verdict === 'yes' ? 1 : 0,
      no: body.verdict === 'no' ? 1 : 0,
      mine: { verdict: body.verdict, correction: body.correction ?? null },
    })
  }
  return { status: 204 }
}

function optional(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return OPTIONAL_HOSTS.some((pattern) => pattern.test(host))
  } catch {
    return false
  }
}

/** Dish names a healthy-only app must never list: pizza, burgers, fries and desserts. */
export const UNHEALTHY = /pizz|burger|pommes|\bfries\b|tiramisu|dessert|kuchen|torte|brownie|cheesecake|eisbecher|waffel|donut|muffin|cr[eê]pe/i

export function expectHealthy(names: string[], where: string) {
  expect(names.length, `${where}: dish names found`).toBeGreaterThan(0)
  // Gaisburger Marsch is a Swabian stew named after Gaisburg.
  const unhealthy = names.filter((name) => UNHEALTHY.test(name.replace(/\bGaisburger\s+Marsch\b/gi, '')))
  expect(unhealthy, `${where}: unhealthy dishes listed`).toEqual([])
}

type Shot = (name: string) => Promise<void>

export const test = base.extend<{ shot: Shot; problems: string[]; skipLocationPrompt: boolean }>({
  skipLocationPrompt: [true, { option: true }],
  problems: async ({ page }, use) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (OPTIONAL_CONSOLE.some((pattern) => pattern.test(text))) return
      if (optional(message.location().url)) return
      problems.push(`console error: ${text} (${message.location().url})`)
    })
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText ?? 'failed'
      // Aborted requests are the browser cancelling work it no longer needs (map tiles after a zoom, a route change).
      if (reason.includes('ERR_ABORTED') || optional(request.url())) return
      problems.push(`request failed: ${request.method()} ${request.url()} (${reason})`)
    })
    page.on('response', (response) => {
      if (response.status() < 400 || optional(response.url())) return
      problems.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`)
    })
    await use(problems)
  },

  page: async ({ page, skipLocationPrompt }, use) => {
    await page.clock.setFixedTime(FIXED_NOW)
    if (skipLocationPrompt) {
      await page.addInitScript(() => {
        const key = 'dishfit.location.choice.v1'
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify('later'))
      })
    }
    // Against a deployment the suite must not write analytics, shares, votes or profiles into production
    // data: writes to /api are answered here (see liveWrite). The local run exercises the real write routes.
    if (live && process.env.E2E_ALLOW_WRITES !== '1') {
      await page.route('**/api/**', (route) => {
        const request = route.request()
        if (request.method() === 'GET' || request.method() === 'HEAD') return route.fallback()
        if (liveAi && request.method() === 'POST' && new URL(request.url()).pathname === '/api/scans') return route.fallback()
        return route.fulfill(liveWrite(request))
      })
    }
    await use(page)
  },

  shot: async ({ page }, use, testInfo) => {
    const flow = testInfo.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    const dir = join(artifactsDir, 'screens', testInfo.project.name, flow)
    mkdirSync(dir, { recursive: true })
    let step = 0
    await use(async (name) => {
      step += 1
      await page.screenshot({
        path: join(dir, `${String(step).padStart(2, '0')}-${name}.png`),
        animations: 'disabled',
      })
    })
  },
})

// Every flow ends clean: no console errors and no failed requests anywhere along the way.
test.afterEach(async ({ problems }) => {
  expect(problems, 'console errors and failed network requests').toEqual([])
})

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768
