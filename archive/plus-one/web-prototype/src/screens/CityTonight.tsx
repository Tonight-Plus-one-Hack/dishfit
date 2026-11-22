import { useEffect, useMemo, useState } from 'react'
import { cityImage } from '../assets/images'
import { AppFrame } from '../components/Chrome'
import { Glyph } from '../components/Glyph'
import { Icon } from '../components/Icon'
import { LazyMap } from '../components/LazyMap'
import { FadeIn, RevealText } from '../components/Reveal'
import { ShareSheet, type ShareTarget } from '../components/ShareSheet'
import { AvatarStack, SeatsTag, SpotImage } from '../components/ui'
import { VIBE_LABEL, hangoutTitle, spotPlace } from '../components/labels'
import { getCityTonight, getMe, listSpots, trackEvent } from '../data/api'
import { CITY_META, cityName } from '../data/cityMeta'
import type { City, HangoutSummary, MemberRole } from '../data/types'
import { BRAND } from '../lib/brand'
import { Link } from '../lib/router'
import { goUrl, PARTNERS } from '../lib/partners'
import { navigate, paths } from '../lib/routes'
import { useResource } from '../lib/resource'
import {
  DAY_PARTS,
  anchorTimes,
  capitalize,
  formatClock,
  formatTime,
  localHour,
  nightWord,
  weekday,
  zoneAbbreviation,
} from '../lib/time'
import './app.css'
import './city.css'

