import { useState } from 'react'
import { cityImage } from '../assets/images'
import { AppFrame } from '../components/Chrome'
import { Icon } from '../components/Icon'
import { FadeIn, RevealText } from '../components/Reveal'
import { AvatarStack, SeatsTag, SpotImage } from '../components/ui'
import { VIBE_LABEL, hangoutTitle, spotPlace } from '../components/labels'
import { getMe, listCities, listPopularHangouts } from '../data/api'
import { CITY_META, cityName, type CityMeta } from '../data/cityMeta'
import type { City, HangoutSummary, MemberRole, Vibe } from '../data/types'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { useResource } from '../lib/resource'
import { formatTime, nightWord } from '../lib/time'
import './app.css'

type Region = CityMeta['region']
const VIBES: Array<Vibe | 'all'> = ['all', 'chill', 'bar', 'club', 'culture']
const REGIONS: Array<{ id: Region | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'germany', label: 'Germany' },
  { id: 'europe', label: 'Europe' },
]

export function Cities() {
  const { cities } = useResource('cities', listCities)
  const popular = useResource('popular', () => listPopularHangouts(12))
  const me = useResource('me', getMe)
  const [vibe, setVibe] = useState<Vibe | 'all'>('all')
  const [region, setRegion] = useState<Region | 'all'>('all')
  const shown = popular.filter((d) => vibe === 'all' || d.hangout.vibe === vibe).slice(0, 6)
  const regionCities = cities.filter((c) => region === 'all' || CITY_META[c.slug]?.region === region)
  const roles = new Map(me.memberships.map((m) => [m.hangoutId, m.role]))
  const word = nightWord(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const active = cities.filter((c) => c.openHangouts > 0).length

  return (
    <AppFrame>
      <div className="band">
        <div className="rails page">
          <header className="page-head page-head--center">
            <p className="t-label">Discover</p>
            <RevealText as="h1" className="t-hero" text="Choose your city" />
            <FadeIn as="p" className="t-lede page-head__lede" delay={200}>
              Small groups are meeting {word} in {active} {active === 1 ? 'city' : 'cities'}. Pick yours to see who is going
              out and where, or start the first plan.
            </FadeIn>
          </header>

          <section className="page-section" aria-labelledby="popular-title">
            <div className="section-row">
              <div>
                <h2 className="t-card" id="popular-title">
                  Popular {word}
                </h2>
                <p className="t-muted section-row__sub">Filling up across all cities</p>
              </div>
              <Link to={paths.city('berlin')} className="btn btn--secondary section-row__action">
                Berlin {word} <Icon name="arrowRight" size={14} />
              </Link>
            </div>
            <div className="chips" role="toolbar" aria-label="Filter by vibe">
              {VIBES.map((v) => (
                <button key={v} className="chip" aria-pressed={vibe === v} onClick={() => setVibe(v)}>
                  {v === 'all' ? 'Everything' : VIBE_LABEL[v]}
                </button>
              ))}
            </div>
            {shown.length > 0 ? (
              <ul className="popular-grid">
                {shown.map((d, i) => (
                  <FadeIn as="li" key={d.hangout.id} delay={i * 40}>
                    <PopularRow city={d.city} hangout={d.hangout} role={roles.get(d.hangout.id) ?? null} />
                  </FadeIn>
                ))}
              </ul>
            ) : (
              <p className="empty-inline">No open plans with that vibe right now. Try another one.</p>
            )}
          </section>

          <section className="page-section" aria-labelledby="cities-title">
            <div className="section-row">
              <h2 className="t-card" id="cities-title">
                Cities
              </h2>
            </div>
            <div className="tabs" role="tablist" aria-label="Region">
              {REGIONS.map((r) => (
                <button
                  key={r.id}
                  role="tab"
                  className="tabs__tab"
                  aria-selected={region === r.id}
                  onClick={() => setRegion(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <ul className="city-grid">
              {regionCities.map((c, i) => (
                <FadeIn as="li" key={c.slug} delay={i * 30}>
                  <Link to={paths.city(c.slug)} className="city-tile">
                    <img className="city-tile__icon" src={cityImage(CITY_META[c.slug]?.image ?? '')} alt="" loading="lazy" />
                    <span className="city-tile__text">
                      <span className="city-tile__name">{cityName(c)}</span>
                      <span className="t-label">
                        {c.openHangouts === 0
                          ? 'No plans yet, start one'
                          : `${c.openHangouts} ${c.openHangouts === 1 ? 'hangout' : 'hangouts'} ${word}`}
                      </span>
                    </span>
                  </Link>
                </FadeIn>
              ))}
            </ul>
          </section>

          <p className="page-foot t-label">
            Hangouts and people are demo data. Spots © OpenStreetMap contributors.
          </p>
        </div>
      </div>
    </AppFrame>
  )
}

function PopularRow({ city, hangout, role }: { city: City; hangout: HangoutSummary; role: MemberRole | null }) {
  return (
    <Link to={paths.hangout(hangout.id)} className="popular-row">
      <SpotImage spot={hangout.spot} className="popular-row__thumb" />
      <span className="popular-row__text">
        <span className="t-label">
          {formatTime(hangout.startsAt, city.timezone)} · {cityName(city)}
        </span>
        <span className="popular-row__title">{hangoutTitle(hangout, hangout.spot.name)}</span>
        <span className="popular-row__meta">
          <AvatarStack people={hangout.memberPreview ?? []} total={hangout.memberCount} max={3} size={20} />
          <span className="t-muted">
            {hangout.spot.name}
            {spotPlace(hangout.spot) ? `, ${spotPlace(hangout.spot)}` : ''}
          </span>
        </span>
      </span>
      <span className="popular-row__seats">
        <SeatsTag memberCount={hangout.memberCount} spotsLeft={hangout.spotsLeft} role={role} />
      </span>
    </Link>
  )
}
