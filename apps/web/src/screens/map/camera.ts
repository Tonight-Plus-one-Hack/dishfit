// Camera rules for the restaurant map, kept free of MapLibre so they can be tested.
// The map opens on Berlin at Kiez zoom: around the user when they shared a position inside Berlin, else in the centre.
// Framing a set of restaurants never zooms out past FRAME_MIN_ZOOM, and the map itself cannot leave Berlin (BERLIN_BOUNDS).
// The last camera is kept per browser tab (sessionStorage), so coming back to the map does not move it.
import type { LatLng } from '../../data/contract'
import { BERLIN_CENTER } from '../../lib/geo'

/** Berlin with a small margin, as [[west, south], [east, north]]: the map cannot pan or zoom out beyond it. */
export const BERLIN_BOUNDS: [[number, number], [number, number]] = [
  [13.0, 52.3],
  [13.85, 52.72],
]

/** Map zoom limits. Below about 10 a phone would show Brandenburg. */
export const MIN_ZOOM = 10
export const MAX_ZOOM = 18

/** A Kiez on a phone: streets readable, a handful of restaurants in view. */
export const KIEZ_ZOOM = 14
/** Framing restaurants zooms out at most this far (a few Kieze), never to the whole city. */
export const FRAME_MIN_ZOOM = 12
/** Framing restaurants zooms in at most this far, so a single place keeps its streets around it. */
export const FRAME_MAX_ZOOM = 15
/** Frame key of the area around the user (or central Berlin) when no Kiez is picked. */
export const NEAR_FRAME = 'near'

/** Restaurants around the user (or the centre) that the start view keeps in sight, zooming out from Kiez zoom if needed. */
export const NEAREST_IN_VIEW = 8

/** Pixels of the canvas covered by screen chrome on each side. */
export interface Padding {
  top: number
  bottom: number
  left: number
  right: number
}

export interface Camera {
  center: LatLng
  zoom: number
}

/** MapLibre's tile size: the world is 512 * 2^zoom pixels wide. */
const TILE = 512

