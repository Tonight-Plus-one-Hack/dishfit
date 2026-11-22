// Live Google content for one restaurant: photos, ratings, reviews, price level and Google opening hours,
// rendered by the Places UI Kit (<gmp-place-details>) and keyed by placeId. Nothing from it is stored.
// It needs an enabled Places integration, a browser key and a matched placeId.
import { useEffect, useRef, useState } from 'react'
import type { Restaurant } from '../../data/contract'
import { useTranslation } from '../../i18n'
import { hasLivePlace, loadPlacesKit } from '../../lib/google-places'

/** Builds <gmp-place-details> with the content we show and Google's attribution. */
function placeDetails(placeId: string): HTMLElement {
  const details = document.createElement('gmp-place-details')
  const request = document.createElement('gmp-place-details-place-request')
  request.setAttribute('place', placeId)
  const media = document.createElement('gmp-place-media')
  media.setAttribute('lightbox-preferred', '')
  const attribution = document.createElement('gmp-place-attribution')
  attribution.setAttribute('light-scheme-color', 'gray')
  // Content elements go straight into the element; gmp-place-content-config is deprecated.
  details.append(
    request,
    media,
    document.createElement('gmp-place-rating'),
    document.createElement('gmp-place-price'),
    document.createElement('gmp-place-opening-hours'),
    document.createElement('gmp-place-reviews'),
    attribution,
  )
  return details
}

function LivePlace({ placeId }: { placeId: string }) {
  const t = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const el = host.current
    if (!el) return
    loadPlacesKit().then(
      () => {
        if (cancelled) return
        const details = placeDetails(placeId)
        details.addEventListener('gmp-load', () => setState('ready'))
        details.addEventListener('gmp-error', () => setState('error'))
        el.replaceChildren(details)
      },
      () => !cancelled && setState('error'),
    )
    return () => {
      cancelled = true
      el.replaceChildren()
    }
  }, [placeId])

  if (state === 'error') return null
  return (
    <section className="gplace" aria-labelledby="gplace-title">
      <div className="gplace__head">
        <h2 id="gplace-title" className="detail-title">{t('photosAndReviews')}</h2>
        <span className="t-label">{t('liveFromGoogle')}</span>
      </div>
      <div className="gplace__live" aria-busy={state === 'loading'}>
        {state === 'loading' && <div className="skeleton gplace__loading" />}
        <div ref={host} />
      </div>
    </section>
  )
}

export function GooglePlaceBlock({ restaurant }: { restaurant: Pick<Restaurant, 'placeId' | 'isTestData'> }) {
  if (!restaurant.placeId || !hasLivePlace(restaurant)) return null
  return <LivePlace key={restaurant.placeId} placeId={restaurant.placeId} />
}
