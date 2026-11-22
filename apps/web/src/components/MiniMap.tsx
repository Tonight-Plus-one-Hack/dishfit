// A small, still map around one restaurant: our own pin from our coordinates, neighbouring restaurants from our
// data as orange category dots. Loaded lazily (MapLibre). No Google Places content goes on this map.
import { useTranslation } from '../i18n'
import { AttributionControl, Map as MlMap, Marker, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { LatLng } from '../data/contract'
import type { Category } from '../lib/category'
import { applyWarmStyle, STYLE_URL } from '../screens/map/warm-style'
import { Glyph } from './glyphs/Glyph'
import './mini-map.css'
import { hasWebGL2 } from '../lib/webgl'

setWorkerUrl(workerUrl)

export interface MiniMapPlace extends LatLng {
  id: string
  name: string
  category: Category
}

export interface MiniMapProps {
  place: MiniMapPlace
  neighbours: MiniMapPlace[]
  onOpen: (id: string) => void
  /** Pixels covered at the bottom (the distance bar); the pin stays centred in the free part. */
  bottomInset?: number
  routeBar: RefObject<HTMLDivElement | null>
}

const LABEL_GAP = 6
const EDGE_PADDING = 10

function overlaps(a: DOMRectReadOnly, b: DOMRectReadOnly): boolean {
  const gap = 3
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap
}

export default function MiniMap({ place, neighbours, onOpen, bottomInset = 0, routeBar }: MiniMapProps) {
  const t = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap>(null)
  const [hosts, setHosts] = useState<Array<{ place: MiniMapPlace; self: boolean; el: HTMLDivElement }>>([])

  // One still map per place; markers go on once the style has loaded.
  useEffect(() => {
    if (!container.current || !hasWebGL2()) return
    const m = new MlMap({
      container: container.current,
      style: STYLE_URL,
      center: [place.lng, place.lat],
      zoom: 15.2,
      interactive: false,
      attributionControl: false,
    })
    map.current = m
    m.setPadding({ top: 0, left: 0, right: 0, bottom: bottomInset })
    m.jumpTo({ center: [place.lng, place.lat] })
    m.addControl(new AttributionControl({ compact: true }), 'top-right')
    m.on('style.load', () => applyWarmStyle(m))
    const markers: Marker[] = []
    m.once('load', () => {
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      const all = [{ place, self: true }, ...neighbours.filter((n) => n.id !== place.id).map((p) => ({ place: p, self: false }))]
      const made = all.map(({ place: p, self }) => {
        const el = document.createElement('div')
        el.style.zIndex = self ? '2' : '1'
        markers.push(new Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(m))
        return { place: p, self, el }
      })
      setHosts(made)
    })
    return () => {
      map.current = null
      markers.forEach((marker) => marker.remove())
      m.remove()
      setHosts([])
    }
  }, [place, neighbours, bottomInset])

  useLayoutEffect(() => {
    const element = container.current
    const instance = map.current
    if (!element || !instance || !hosts.length) return
    const overlays = [routeBar.current, element.querySelector('.maplibregl-ctrl-attrib')].filter((el) => el !== null)
    const names = hosts.flatMap(({ el }) => {
      const pin = el.querySelector<HTMLButtonElement>('.mini-poi')
      const label = pin?.querySelector<HTMLSpanElement>('.mini-poi__name')
      return pin && label ? [{ pin, label }] : []
    })

    const placeLabels = () => {
      const bounds = element.getBoundingClientRect()
      const controls = overlays.map((el) => el.getBoundingClientRect())
      const occupied = [...hosts.map(({ el }) => el.getBoundingClientRect()), ...controls]
      for (const { pin, label } of names) {
        const anchor = pin.getBoundingClientRect()
        const centerX = anchor.left + anchor.width / 2
        const centerY = anchor.top + anchor.height / 2
        const width = label.offsetWidth
        const height = label.offsetHeight
        const candidates = [
          { x: anchor.right + LABEL_GAP, y: centerY - height / 2 },
          { x: anchor.left - LABEL_GAP - width, y: centerY - height / 2 },
          { x: centerX - width / 2, y: anchor.top - LABEL_GAP - height },
          { x: centerX - width / 2, y: anchor.bottom + LABEL_GAP },
        ]
        const box = candidates.map((rect) => DOMRectReadOnly.fromRect({ ...rect, width, height })).find(
          (rect) =>
            rect.left >= bounds.left + EDGE_PADDING && rect.right <= bounds.right - EDGE_PADDING &&
            rect.top >= bounds.top + EDGE_PADDING && rect.bottom <= bounds.bottom - EDGE_PADDING &&
            !occupied.some((other) => overlaps(rect, other)),
        )
        if (box) {
          label.style.left = `${box.left - anchor.left}px`
          label.style.top = `${box.top - anchor.top}px`
          label.style.visibility = 'visible'
          occupied.push(box)
        } else {
          label.style.visibility = 'hidden'
        }
      }
    }

    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(placeLabels)
    }
    // MapLibre repositions the markers on move. The observer also catches a late font or a resized route bar.
    const observer = new ResizeObserver(schedule)
    for (const target of [element, ...overlays, ...names.map(({ label }) => label)]) observer.observe(target)
    instance.on('move', schedule)
    placeLabels()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      instance.off('move', schedule)
    }
  }, [hosts, routeBar])

  return (
    <div className="mini-map">
      <div ref={container} className="mini-map__canvas" />
      {hosts.map(({ place: p, self, el }) =>
        createPortal(
          self ? (
            <span className="mini-pin" role="img" aria-label={t('count1Here', p.name)}>
              <span className="mini-pin__halo" />
              <span className="mini-pin__dot">
                <Glyph name="pin" size={22} />
              </span>
            </span>
          ) : (
            <button type="button" className="mini-poi" aria-label={p.name} onClick={() => onOpen(p.id)}>
              <span className="mini-poi__dot">
                <Glyph name={`cat-${p.category}`} size={18} />
              </span>
              <span className="mini-poi__name" aria-hidden="true">{p.name}</span>
            </button>
          ),
          el,
          p.id,
        ),
      )}
    </div>
  )
}
