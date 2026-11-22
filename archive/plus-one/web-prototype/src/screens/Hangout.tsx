import { useEffect, useMemo, useState } from 'react'
import { KIND_IMAGES } from '../assets/images'
import { Chat } from '../components/Chat'
import { AppFrame } from '../components/Chrome'
import { Icon } from '../components/Icon'
import { LazyMap } from '../components/LazyMap'
import { FadeIn, RevealText } from '../components/Reveal'
import { ReportDialog, type ReportSubject } from '../components/ReportDialog'
import { ShareSheet, type ShareTarget } from '../components/ShareSheet'
import { Avatar, AvatarStack, Meter, SeatsTag, SpotImage } from '../components/ui'
import { KIND_LABEL, LANGUAGE_LABEL, VIBE_LABEL, hangoutTitle, spotPlace } from '../components/labels'
import { getCityTonight, getHangout, postMessage, trackEvent } from '../data/api'
import { cityName } from '../data/cityMeta'
import { isDemoHangout } from '../data/hangouts'
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE } from '../data/types'
import { SAFETY_HINTS } from '../data/safety'
import { BRAND } from '../lib/brand'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { refresh, useResource } from '../lib/resource'
import { capitalize, dayOfMonth, formatTime, nightWord, startWord, weekday } from '../lib/time'
import './app.css'
import './hangout.css'

