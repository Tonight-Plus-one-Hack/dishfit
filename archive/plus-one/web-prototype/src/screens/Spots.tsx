import { useMemo, useRef, useState } from 'react'
import { AppFrame } from '../components/Chrome'
import { Icon } from '../components/Icon'
import { LazyMap } from '../components/LazyMap'
import { ShareSheet, type ShareTarget } from '../components/ShareSheet'
import { SpotImage } from '../components/ui'
import { KIND_LABEL, spotPlace } from '../components/labels'
import { listSpots } from '../data/api'
import { cityName } from '../data/cityMeta'
import type { Spot, SpotKind } from '../data/types'
import { KIND_IMAGES } from '../assets/images'
import { BRAND } from '../lib/brand'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { prefersReducedMotion } from '../lib/motion'
import { useResource } from '../lib/resource'
import { capitalize, nightWord } from '../lib/time'
import { toggleSaved, useSession } from '../lib/session'
import './app.css'
import './spots.css'

type Filter = 'all' | SpotKind | 'saved'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'bar', label: 'Bars' },
  { id: 'pub', label: 'Pubs' },
  { id: 'nightclub', label: 'Clubs' },
  { id: 'biergarten', label: 'Beer gardens' },
  { id: 'saved', label: 'Saved' },
]

export function Spots({ slug }: { slug: string }) {
  const { city, spots } = useResource(`spots:${slug}`, () => listSpots(slug))
  const name = cityName(city)
  const { saved } = useSession()
  const [filter, setFilter] = useState<Filter>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [share, setShare] = useState<ShareTarget | null>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: spots.length, saved: spots.filter((s) => saved.includes(s.id)).length }
    spots.forEach((s) => (c[s.kind] = (c[s.kind] ?? 0) + 1))
    return c
  }, [spots, saved])

  const shown = useMemo(
    () =>
      spots.filter((s) => (filter === 'all' ? true : filter === 'saved' ? saved.includes(s.id) : s.kind === filter)),
    [spots, filter, saved],
  )

  const markers = useMemo(() => shown.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: s.name })), [shown])

  const selectFromMap = (id: string) => {
    setActiveId(id)
    const el = cardRefs.current.get(id)
    if (!el) return
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' })
  }

  const shareSpot = (spot: Spot) =>
    setShare({
      title: spot.name,
      text: `${spot.name}, ${KIND_LABEL[spot.kind].toLowerCase()} in ${spotPlace(spot) || name}. Meet a small group there ${nightWord(city.timezone)} on ${BRAND.name}:`,
      url: `${BRAND.url}${paths.spots(city.slug)}`,
      image: KIND_IMAGES[spot.kind],
      meta: `${KIND_LABEL[spot.kind]} · ${spotPlace(spot) || name}`,
      city: city.slug,
    })

  return (
    <AppFrame
      action={
        <Link to={paths.city(city.slug)} className="btn btn--secondary">
          {capitalize(nightWord(city.timezone))}’s plans
        </Link>
      }
    >
      <div className="spots">
        <div className="spots__map">
          <LazyMap
            center={{ lat: city.lat ?? spots[0]?.lat ?? 0, lng: city.lng ?? spots[0]?.lng ?? 0 }}
            markers={markers}
            activeId={activeId}
            onSelect={selectFromMap}
            label={`Map of spots in ${name}`}
          />
        </div>

        <div className="spots__list">
          <header className="spots__head">
            <Link to={paths.city(city.slug)} className="back-link">
              <Icon name="arrowLeft" size={14} /> {capitalize(nightWord(city.timezone))} in {name}
            </Link>
            <h1 className="t-section">Spots in {name}</h1>
            <p className="t-muted spots__lede">
              Public places where hangouts meet. Curated from OpenStreetMap, no paid placements and no star ratings.
            </p>
          </header>

          <div className="chips spots__chips" role="toolbar" aria-label="Filter spots">
            {FILTERS.map((f) => (
              <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.id === 'saved' && <Icon name="heart" size={12} filled={filter === 'saved'} />}
                {f.label}
                <span className="chip__count">{counts[f.id] ?? 0}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="empty-inline">
              {filter === 'saved' ? 'Tap the heart on a spot to keep it here.' : 'No spots in this category yet.'}
            </p>
          ) : (
            <ul className="spot-list">
              {shown.map((spot) => {
                const isSaved = saved.includes(spot.id)
                return (
                  <li
                    key={spot.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(spot.id, el)
                      else cardRefs.current.delete(spot.id)
                    }}
                  >
                    <article
                      className={`spot-card ${activeId === spot.id ? 'is-active' : ''}`}
                      onMouseEnter={() => setActiveId(spot.id)}
                    >
                      <button
                        className="spot-card__hit"
                        onClick={() => setActiveId(spot.id)}
                        aria-label={`Show ${spot.name} on the map`}
                      />
                      <div className="spot-card__media">
                        <SpotImage spot={spot} className="spot-card__image" />
                        <button
                          className={`spot-card__save ${isSaved ? 'is-saved' : ''}`}
                          aria-pressed={isSaved}
                          aria-label={isSaved ? `Remove ${spot.name} from saved` : `Save ${spot.name}`}
                          onClick={() => toggleSaved(spot.id)}
                        >
                          <Icon name="heart" size={18} filled={isSaved} />
                        </button>
                      </div>
                      <div className="spot-card__body">
                        <div className="spot-card__row">
                          <h2 className="spot-card__name">{spot.name}</h2>
                          <button className="spot-card__share" onClick={() => shareSpot(spot)} aria-label={`Share ${spot.name}`}>
                            <Icon name="share" size={16} />
                          </button>
                        </div>
                        <p className="t-label spot-card__meta">
                          {KIND_LABEL[spot.kind]}
                          {spotPlace(spot) ? ` · ${spotPlace(spot)}` : ''}
                        </p>
                        {spot.descriptionEn && <p className="t-muted spot-card__desc">{spot.descriptionEn}</p>}
                        {spot.openingHours && (
                          <p className="spot-card__hours">
                            <Icon name="clock" size={14} /> <span>{spot.openingHours}</span>
                          </p>
                        )}
                        <Link
                          to={paths.create(city.slug, { spot: spot.id })}
                          className="btn btn--secondary spot-card__start"
                          data-testid="start-here"
                        >
                          <Icon name="plus" size={14} /> Start a hangout here
                        </Link>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="t-label spots__attrib">
            Venue data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap contributors
            </a>
            , ODbL. Opening hours may change.
          </p>
        </div>
      </div>
      <ShareSheet target={share} onClose={() => setShare(null)} />
    </AppFrame>
  )
}
