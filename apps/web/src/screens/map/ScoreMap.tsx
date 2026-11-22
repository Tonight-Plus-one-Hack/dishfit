// MapLibre map with our own restaurant coordinates as category pins with kcal or health score, on a calm
// Apple-Maps-like tint of the OpenFreeMap style. Pins are React components portalled into MapLibre markers. Loaded lazily by MapScreen.
// Pins that would touch at the current zoom merge into a cluster bubble (cluster.ts); tapping it zooms in until they split.
// The camera stays in Berlin and opens at Kiez zoom; the rules live in camera.ts.
// No Google Places content goes on this map.
import { useMapLanguage } from '../../lib/map-language'
import { useTranslation } from '../../i18n'
import { AttributionControl, LngLatBounds, Map as MlMap, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 locates its worker next to its own module, which bundlers move; hand it a bundled worker instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Art, type ArtName } from '../../components/glyphs/Art'
import { Icon } from '../../components/Icon'
import type { LatLng } from '../../data/contract'
import { BERLIN_CENTER } from '../../lib/geo'
import { MAP_CATEGORIES, type MapCategory } from '../../lib/map-category'
import { MOTION, prefersReducedMotion } from '../../lib/motion'
import { scoreTone } from '../../lib/nutrition'
import { BERLIN_BOUNDS, fitPadding, inBerlin, KIEZ_ZOOM, MAX_ZOOM, MIN_ZOOM, NEAR_FRAME, readView, saveView, startCamera, type Camera } from './camera'
import { expansionZoom, layoutKey, layoutPins, type PinLayout } from './cluster'
import { applyWarmStyle, LAND, STYLE_URL } from './warm-style'
import './apple-map.css'

setWorkerUrl(workerUrl)

export type PinMetric = 'kcal' | 'score'

export interface PinData {
  id: string
  lat: number
  lng: number
  name: string
  isTestData: boolean
  /** Place in the ranking; better places stack above worse ones. */
  order: number
  /** The restaurant's best matching dish; null draws a quiet dot (no dish matches the filters). */
  dish: { kcal: number; score: number; estimate: boolean } | null
  /** The main specialty of the restaurant's healthy menu. */
  category?: MapCategory
}

export interface MapInsets {
  top: number
  bottom: number
  /** Chrome on the right edge, such as the desktop panel drawer. */
  right?: number
}

export interface ScoreMapProps {
  pins: PinData[]
  metric: PinMetric
  activeId: string | null
  /** The desktop map stays mounted behind detail panels, which have their own camera focus. */
  detailView?: boolean
  /** A value pin was tapped while not active. */
  onSelect: (id: string) => void
  /** The active pin or a dot was tapped: open the restaurant. */
  onOpen: (id: string) => void
  /** The user's shared position, drawn as a dot; null until shared. */
  user: LatLng | null
  /** Identity of the picked Kiez or category, or NEAR_FRAME for the area around the user (or central Berlin). The camera frames it again when it changes. */
  frameKey: string
  /** Fly to the user whenever this increases. */
  locateNonce: number
  /** Screen chrome that covers the map: pins and camera moves keep clear of it. */
  insets: MapInsets
}

const SIDE = 28

/** A map pin drawn on a 34 x 44 box: a round head (r 17 around 17,17) whose tangents meet in the tip at 17,44. */
const DROP_PATH = 'M17 44 L3.78 27.69 A17 17 0 1 1 30.22 27.69 Z'

function Drop({ icon, size }: { icon: ArtName; size: number }) {
  return (
    <span className="pin__drop">
      <svg className="pin__shape" viewBox="0 0 34 44" aria-hidden="true">
        <path d={DROP_PATH} strokeLinejoin="round" />
      </svg>
      <span className="pin__icon">
        <Art name={icon} size={size} />
      </span>
    </span>
  )
}

