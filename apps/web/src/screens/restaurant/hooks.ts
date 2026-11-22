// Hooks shared by the restaurant and dish screens.
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { ShareTarget } from '../../components/ShareSheet'
import { track } from '../../lib/analytics'
import { sharedUrl } from '../../lib/share'

/** Native share sheet where the browser has one, our share sheet otherwise. */
export function useShare(): [ShareTarget | null, (target: ShareTarget) => void, () => void] {
  const [target, setTarget] = useState<ShareTarget | null>(null)
  const share = (next: ShareTarget) => {
    track('share_tap')
    if (typeof navigator.share === 'function') {
      navigator.share({ title: next.title, text: next.text, url: sharedUrl(next.url, 'native') }).catch(() => undefined)
    } else {
      setTarget(next)
    }
  }
  return [target, share, () => setTarget(null)]
}

/** Shows the compact header title once the big title has scrolled under the header. */
export function useTitleShown(): [RefObject<HTMLHeadingElement | null>, boolean] {
  const ref = useRef<HTMLHeadingElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 80), {
      rootMargin: '-64px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, shown]
}
