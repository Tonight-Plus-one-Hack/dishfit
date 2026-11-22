// A small map with a fixed pin in the middle: the guest moves the map until the pin sits on the restaurant.
// OpenFreeMap vector tiles (no key), like the main map. Loaded lazily with the snap flow's restaurant step.
import { useMapLanguage } from '../../lib/map-language'
import { useTranslation } from '../../i18n'
import { Map as MlMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef } from 'react'
import { Icon } from '../../components/Icon'
import type { LatLng } from '../../data/contract'
import { hasWebGL2 } from '../../lib/webgl'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
setWorkerUrl(workerUrl)

export interface PinMapProps {
  /** Where the map starts, and where it jumps when this value changes (e.g. after "Meinen Standort verwenden"). */
  center: LatLng
  onMove: (position: LatLng) => void
}

export default function PinMap({ center, onMove }: PinMapProps) {
  const t = useTranslation()
  const { lat, lng } = center
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const onMoveRef = useRef(onMove)
  const initial = useRef(center)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  useEffect(() => {
    if (!container.current || !hasWebGL2()) return
    const instance = new MlMap({
      container: container.current,
      style: STYLE_URL,
      center: [initial.current.lng, initial.current.lat],
      zoom: 16,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    instance.touchZoomRotate?.disableRotation()
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    instance.on('moveend', (event) => {
      if (!event.originalEvent) return
      const c = instance.getCenter()
      if (Math.abs(c.lat - initial.current.lat) < 1e-6 && Math.abs(c.lng - initial.current.lng) < 1e-6) return
      onMoveRef.current({ lat: Math.round(c.lat * 1e6) / 1e6, lng: Math.round(c.lng * 1e6) / 1e6 })
    })
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
    }
  }, [])

  useMapLanguage(container)

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const c = instance.getCenter()
    initial.current = { lat, lng }
    if (Math.abs(c.lat - lat) < 1e-6 && Math.abs(c.lng - lng) < 1e-6) return
    instance.jumpTo({ center: [lng, lat], zoom: Math.max(instance.getZoom(), 16) })
  }, [lat, lng])

  return (
    <div className="pin-map">
      <div ref={container} className="pin-map__canvas" role="region" aria-label={t('mapMoveThePinToThe')} />
      <span className="pin-map__pin" aria-hidden="true">
        <Icon name="pin" size={34} strokeWidth={1.6} />
      </span>
    </div>
  )
}
