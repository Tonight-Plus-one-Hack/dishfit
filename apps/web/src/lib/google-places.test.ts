import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const restaurant = { placeId: 'matched-id', isTestData: false }

it.each([undefined, '0'])('keeps Places off (%s) with a browser key and a matched restaurant', { timeout: 30_000 }, async (setting) => {
  vi.stubEnv('VITE_PLACES_ENABLED', setting)
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-browser-key')
  const { hasLivePlace, loadPlacesKit } = await import('./google-places')
  const { GooglePlaceBlock } = await import('../screens/restaurant/GooglePlaceBlock')

  expect(hasLivePlace(restaurant)).toBe(false)
  expect(renderToStaticMarkup(createElement(GooglePlaceBlock, { restaurant }))).toBe('')
  await expect(loadPlacesKit()).rejects.toThrow('No Google Maps key in this build')
})

it('allows real matched restaurants when explicitly enabled', async () => {
  vi.stubEnv('VITE_PLACES_ENABLED', '1')
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-browser-key')
  const { hasLivePlace } = await import('./google-places')

  expect(hasLivePlace(restaurant)).toBe(true)
  expect(hasLivePlace({ ...restaurant, isTestData: true })).toBe(false)
  expect(hasLivePlace({ ...restaurant, placeId: null })).toBe(false)
})
