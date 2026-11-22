import { afterEach, describe, expect, it, vi } from 'vitest'
import { BERLIN_CENTER } from '../../lib/geo'
import {
  BERLIN_BOUNDS,
  fitPadding,
  FRAME_MAX_ZOOM,
  FRAME_MIN_ZOOM,
  frameCamera,
  inBerlin,
  KIEZ_ZOOM,
  nearest,
  NEAREST_IN_VIEW,
  readView,
  saveView,
  startCamera,
} from './camera'

// The Instagram in-app browser on an iPhone: 390 x 664 CSS pixels.
const PHONE = { width: 390, height: 664 }
// Top chrome plus pin height, and the sheet, carousel and controls at the bottom.
const PHONE_PADDING = { top: 168, bottom: 290, left: 28, right: 28 }

const KREUZBERG = [
  { lat: 52.4996, lng: 13.4181 },
  { lat: 52.4979, lng: 13.4061 },
  { lat: 52.5021, lng: 13.4249 },
  { lat: 52.4932, lng: 13.4122 },
]
// Restaurants across the city, plus one with broken coordinates in Brandenburg (Dahme/Mark).
const CITY = [...KREUZBERG, { lat: 52.5487, lng: 13.3523 }, { lat: 52.4563, lng: 13.3215 }, { lat: 52.5304, lng: 13.4655 }]
const DAHME = { lat: 51.8667, lng: 13.4333 }

describe('fitPadding', () => {
  it('leaves padding that fits untouched', () => {
    expect(fitPadding(PHONE_PADDING, PHONE.width, PHONE.height)).toEqual(PHONE_PADDING)
  })

  it('shrinks padding that would cover the whole canvas, keeping a strip of map free', () => {
    // Before the fix: 186 + 557 px of chrome on a 664 px screen sent the camera to Austria.
    const pad = fitPadding({ top: 186, bottom: 557, left: 28, right: 28 }, 390, 664)
    expect(pad.top + pad.bottom).toBeCloseTo(664 - 120)
    expect(pad.top / pad.bottom).toBeCloseTo(186 / 557)
    expect(pad.left).toBe(28)
  })
})

describe('frameCamera', () => {
  it('centres on the bounds and zooms to fit, inside the frame limits', () => {
    const cam = frameCamera(KREUZBERG, PHONE, PHONE_PADDING)
    expect(cam.center.lat).toBeGreaterThan(52.49)
    expect(cam.center.lat).toBeLessThan(52.51)
    expect(cam.zoom).toBeGreaterThanOrEqual(FRAME_MIN_ZOOM)
    expect(cam.zoom).toBeLessThanOrEqual(FRAME_MAX_ZOOM)
  })

  it('never zooms out past the frame limit, however far apart the points are', () => {
    expect(frameCamera([...CITY, DAHME], PHONE, PHONE_PADDING).zoom).toBe(FRAME_MIN_ZOOM)
  })

  it('never zooms in past the frame limit for a single place', () => {
    expect(frameCamera([KREUZBERG[0]], PHONE, PHONE_PADDING).zoom).toBe(FRAME_MAX_ZOOM)
  })

  it('centres on `around` and keeps the points on every side of it', () => {
    const around = { lat: 52.4996, lng: 13.4181 }
    const cam = frameCamera(KREUZBERG, PHONE, PHONE_PADDING, around)
    expect(cam.center).toEqual(around)
    expect(cam.zoom).toBeLessThanOrEqual(frameCamera(KREUZBERG, PHONE, PHONE_PADDING).zoom)
  })

  it('stays sane when the chrome covers more than the canvas', () => {
    const cam = frameCamera(KREUZBERG, PHONE, { top: 400, bottom: 600, left: 28, right: 28 })
    expect(Number.isFinite(cam.zoom)).toBe(true)
    expect(cam.zoom).toBeGreaterThanOrEqual(FRAME_MIN_ZOOM)
  })
})

