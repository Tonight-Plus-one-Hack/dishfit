import { useEffect, type RefObject } from 'react'
import { useTranslation, type MessageKey } from '../i18n'

const labels: ReadonlyArray<[string, MessageKey]> = [
  ['.maplibregl-canvas', 'map'],
  ['.maplibregl-ctrl-zoom-in', 'mapZoomIn'],
  ['.maplibregl-ctrl-zoom-out', 'mapZoomOut'],
  ['.maplibregl-ctrl-attrib-button', 'mapAttribution'],
]

/** MapLibre creates these controls imperatively. Update them without rebuilding the map or resetting its camera. */
export function useMapLanguage(container: RefObject<HTMLDivElement | null>, interactive = true) {
  const t = useTranslation()
  useEffect(() => {
    for (const [selector, key] of labels) {
      const control = container.current?.querySelector(selector)
      if (!control) continue
      const label = t(key)
      control.setAttribute('aria-label', label)
      if (control.hasAttribute('title')) control.setAttribute('title', label)
    }
  }, [container, interactive, t])
}
