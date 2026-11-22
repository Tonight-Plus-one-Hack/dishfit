// MapLibre GL with OpenFreeMap's Positron style: free vector tiles, no key, attribution rendered by the map.
// Loaded lazily (see LazyMap.tsx) so the landing page never pays for the map bundle.
import { LngLatBounds, Map as MlMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 locates its worker next to its own module, which bundlers move; hand it a bundled worker instead.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'
import { MOTION, prefersReducedMotion } from '../lib/motion'
import './map.css'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  label: string
}

export interface MapViewProps {
  center: { lat: number; lng: number }
  zoom?: number
  markers: MapMarker[]
  activeId?: string | null
  onSelect?: (id: string) => void
  interactive?: boolean
  fit?: boolean
  className?: string
  label?: string
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
setWorkerUrl(workerUrl)
const CITY_LABEL_LAYERS = ['label_city', 'label_city_capital']

export default function MapView({
  center,
  zoom = 12.5,
  markers,
  activeId = null,
  onSelect,
  interactive = true,
  fit = true,
  className,
  label = 'Map',
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const markerRefs = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>())
  const initialView = useRef({ center, zoom })
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Create the map once per mount.
  useEffect(() => {
    if (!container.current) return
    const instance = new MlMap({
      container: container.current,
      style: STYLE_URL,
      center: [initialView.current.center.lng, initialView.current.center.lat],
      zoom: initialView.current.zoom,
      interactive,
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
    })
    instance.touchZoomRotate?.disableRotation()
    // The page already names the city; its map label would only sit on top of the pins.
    instance.on('style.load', () => {
      for (const id of CITY_LABEL_LAYERS) {
        if (instance.getLayer(id)) instance.setLayoutProperty(id, 'visibility', 'none')
      }
    })
    if (!interactive) {
      // Small preview maps keep the attribution behind its info button.
      instance.once('load', () => {
        container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      })
    }
    if (interactive) instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.current = instance
    const refs = markerRefs.current
    return () => {
      refs.forEach(({ marker }) => marker.remove())
      refs.clear()
      instance.remove()
      map.current = null
    }
  }, [interactive])

  // Sync markers.
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const refs = markerRefs.current
    const ids = new Set(markers.map((m) => m.id))
    refs.forEach(({ marker }, id) => {
      if (!ids.has(id)) {
        marker.remove()
        refs.delete(id)
      }
    })
    markers.forEach((m) => {
      if (refs.has(m.id)) return
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'map-pin'
      el.setAttribute('aria-label', m.label)
      el.innerHTML = `<span class="map-pin__dot"></span><span class="map-pin__label"></span>`
      el.querySelector('.map-pin__label')!.textContent = m.label
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectRef.current?.(m.id)
      })
      if (!interactive) el.tabIndex = -1
      const marker = new Marker({ element: el, anchor: 'center' }).setLngLat([m.lng, m.lat]).addTo(instance)
      refs.set(m.id, { marker, el })
    })
    if (fit && markers.length > 1) {
      const bounds = new LngLatBounds()
      markers.forEach((m) => bounds.extend([m.lng, m.lat]))
      instance.fitBounds(bounds, { padding: 48, maxZoom: 14.5, duration: 0 })
    }
  }, [markers, fit, interactive])

  // Highlight and reveal the active marker.
  useEffect(() => {
    const instance = map.current
    markerRefs.current.forEach(({ el, marker }, id) => {
      const active = id === activeId
      el.classList.toggle('is-active', active)
      marker.getElement().style.zIndex = active ? '2' : '1'
    })
    if (!instance || !activeId) return
    const target = markers.find((m) => m.id === activeId)
    if (!target) return
    instance.easeTo({
      center: [target.lng, target.lat],
      zoom: Math.max(instance.getZoom(), 14),
      duration: prefersReducedMotion() ? 0 : MOTION.mapEaseMs,
    })
  }, [activeId, markers])

  return <div ref={container} className={`map ${className ?? ''}`} role="region" aria-label={label} />
}