export function CityTonight({ slug }: { slug: string }) {
  const { city, hangouts, peopleTonight } = useResource(`city:${slug}`, () => getCityTonight(slug))
  const { spots } = useResource(`spots:${slug}`, () => listSpots(slug))
  const me = useResource('me', getMe)
  const [share, setShare] = useState<ShareTarget | null>(null)
  const meta = CITY_META[city.slug]
  const name = cityName(city)
  const word = nightWord(city.timezone)
  const roles = new Map<string, MemberRole>(me.memberships.map((m) => [m.hangoutId, m.role]))

  useEffect(() => trackEvent('city_view', { city: slug }), [slug])

  const groups = useMemo(
    () =>
      DAY_PARTS.map((part) => ({
        ...part,
        items: hangouts.filter((h) => part.test(localHour(h.startsAt, city.timezone))),
      })).filter((g) => g.items.length > 0),
    [hangouts, city.timezone],
  )

  const markers = useMemo(
    () =>
      hangouts.flatMap((h) => {
        const spot = spots.find((s) => s.id === h.spot.id)
        return spot ? [{ id: h.id, lat: spot.lat, lng: spot.lng, label: spot.name }] : []
      }),
    [hangouts, spots],
  )

  const shareCity = () =>
    setShare({
      title: `${capitalize(word)} in ${name}`,
      text:
        hangouts.length > 0
          ? `${hangouts.length} small groups are going out in ${name} ${word}. Come along on ${BRAND.name}:`
          : `Nobody has started a group in ${name} ${word} yet. Start one with me on ${BRAND.name}:`,
      url: `${BRAND.url}${paths.city(city.slug)}`,
      image: cityImage(meta?.image ?? ''),
      meta: `${peopleTonight} going · ${spots.length} spots`,
      city: city.slug,
    })

  return (
    <AppFrame
      action={
        <button className="btn btn--secondary" onClick={shareCity}>
          <Icon name="share" size={14} /> Share
        </button>
      }
    >
      <div className="band">
        <div className="rails page page--city">
          <section className="city-hero" aria-labelledby="city-title">
            <div className="city-hero__text">
              <Link to={paths.cities()} className="back-link">
                <Icon name="arrowLeft" size={14} /> All cities
              </Link>
              <img className="city-hero__icon" src={cityImage(meta?.image ?? '')} alt="" />
              <p className="city-hero__kicker">{capitalize(word)} in</p>
              <RevealText as="h1" id="city-title" className="t-hero city-hero__name" text={name} />
              <p className="t-label city-hero__clock">
                <Icon name="clock" size={14} /> {formatClock(city.timezone)} {zoneAbbreviation(city.timezone)} ·{' '}
                {weekday(city.timezone)}
              </p>
              <p className="city-hero__blurb">{meta?.blurb}</p>
              <div className="city-hero__stats">
                <span>
                  <strong>{hangouts.length}</strong> <span className="t-label">hangouts</span>
                </span>
                <span>
                  <strong>{peopleTonight}</strong> <span className="t-label">going</span>
                </span>
                <span>
                  <strong>{spots.length}</strong> <span className="t-label">spots</span>
                </span>
              </div>
              {hangouts.length > 0 && (
                <Link to={paths.create(city.slug)} className="btn btn--primary city-hero__start" data-testid="start-hangout">
                  <Icon name="plus" size={14} /> Start a hangout
                </Link>
              )}
            </div>
            <figure className="city-hero__media">
              <img src={cityImage(meta?.image ?? '')} alt={`${name} at blue hour`} />
            </figure>
          </section>

          <div className="city-body">
            <div className="city-main">
              <div className="tabs city-tabs" role="tablist" aria-label="View">
                <button role="tab" className="tabs__tab" aria-selected="true">
                  Hangouts · {hangouts.length}
                </button>
                <button role="tab" className="tabs__tab" aria-selected="false" onClick={() => navigate(paths.spots(city.slug))}>
                  Spots · {spots.length}
                </button>
              </div>

              {groups.length === 0 && <FirstGroup city={city} word={word} />}

              <ol className="timeline">
                {groups.map((group) => (
                  <li key={group.id} className="timeline__group">
                    <p className="timeline__head">
                      <span className="timeline__dot" aria-hidden="true" />
                      <span className="timeline__label">{group.label}</span>
                      <span className="t-muted">from {formatTime(group.items[0].startsAt, city.timezone)}</span>
                    </p>
                    <ul className="timeline__items">
                      {group.items.map((h, i) => (
                        <FadeIn as="li" key={h.id} delay={i * 50}>
                          <HangoutCard city={city} hangout={h} role={roles.get(h.id) ?? null} />
                        </FadeIn>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              {groups.length > 0 && (
                <Link to={paths.create(city.slug)} className="start-row">
                  <span className="icon-badge">
                    <Icon name="plus" size={18} />
                  </span>
                  <span className="start-row__text">
                    <span className="start-row__title">Nothing fits? Start your own</span>
                    <span className="t-muted start-row__body">Pick a spot and a time, then share the link. About 20 seconds.</span>
                  </span>
                  <Icon name="arrowRight" size={16} />
                </Link>
              )}
              {groups.length > 0 && (
                <p className="demo-flag city-demo">Demo plans and nicknames. Venues are real OpenStreetMap places.</p>
              )}
            </div>

            <aside className="city-side" aria-label={`${name} overview`}>
              <div className="side-card side-card--map">
                <LazyMap
                  center={{ lat: city.lat ?? spots[0]?.lat ?? 0, lng: city.lng ?? spots[0]?.lng ?? 0 }}
                  markers={markers}
                  interactive={false}
                  className="side-card__map"
                  label={`Map of ${word}’s hangouts in ${name}`}
                />
                <Link to={paths.spots(city.slug)} className="side-card__map-link">
                  <span>
                    <span className="side-card__title">All spots in {name}</span>
                    <span className="t-label">Bars, pubs, clubs, beer gardens</span>
                  </span>
                  <Icon name="arrowRight" size={16} />
                </Link>
              </div>
              <section className="side-card side-card--partners" aria-labelledby="stay-title">
                <span className="icon-badge">
                  <Icon name="globe" size={18} />
                </span>
                <h2 className="side-card__title" id="stay-title">
                  New here? Plan your stay
                </h2>
                <p className="t-muted side-card__body">Find a bed and a plan for {name}, then come back here for the evening.</p>
                <ul className="partners">
                  {PARTNERS.map((p) => (
                    <li key={p.brand}>
                      <a
                        className="partner"
                        href={goUrl(p.brand, { city: city.slug, from: 'city_page' })}
                        target="_blank"
                        rel="noopener"
                        data-testid={`go-${p.brand}`}
                      >
                        <span className="partner__text">
                          <span className="partner__name">{p.name}</span>
                          <span className="t-muted partner__line">{p.line}</span>
                        </span>
                        <Icon name="arrowUpRight" size={16} />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="t-label partners__note">Opens the partner’s site in a new tab</p>
              </section>
              <div className="side-card">
                <span className="icon-badge">
                  <Icon name="shieldCheck" size={18} />
                </span>
                <p className="side-card__title">Public spots, small groups</p>
                <p className="t-muted side-card__body">
                  Every hangout meets at a public venue with three to eight people. Leave whenever you want.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
      <ShareSheet target={share} onClose={() => setShare(null)} />
    </AppFrame>
  )
}

function FirstGroup({ city, word }: { city: City; word: 'today' | 'tonight' }) {
  const name = cityName(city)
  const anchors = anchorTimes(city.timezone)
  return (
    <section className="first-group" aria-labelledby="first-title">
      <span className="first-group__glyph">
        <Glyph name="group" size={44} />
      </span>
      <p className="t-label">No plans yet</p>
      <h2 className="t-feature first-group__title" id="first-title">
        Start the first group in {name} {word}
      </h2>
      <p className="t-muted first-group__body">
        Pick a spot and a time and you get a link to share. The group is on once three people are in. It takes about 20
        seconds.
      </p>
      {anchors.length > 0 && (
        <>
          <p className="t-label first-group__label">Good times to start</p>
          <ul className="first-group__times">
            {anchors.map((a) => (
              <li key={a.at}>
                <Link to={paths.create(city.slug, { time: a.at })} className="time-chip" data-testid={`start-at-${a.at}`}>
                  <span className="time-chip__at">{a.at}</span>
                  <span className="t-label">{a.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={paths.create(city.slug)} className="btn btn--primary btn--wide first-group__cta" data-testid="start-first">
        <Icon name="plus" size={14} /> Start the first group
      </Link>
    </section>
  )
}

function HangoutCard({ city, hangout, role }: { city: City; hangout: HangoutSummary; role: MemberRole | null }) {
  const place = spotPlace(hangout.spot)
  return (
    <Link to={paths.hangout(hangout.id)} className="hcard" data-testid="hangout-card">
      <span className="hcard__text">
        <span className="hcard__top">
          <span className="hcard__time">{formatTime(hangout.startsAt, city.timezone)}</span>
          <span className="t-label">{VIBE_LABEL[hangout.vibe]}</span>
        </span>
        <span className="hcard__title">{hangoutTitle(hangout, hangout.spot.name)}</span>
        <span className="hcard__place">
          <Icon name="pin" size={14} />
          <span>
            {hangout.spot.name}
            {place ? ` · ${place}` : ''}
          </span>
        </span>
        <span className="hcard__foot">
          <AvatarStack people={hangout.memberPreview ?? []} total={hangout.memberCount} max={4} size={24} decorative />
          <span className="hcard__going">{hangout.memberCount} going</span>
          <SeatsTag memberCount={hangout.memberCount} spotsLeft={hangout.spotsLeft} role={role} />
        </span>
      </span>
      <SpotImage spot={hangout.spot} className="hcard__thumb" />
    </Link>
  )
}