export function HangoutPage({ id }: { id: string }) {
  const { hangout, spot, members, viewerMemberId } = useResource(`hangout:${id}`, () => getHangout(id))
  const { city } = useResource(`city:${hangout.citySlug}`, () => getCityTonight(hangout.citySlug))
  const [share, setShare] = useState<ShareTarget | null>(null)
  const [report, setReport] = useState<ReportSubject | null>(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const me = members.find((m) => m.id === viewerMemberId) ?? null
  const hosting = me?.role === 'host'
  const others = members.filter((m) => m.id !== viewerMemberId)
  const going = members.length
  const left = Math.max(0, hangout.maxSize - going)
  const isFull = !me && left === 0
  const title = hangoutTitle(hangout, spot.name)
  const name = cityName(city)
  const needed = Math.max(0, MIN_GROUP_SIZE - going)
  const time = formatTime(hangout.startsAt, city.timezone)
  const when = startWord(hangout.startsAt, city.timezone)

  useEffect(() => trackEvent('hangout_view', { city: hangout.citySlug, hangout: hangout.id }), [hangout.citySlug, hangout.id])

  const checkIn = async () => {
    setCheckingIn(true)
    try {
      await postMessage(hangout.id, { kind: 'arrived' })
      await refresh()
    } finally {
      setCheckingIn(false)
    }
  }

  const place = spotPlace(spot)
  const markers = useMemo(() => [{ id: spot.id, lat: spot.lat, lng: spot.lng, label: spot.name }], [spot])

  const openShare = () =>
    setShare({
      title,
      text: hosting
        ? `I’m starting a small group at ${spot.name}, ${when} at ${time}. ${needed > 0 ? `${needed} more and it’s on.` : 'Seats are still open.'} Want to come?`
        : me
          ? `I’m going to “${title}” at ${spot.name}, ${time} ${when}. Join us on ${BRAND.name}:`
          : `“${title}” at ${spot.name}, ${time} ${when} in ${name}.`,
      url: `${BRAND.url}${paths.hangout(hangout.id)}`,
      image: KIND_IMAGES[spot.kind],
      meta: `${time} · ${spot.name}`,
      city: hangout.citySlug,
      hangout: hangout.id,
    })

  return (
    <AppFrame
      action={
        <button className="btn btn--secondary" onClick={openShare}>
          <Icon name="share" size={14} /> Share
        </button>
      }
    >
      <div className="band">
        <div className="rails page page--hangout">
          <div className="hangout">
            <div className="hangout__crumbs">
              <Link to={paths.city(city.slug)} className="back-link">
                <Icon name="arrowLeft" size={14} /> {capitalize(nightWord(city.timezone))} in {name}
              </Link>
            </div>

            <div className="hangout__media">
              <SpotImage spot={spot} className="hangout__image" />
              <span className="hangout__media-tag t-label">{KIND_LABEL[spot.kind]}</span>
            </div>

            <div className="hangout__head">
              {isDemoHangout(hangout.id) && <p className="demo-flag">Demo hangout</p>}
              <RevealText as="h1" className="t-section hangout__title" text={title} />
              <ul className="facts">
                <li className="fact">
                  <span className="fact__badge">
                    <span className="fact__badge-top">{weekday(city.timezone).slice(0, 3)}</span>
                    <span className="fact__badge-num">{dayOfMonth(hangout.startsAt, city.timezone)}</span>
                  </span>
                  <span>
                    <span className="fact__title">
                      {capitalize(when)}, {time}
                    </span>
                    <span className="t-muted fact__sub">Stay as long as you like</span>
                  </span>
                </li>
                <li className="fact">
                  <span className="fact__badge fact__badge--icon">
                    <Icon name="pin" size={18} />
                  </span>
                  <span>
                    <span className="fact__title">{spot.name}</span>
                    <span className="t-muted fact__sub">
                      {[spot.address, spot.neighborhood, name].filter(Boolean).join(', ')}
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            <div className="hangout__aside">
              <section className={`join-card ${me ? 'is-joined' : ''}`} aria-labelledby="join-title">
                {me ? (
                  <>
                    <div className="join-card__head">
                      <Avatar nickname={me.nickname} size={40} you />
                      <div>
                        <p className="join-card__title" id="join-title">
                          {hosting ? `You’re hosting, ${me.nickname}` : `You’re in, ${me.nickname}`}
                        </p>
                        <p className="t-muted join-card__sub">
                          {hosting && needed > 0
                            ? `${needed} more and the group is on. Share the link to fill it.`
                            : `See you at ${spot.name} at ${time}.`}
                        </p>
                      </div>
                    </div>
                    {hosting && <Meter going={going} max={hangout.maxSize} min={MIN_GROUP_SIZE} />}
                    <div className="join-card__actions">
                      <button className="btn btn--primary btn--wide" onClick={openShare} data-testid="invite">
                        <Icon name="share" size={14} /> {hosting ? 'Share the link' : 'Invite a friend'}
                      </button>
                      {me.arrivedAt ? (
                        <p className="join-card__arrived t-label" data-testid="checked-in">
                          <Icon name="check" size={12} strokeWidth={2.2} /> You checked in at{' '}
                          {formatTime(me.arrivedAt, city.timezone)}
                        </p>
                      ) : (
                        <button
                          className="btn btn--secondary btn--wide"
                          onClick={checkIn}
                          disabled={checkingIn}
                          data-testid="check-in"
                        >
                          <Icon name="pin" size={14} /> I’m here
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="join-card__row">
                      <p className="join-card__title" id="join-title">
                        {isFull ? 'This group is full' : 'Room for you'}
                      </p>
                      <SeatsTag memberCount={going} spotsLeft={left} />
                    </div>
                    <p className="t-muted join-card__sub">
                      {isFull
                        ? `Groups stay at ${hangout.maxSize} or fewer. Find another plan ${nightWord(city.timezone)}.`
                        : `${going} going, up to ${hangout.maxSize}. Pick a nickname and you’re in, no account needed.`}
                    </p>
                    <Meter going={going} max={hangout.maxSize} min={MIN_GROUP_SIZE} />
                    {isFull ? (
                      <Link to={paths.city(city.slug)} className="btn btn--secondary btn--wide">
                        See other plans
                      </Link>
                    ) : (
                      <Link to={paths.join(hangout.id)} className="btn btn--primary btn--wide join-card__cta" data-testid="join">
                        Join this hangout
                      </Link>
                    )}
                  </>
                )}
              </section>

              {me && (
                <FadeIn as="section" className="safety" aria-labelledby="safety-title">
                  <p className="t-label" id="safety-title">
                    Before you go
                  </p>
                  <ul className="safety__list">
                    {SAFETY_HINTS.map((hint) => (
                      <li key={hint.title} className="safety__item">
                        <span className="icon-badge icon-badge--sm">
                          <Icon name={hint.icon} size={16} />
                        </span>
                        <span>
                          <span className="safety__title">{hint.title}</span>
                          <span className="t-muted safety__body">{hint.body}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </FadeIn>
              )}
            </div>

            <div className="hangout__body">
              {me && <Chat hangoutId={hangout.id} me={me} timeZone={city.timezone} onReport={setReport} />}

              <section className="block" aria-labelledby="about-title">
                <p className="t-label" id="about-title">
                  About
                </p>
                {hangout.note && <p className="block__text">{hangout.note}</p>}
                <div className="block__tags">
                  <span className="tag">{VIBE_LABEL[hangout.vibe]}</span>
                  <span className="tag tag--outline">{LANGUAGE_LABEL[hangout.language]}</span>
                  <span className="tag tag--outline">
                    {MIN_GROUP_SIZE} to {hangout.maxSize} people
                  </span>
                </div>
              </section>

              <section className="block" aria-labelledby="going-title">
                <p className="t-label" id="going-title">
                  {going} going
                </p>
                {me ? (
                  <ul className="people">
                    <li className="person">
                      <Avatar nickname={me.nickname} size={36} you />
                      <span className="person__name">{me.nickname}</span>
                      <span className="t-label">{hosting ? 'You, host' : 'You'}</span>
                    </li>
                    {others.map((m) => (
                      <li key={m.id} className="person">
                        <Avatar nickname={m.nickname} size={36} />
                        <span className="person__text">
                          <span className="person__name">{m.nickname}</span>
                          {m.arrivedAt && <span className="person__here t-label">Here</span>}
                        </span>
                        <span className="t-label person__role">{m.role === 'host' ? 'Started it' : (m.about ?? 'Member')}</span>
                        <button
                          className="person__more"
                          onClick={() =>
                            setReport({
                              type: 'member',
                              id: m.id,
                              hangoutId: hangout.id,
                              label: m.nickname,
                              member: { id: m.id, nickname: m.nickname },
                            })
                          }
                          aria-label={`Report or block ${m.nickname}`}
                          data-testid="report-member"
                        >
                          <Icon name="more" size={18} strokeWidth={2.4} />
                        </button>
                      </li>
                    ))}
                    {Array.from({ length: Math.min(left, 3) }).map((_, i) => (
                      <li key={`open-${i}`} className="person person--open" aria-hidden="true">
                        <span className="person__seat">
                          <Icon name="plus" size={14} />
                        </span>
                        <span className="person__name t-muted">Open seat</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="people-public">
                    <AvatarStack people={members} total={going} max={MAX_GROUP_SIZE} size={36} decorative />
                    <p className="t-muted people-public__note">
                      {left > 0 ? `${left} ${left === 1 ? 'seat' : 'seats'} open. ` : ''}Nicknames show once you join.
                    </p>
                  </div>
                )}
              </section>

              {!me && (
                <section className="block" aria-labelledby="chat-title">
                  <p className="t-label" id="chat-title">
                    Group chat
                  </p>
                  <div className="chat-locked">
                    <span className="icon-badge">
                      <Icon name="chat" size={18} />
                    </span>
                    <span className="chat-locked__text">
                      <span className="chat-locked__title">Members only</span>
                      <span className="t-muted chat-locked__body">Join to talk to the group and say when you’re there.</span>
                    </span>
                  </div>
                </section>
              )}

              <section className="block" aria-labelledby="where-title">
                <p className="t-label" id="where-title">
                  Where
                </p>
                <div className="where">
                  <LazyMap
                    center={{ lat: spot.lat, lng: spot.lng }}
                    zoom={15}
                    markers={markers}
                    activeId={spot.id}
                    fit={false}
                    className="where__map"
                    label={`Map showing ${spot.name}`}
                  />
                  <div className="where__info">
                    <SpotImage spot={spot} className="where__thumb" />
                    <div>
                      <p className="fact__title">{spot.name}</p>
                      <p className="t-muted fact__sub">
                        {KIND_LABEL[spot.kind]}
                        {place ? ` · ${place}` : ''}
                      </p>
                      {spot.openingHours && <p className="t-label where__hours">Hours: {spot.openingHours}</p>}
                    </div>
                  </div>
                </div>
              </section>

              <p className="hangout__report t-muted">
                Something feels off?{' '}
                <button
                  className="link-button"
                  onClick={() => setReport({ type: 'hangout', id: hangout.id, hangoutId: hangout.id, label: 'this hangout' })}
                  data-testid="report-hangout"
                >
                  Report this hangout
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>

      {!me && !isFull && (
        <div className="sticky-cta">
          <div>
            <p className="sticky-cta__title">{time} · {spot.name}</p>
            <p className="t-label">
              {left} {left === 1 ? 'seat' : 'seats'} left
            </p>
          </div>
          <Link to={paths.join(hangout.id)} className="btn btn--primary">
            Join
          </Link>
        </div>
      )}
      <ShareSheet target={share} onClose={() => setShare(null)} />
      <ReportDialog subject={report} onClose={() => setReport(null)} />
    </AppFrame>
  )
}
