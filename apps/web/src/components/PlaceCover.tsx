import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loadPlacesKit, placeDetailsCompact } from '../lib/google-places'
import './place-cover.css'

export function PlaceCover({ placeId, fallback, paused = false, onPhoto }: { placeId: string; fallback?: ReactNode; paused?: boolean; onPhoto?: (shown: boolean) => void }) {
  const box = useRef<HTMLSpanElement>(null)
  const host = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [photoPlace, setPhotoPlace] = useState<string | null>(null)
  const showPhoto = photoPlace === placeId

  useEffect(() => {
    onPhoto?.(showPhoto)
  }, [showPhoto, onPhoto])

  // Each widget makes a Places request. Load only covers that are on screen.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const el = host.current
    if (!visible || paused || !el) return
    let cancelled = false
    loadPlacesKit().then(
      () => {
        if (cancelled) return
        const details = placeDetailsCompact(placeId)
        details.addEventListener('gmp-load', () => {
          if (!cancelled) setPhotoPlace(placeId)
        })
        details.addEventListener('gmp-error', () => {
          if (!cancelled) setPhotoPlace(null)
        })
        el.replaceChildren(details)
      },
      () => { if (!cancelled) setPhotoPlace(null) },
    )
    return () => {
      cancelled = true
      el.replaceChildren()
      setPhotoPlace(null)
    }
  }, [visible, paused, placeId])

  return (
    <span ref={box} className="place-cover">
      {!showPhoto && fallback && <span className="place-cover__fallback">{fallback}</span>}
      <span ref={host} className="place-cover__live" data-visible={showPhoto} inert={!showPhoto} />
    </span>
  )
}