// Teardrop map pins like Apple Maps: the 3D clay category icon (icon set A art) in the head, the tip on the restaurant.
// Values stay off the map; the selected pin grows on a spring and shows its name with kcal or score beside it.
// Styles in apple-map.css.
function Pin({
  pin,
  metric,
  active,
  onSelect,
  onOpen,
  ignoreClick,
}: {
  pin: PinData
  metric: PinMetric
  active: boolean
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  ignoreClick: () => boolean
}) {
  const t = useTranslation()
  const category = MAP_CATEGORIES[pin.category ?? 'mixed']
  const label = `${pin.name}, ${t(category.label)}`
  const test = pin.isTestData ? t('testData') : ''
  const style = { '--pin-category-color': category.color } as CSSProperties
  if (!pin.dish && !active) {
    return (
      <button
        type="button"
        className="pin-dot"
        aria-label={t('count1NoMatchingDishes2Open', label, test)}
        style={style}
        onClick={(e) => {
          e.stopPropagation()
          if (!ignoreClick()) onOpen(pin.id)
        }}
      >
        <Drop icon={category.art} size={18} />
      </button>
    )
  }
  const dish = pin.dish
  const spoken = !dish
    ? t('scoreMapNoMatchingDishes')
    : metric === 'kcal'
      ? `${dish.estimate ? t('approximatePrefix') : ''}${dish.kcal} kcal`
      : t('healthScore1', dish.score)
  return (
    <button
      type="button"
      className={`pin ${active ? 'is-active' : ''} pin--${dish ? scoreTone(dish.score) : 'none'}`}
      aria-label={active ? t('count123OpenRestaurant', label, test, spoken) : `${label}${test}: ${spoken}`}
      aria-pressed={active}
      style={style}
      onClick={(e) => {
        e.stopPropagation()
        if (ignoreClick()) return
        if (active) onOpen(pin.id)
        else onSelect(pin.id)
      }}
    >
      <Drop icon={category.art} size={26} />
      {active && (
        <span className="pin__label" aria-hidden="true">
          <span className="pin__name">{pin.name}</span>
          <span className="pin__meta">
            {!dish ? (
              <span>{t('scoreMapNoMatchingDishes2')}</span>
            ) : metric === 'kcal' ? (
              <>
                <span className="pin__tone" />
                <span>
                  <b>{`${dish.estimate ? '~' : ''}${dish.kcal}`}</b> kcal
                </span>
              </>
            ) : (
              <>
                <span className="pin__tone" />
                <span>{t('score')}{' '}<b>{dish.score}</b>
                </span>
              </>
            )}
            {pin.isTestData && <span>{t('scoreMapTestData')}</span>}
          </span>
          <Icon name="chevronRight" size={14} strokeWidth={2} className="pin__chev" />
        </span>
      )}
    </button>
  )
}

/** Several restaurants that would overlap at this zoom; tapping zooms in until they split. */
function Cluster({ categories, onExpand, ignoreClick }: { categories: MapCategory[]; onExpand: () => void; ignoreClick: () => boolean }) {
  const t = useTranslation()
  const count = categories.length
  const totals = new Map<MapCategory, number>()
  for (const category of categories) totals.set(category, (totals.get(category) ?? 0) + 1)
  let start = 0
  const segments = [...totals].map(([category, total]) => {
    const end = start + total
    const segment = `${MAP_CATEGORIES[category].color} ${start / count}turn ${end / count}turn`
    start = end
    return segment
  })
  return (
    <button
      type="button"
      className="pin-cluster"
      style={{ '--cluster-colors': totals.size === 1 ? MAP_CATEGORIES[categories[0]].color : `conic-gradient(${segments.join(', ')})` } as CSSProperties}
      aria-label={t('count1RestaurantsHereZoomIn', count)}
      onClick={(e) => {
        e.stopPropagation()
        if (!ignoreClick()) onExpand()
      }}
    >
      <span className="pin-cluster__body">{count}</span>
    </button>
  )
}

export default function ScoreMap(props: ScoreMapProps) {
  const t = useTranslation()
  const [failed, setFailed] = useState(false)
  const onFailure = useCallback(() => setFailed(true), [])
  if (failed) {
    return (
      <div className="score-map" style={{ background: LAND }}>
        <div className="score-map__error" role="status" style={{ top: props.insets.top + 16 }}>
          <Icon name="map" size={18} />
          <span>
            <b>{t('theMapIsntLoadingRightNow')}</b>{' '}{t('youCanStillUseTheList')}</span>
        </div>
      </div>
    )
  }
  return <InteractiveMap {...props} onFailure={onFailure} />
}