export function inBerlin(p: LatLng): boolean {
  const [[west, south], [east, north]] = BERLIN_BOUNDS
  return p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Web Mercator in world units (0..1). */
function project(p: LatLng): { x: number; y: number } {
  const sin = Math.sin((clamp(p.lat, -85, 85) * Math.PI) / 180)
  return { x: (p.lng + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) }
}

function unproject(x: number, y: number): LatLng {
  const lat = (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90
  return { lat, lng: x * 360 - 180 }
}

/**
 * Shrinks padding that leaves less than `minFree` pixels of map in either direction.
 * Chrome can cover most of a short phone screen (an in-app browser at 390 x 664); padding larger than the canvas
 * makes MapLibre's fitBounds and easeTo fly off to a wrong place.
 */
export function fitPadding(padding: Padding, width: number, height: number, minFree = 120): Padding {
  const scale = (a: number, b: number, size: number) => {
    const free = Math.max(0, size - minFree)
    return a + b <= free || a + b === 0 ? 1 : free / (a + b)
  }
  const v = scale(padding.top, padding.bottom, height)
  const h = scale(padding.left, padding.right, width)
  return { top: padding.top * v, bottom: padding.bottom * v, left: padding.left * h, right: padding.right * h }
}

/** Zoom at which a world-unit span fits into `pixels`; Infinity for an empty span. */
function zoomFor(span: number, pixels: number): number {
  return span <= 0 ? Infinity : Math.log2(Math.max(1, pixels) / (span * TILE))
}

/**
 * The camera that shows every point in the part of the canvas the padding leaves free, between FRAME_MIN_ZOOM and FRAME_MAX_ZOOM.
 * With `around`, the camera centres there and keeps the points in view on every side of it.
 * The centre is meant for the padded area: pass the same padding to MapLibre's jumpTo or easeTo.
 */
export function frameCamera(points: LatLng[], size: { width: number; height: number }, padding: Padding, around?: LatLng): Camera {
  const pad = fitPadding(padding, size.width, size.height)
  const freeW = size.width - pad.left - pad.right
  const freeH = size.height - pad.top - pad.bottom
  const all = around ? [...points, around] : points
  if (all.length === 0) return { center: around ?? BERLIN_CENTER, zoom: KIEZ_ZOOM }
  const xy = all.map(project)
  let spanX: number
  let spanY: number
  let center: LatLng
  if (around) {
    const c = project(around)
    spanX = 2 * Math.max(...xy.map((p) => Math.abs(p.x - c.x)))
    spanY = 2 * Math.max(...xy.map((p) => Math.abs(p.y - c.y)))
    center = around
  } else {
    const xs = xy.map((p) => p.x)
    const ys = xy.map((p) => p.y)
    spanX = Math.max(...xs) - Math.min(...xs)
    spanY = Math.max(...ys) - Math.min(...ys)
    center = unproject((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2)
  }
  const zoom = Math.min(zoomFor(spanX, freeW), zoomFor(spanY, freeH))
  return { center, zoom: clamp(zoom, FRAME_MIN_ZOOM, FRAME_MAX_ZOOM) }
}

const sq = (a: LatLng, b: LatLng) => {
  const k = Math.cos((b.lat * Math.PI) / 180)
  return (a.lat - b.lat) ** 2 + ((a.lng - b.lng) * k) ** 2
}

/** The `count` points closest to `origin`. */
export function nearest<T extends LatLng>(points: T[], origin: LatLng, count: number): T[] {
  return [...points].sort((a, b) => sq(a, origin) - sq(b, origin)).slice(0, count)
}

/**
 * The view for a fresh map or a new Kiez.
 * A Kiez frames its restaurants. Otherwise the view centres on the user when they are in Berlin, else on central Berlin,
 * at Kiez zoom, zooming out (to FRAME_MIN_ZOOM at most) until the nearest restaurants are in sight.
 */
export function startCamera({
  points,
  kiez,
  user,
  size,
  padding,
}: {
  /** Restaurants with a matching dish; outliers outside Berlin are ignored. */
  points: LatLng[]
  /** True when the user picked a Kiez: frame all its restaurants. */
  kiez: boolean
  user: LatLng | null
  size: { width: number; height: number }
  padding: Padding
}): Camera {
  const inside = points.filter(inBerlin)
  if (kiez && inside.length > 0) return frameCamera(inside, size, padding)
  const origin = user && inBerlin(user) ? user : BERLIN_CENTER
  if (inside.length === 0) return { center: origin, zoom: KIEZ_ZOOM }
  const around = frameCamera(nearest(inside, origin, NEAREST_IN_VIEW), size, padding, origin)
  return { center: origin, zoom: Math.min(around.zoom, KIEZ_ZOOM) }
}

// ---------- Last view per tab ----------

const VIEW_KEY = 'dishfit.map.view.v1'
// A view centred from GPS can contain the exact fix. Keep it tied to the live position.
const locationViews = new WeakMap<LatLng, SavedView>()

export interface SavedView extends Camera {
  /** The frame the view belongs to (a Kiez or the area near the user); another frame starts fresh. */
  frame: string
}

function session(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function readView(frame: string, location: LatLng | null = null): Camera | null {
  if (location) {
    const view = locationViews.get(location)
    return view?.frame === frame ? { center: view.center, zoom: view.zoom } : null
  }
  try {
    const raw = session()?.getItem(VIEW_KEY)
    if (!raw) return null
    const view = JSON.parse(raw) as Partial<SavedView>
    if (view.frame !== frame || typeof view.zoom !== 'number' || !view.center) return null
    const { lat, lng } = view.center
    if (typeof lat !== 'number' || typeof lng !== 'number' || !inBerlin({ lat, lng })) return null
    return { center: { lat, lng }, zoom: clamp(view.zoom, MIN_ZOOM, MAX_ZOOM) }
  } catch {
    return null
  }
}

export function saveView(frame: string, camera: Camera, location: LatLng | null = null) {
  if (location) {
    locationViews.set(location, { frame, center: camera.center, zoom: camera.zoom })
    return
  }
  try {
    session()?.setItem(VIEW_KEY, JSON.stringify({ frame, center: camera.center, zoom: camera.zoom } satisfies SavedView))
  } catch {
    // Private mode or a full storage: the map simply opens fresh next time.
  }
}