describe('startCamera', () => {
  const start = (over: Partial<Parameters<typeof startCamera>[0]> = {}) =>
    startCamera({ points: CITY, kiez: false, user: null, size: PHONE, padding: PHONE_PADDING, ...over })

  it('opens on central Berlin at Kiez zoom when restaurants are close', () => {
    // A handful of places within about 150 m of the centre.
    const close = Array.from({ length: NEAREST_IN_VIEW }, (_, i) => ({ lat: 52.5035 + 0.001 * Math.cos(i), lng: 13.4108 + 0.0015 * Math.sin(i) }))
    expect(start({ points: [...close, ...CITY] })).toEqual({ center: BERLIN_CENTER, zoom: KIEZ_ZOOM })
  })

  it('zooms out from Kiez zoom until the nearest restaurants fit, but not past the frame limit', () => {
    const sparse = [{ lat: 52.5235, lng: 13.4108 }, { lat: 52.4835, lng: 13.4108 }, { lat: 52.5035, lng: 13.3708 }]
    const cam = start({ points: sparse })
    expect(cam.center).toEqual(BERLIN_CENTER)
    expect(cam.zoom).toBeLessThan(KIEZ_ZOOM)
    expect(cam.zoom).toBeGreaterThanOrEqual(FRAME_MIN_ZOOM)
  })

  it('opens on the user when they shared a position in Berlin', () => {
    const user = { lat: 52.5487, lng: 13.3523 }
    expect(start({ user }).center).toEqual(user)
  })

  it('ignores a position outside Berlin and opens on the centre', () => {
    expect(start({ user: DAHME }).center).toEqual(BERLIN_CENTER)
  })

  it('ignores restaurants outside Berlin, so one bad coordinate cannot drag the view to Brandenburg', () => {
    const cam = start({ points: [...KREUZBERG, DAHME], kiez: true })
    expect(inBerlin(cam.center)).toBe(true)
    expect(cam.zoom).toBeGreaterThanOrEqual(FRAME_MIN_ZOOM)
  })

  it('frames all restaurants of a picked Kiez', () => {
    const cam = start({ points: KREUZBERG, kiez: true })
    expect(cam).toEqual(frameCamera(KREUZBERG, PHONE, PHONE_PADDING))
  })

  it('opens at Kiez zoom when nothing matches', () => {
    expect(start({ points: [] })).toEqual({ center: BERLIN_CENTER, zoom: KIEZ_ZOOM })
  })
})

describe('nearest', () => {
  it('returns the closest points first', () => {
    const near = nearest(CITY, BERLIN_CENTER, 2)
    expect(near).toHaveLength(2)
    expect(near.every((p) => KREUZBERG.includes(p))).toBe(true)
  })
})

describe('inBerlin', () => {
  it('accepts the city and rejects Brandenburg', () => {
    expect(inBerlin(BERLIN_CENTER)).toBe(true)
    expect(inBerlin(DAHME)).toBe(false)
    const [[west, south]] = BERLIN_BOUNDS
    expect(inBerlin({ lat: south - 0.01, lng: west + 0.1 })).toBe(false)
  })
})

describe('saved view', () => {
  const store = new Map<string, string>()
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }

  afterEach(() => {
    store.clear()
    vi.unstubAllGlobals()
  })

  it('reopens the last view of the same frame only', () => {
    vi.stubGlobal('window', { sessionStorage: fake })
    saveView('near:centre', { center: { lat: 52.51, lng: 13.4 }, zoom: 14.2 })
    expect(readView('near:centre')).toEqual({ center: { lat: 52.51, lng: 13.4 }, zoom: 14.2 })
    expect(readView('kiez:Kreuzberg')).toBeNull()
  })

  it('drops a stored view outside Berlin', () => {
    vi.stubGlobal('window', { sessionStorage: fake })
    saveView('near:centre', { center: DAHME, zoom: 12 })
    expect(readView('near:centre')).toBeNull()
  })

  it('restores a location-based view only in memory for the same fix', () => {
    vi.stubGlobal('window', { sessionStorage: fake })
    const location = { lat: 52.512345, lng: 13.428765 }
    const camera = { center: location, zoom: 14 }
    saveView('near:user', camera, location)
    expect(readView('near:user', location)).toEqual(camera)
    expect(readView('near:user', { ...location })).toBeNull()
    expect(readView('near:user')).toBeNull()
    expect(store.size).toBe(0)
  })

  it('works without storage', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked')
      },
    })
    expect(() => saveView('near:centre', { center: BERLIN_CENTER, zoom: 14 })).not.toThrow()
    expect(readView('near:centre')).toBeNull()
  })
})