function InteractiveMap({ pins, metric, activeId, detailView = false, onSelect, onOpen, user, frameKey, locateNonce, insets, onFailure }: ScoreMapProps & { onFailure: () => void }) {
  const t = useTranslation()
  const categories = useMemo(() => new Map(pins.map((pin) => [pin.id, pin.category ?? 'mixed'] as const)), [pins])
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const hosts = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>())
  const [hostEls, setHostEls] = useState<Map<string, HTMLDivElement>>(() => new Map())
  const [layout, setLayout] = useState<PinLayout>(() => new Map())
  const dragging = useRef(false)
  const userMarker = useRef<Marker | null>(null)
  const insetsRef = useRef(insets)
  const pinsRef = useRef(pins)
  const userRef = useRef(user)
  const metricRef = useRef(metric)
  const activeRef = useRef(activeId)
  const showingDetail = useRef(detailView)
  const framed = useRef<string | null>(null)
  const restored = useRef(false)
  const layoutSig = useRef('')

  useEffect(() => {
    insetsRef.current = insets
    pinsRef.current = pins
    userRef.current = user
    metricRef.current = metric
    activeRef.current = activeId
  }, [insets, pins, user, metric, activeId])

  // Cluster pins that would touch at the current zoom; re-render only when the grouping changes.
  // Reads only refs, so it stays one stable function for the map's zoom listener.
  const relayout = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const next = layoutPins(pinsRef.current, metricRef.current, activeRef.current, map.getZoom())
    const sig = layoutKey(next)
    if (sig === layoutSig.current) return
    layoutSig.current = sig
    setLayout(next)
  }, [])

  // Pins hang above their point, so the top keeps a pin's height free as well.
  // On a short screen the chrome can cover most of the canvas; fitPadding keeps a strip of map free so camera moves stay sane.
  const padding = () => {
    const el = container.current
    const wanted = { top: insetsRef.current.top + 64, bottom: insetsRef.current.bottom + 16, left: SIDE, right: SIDE + (insetsRef.current.right ?? 0) }
    return el ? fitPadding(wanted, el.clientWidth, el.clientHeight) : wanted
  }
  const duration = (ms: number) => (prefersReducedMotion() ? 0 : ms)

  // Create the map once per mount.
  useEffect(() => {
    if (!container.current) return
    // Phones without WebGL2 (in-app browsers like WhatsApp or Instagram, Low Power Mode, older devices)
    // make MapLibre throw here. Show the "list still works" notice instead of crashing the whole results view.
    let map: MlMap
    try {
      map = new MlMap({
      container: container.current,
      style: STYLE_URL,
      center: [BERLIN_CENTER.lng, BERLIN_CENTER.lat],
      zoom: KIEZ_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: BERLIN_BOUNDS,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      })
    } catch {
      onFailure()
      return
    }
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new AttributionControl({ compact: true }), 'top-right')
    let styleLoaded = false
    map.on('style.load', () => {
      styleLoaded = true
      applyWarmStyle(map)
    })
    map.on('webglcontextlost', onFailure)
    // Pins and cards cover most of a phone screen: keep the attribution behind its info button.
    map.once('load', () => {
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    })
    map.on('error', () => {
      if (!styleLoaded) onFailure()
    })
    map.on('zoom', relayout)
    map.on('dragstart', () => {
      dragging.current = true
    })
    map.on('dragend', () => {
      window.setTimeout(() => {
        dragging.current = false
      }, 0)
    })
    // Remember where the user looked, so coming back from a restaurant reopens the same view.
    map.on('moveend', () => {
      if (!framed.current || showingDetail.current) return
      const c = map.getCenter()
      saveView(framed.current, { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() }, userRef.current)
    })
    mapRef.current = map
    framed.current = null
    restored.current = false
    const refs = hosts.current
    return () => {
      refs.forEach(({ marker }) => marker.remove())
      refs.clear()
      userMarker.current?.remove()
      userMarker.current = null
      map.off('webglcontextlost', onFailure)
      map.remove()
      mapRef.current = null
    }
  }, [onFailure, relayout])

  useMapLanguage(container)

  // One marker host per pin; React renders the pin into it through a portal.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const refs = hosts.current
    const ids = new Set(pins.map((p) => p.id))
    refs.forEach(({ marker }, id) => {
      if (!ids.has(id)) {
        marker.remove()
        refs.delete(id)
      }
    })
    for (const p of pins) {
      const existing = refs.get(p.id)
      if (existing) {
        existing.marker.setLngLat([p.lng, p.lat])
        continue
      }
      const el = document.createElement('div')
      el.className = 'pin-host'
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map)
      refs.set(p.id, { marker, el })
    }
    setHostEls(new Map([...refs].map(([id, h]) => [id, h.el])))
  }, [pins])

  useEffect(relayout, [relayout, pins, metric, activeId])

  // Stacking: value pins above dots, the active pin above everything.
  useEffect(() => {
    for (const p of pins) {
      const host = hosts.current.get(p.id)
      if (host) host.el.style.zIndex = p.id === activeId ? '1000' : p.dish ? String(900 - p.order) : '1'
    }
  }, [pins, activeId, hostEls])

  // Open on the last view of this tab, else on the start camera (camera.ts); frame again for a new Kiez or category,
  // or when a shared position moves "near" from central Berlin to the user. Nothing else moves the camera on its own.
  const focused = frameKey !== NEAR_FRAME
  const frame = focused ? `frame:${frameKey}` : `near:${user && inBerlin(user) ? 'user' : 'centre'}`
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const returning = showingDetail.current && !detailView
    if (returning) map.stop()
    showingDetail.current = detailView
    // A category without restaurants frames nothing; the next match frames again.
    if (pins.length === 0) {
      if (returning) framed.current = null
      else if (framed.current !== null && framed.current !== frame) framed.current = ''
      return
    }
    if (framed.current === frame && !returning) return
    const first = framed.current === null
    framed.current = frame
    const pad = padding()
    const saved = !detailView && (first || returning) ? readView(frame, userRef.current) : null
    restored.current = saved !== null && first
    const valued = pins.filter((p) => p.dish)
    const camera: Camera =
      saved ??
      startCamera({
        points: valued.length > 0 ? valued : pins,
        kiez: focused,
        user: userRef.current,
        size: { width: map.getContainer().clientWidth, height: map.getContainer().clientHeight },
        padding: pad,
      })
    const target = { center: [camera.center.lng, camera.center.lat] as [number, number], zoom: camera.zoom, padding: pad }
    if (first || returning) map.jumpTo(target)
    else map.easeTo({ ...target, duration: duration(MOTION.mapEaseMs) })
    // padding() reads the latest insets through a ref, so insets are not a dependency.
  }, [detailView, frame, focused, pins])

  // Bring the active pin into the free part of the map; not when the map just reopened on the view the user left.
  useEffect(() => {
    const map = mapRef.current
    if (restored.current) {
      restored.current = false
      return
    }
    if (!map || !activeId) return
    const pin = pinsRef.current.find((p) => p.id === activeId)
    if (!pin) return
    map.easeTo({
      center: [pin.lng, pin.lat],
      zoom: Math.max(map.getZoom(), 13),
      padding: padding(),
      duration: duration(MOTION.mapEaseMs),
    })
  }, [activeId, frameKey])

  // The user's dot.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!user) {
      userMarker.current?.remove()
      userMarker.current = null
      return
    }
    if (!userMarker.current) {
      const el = document.createElement('div')
      el.className = 'user-dot'
      el.setAttribute('role', 'img')
      userMarker.current = new Marker({ element: el, anchor: 'center' }).setLngLat([user.lng, user.lat]).addTo(map)
    } else {
      userMarker.current.setLngLat([user.lng, user.lat])
    }
    userMarker.current.getElement().setAttribute('aria-label', t('yourLocation'))
  }, [user, t])

  // Fly to the user after "In meiner Nähe".
  useEffect(() => {
    const map = mapRef.current
    const user = userRef.current
    if (!map || !user || locateNonce === 0) return
    map.easeTo({ center: [user.lng, user.lat], zoom: 14.5, padding: padding(), duration: duration(MOTION.mapEaseMs) })
  }, [locateNonce])

  const ignoreClick = () => dragging.current

  // Zoom in on a cluster just far enough that its restaurants stand apart, keeping all of them in view.
  // Restaurants at one address never split: then the tap selects the best of them, and the cards show the rest.
  const expand = (members: string[]) => {
    const map = mapRef.current
    if (!map) return
    const zoom = map.getZoom()
    const target = expansionZoom(pinsRef.current, members, zoom)
    const bounds = new LngLatBounds()
    for (const p of pinsRef.current) if (members.includes(p.id)) bounds.extend([p.lng, p.lat])
    const fit = map.cameraForBounds(bounds, { padding: padding() })
    const next = Math.min((target ?? zoom) + 0.15, fit?.zoom ?? Infinity, map.getMaxZoom())
    if (target === null || next <= zoom + 0.05) {
      onSelect(members[0])
      return
    }
    map.easeTo({ center: bounds.getCenter(), zoom: next, padding: padding(), duration: duration(MOTION.mapEaseMs) })
  }

  return (
    <div className="score-map" style={{ background: LAND }}>
      <div ref={container} className="score-map__canvas" role="region" aria-label={t('mapOfRestaurants')} />
      {pins.map((p) => {
        const el = hostEls.get(p.id)
        const slot = layout.get(p.id) ?? { kind: 'pin' }
        if (!el || slot.kind === 'hidden') return null
        return createPortal(
          slot.kind === 'cluster' ? (
            <Cluster categories={slot.members.map((id) => categories.get(id) ?? 'mixed')} onExpand={() => expand(slot.members)} ignoreClick={ignoreClick} />
          ) : (
            <Pin pin={p} metric={metric} active={p.id === activeId} onSelect={onSelect} onOpen={onOpen} ignoreClick={ignoreClick} />
          ),
          el,
          p.id,
        )
      })}
    </div>
  )
}
