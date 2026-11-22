import { useEffect, useState } from 'react'
import { CTA_IMAGE, HERO_IMAGE, cityImage } from '../assets/images'
import { Footer, Header, XRail } from '../components/Chrome'
import { Glyph } from '../components/Glyph'
import { Icon, type IconName } from '../components/Icon'
import { FadeIn, RevealText } from '../components/Reveal'
import { listCities, listSpots } from '../data/api'
import { CITY_META, cityName } from '../data/cityMeta'
import type { CityListItem, Spot } from '../data/types'
import { Link } from '../lib/router'
import { goUrl } from '../lib/partners'
import { paths } from '../lib/routes'
import { MOTION, prefersReducedMotion } from '../lib/motion'
import { useResource } from '../lib/resource'
import './landing.css'

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: 'users',
    title: 'Small groups, three to eight',
    body: 'Big enough that nobody has to carry the conversation, small enough that everyone gets a word in. Every hangout caps at eight people.',
  },
  {
    icon: 'pin',
    title: 'Public spots only',
    body: 'Groups meet at bars, pubs, clubs and beer gardens mapped on OpenStreetMap. Never at someone’s home, never at a secret address.',
  },
  {
    icon: 'clock',
    title: 'Tonight, not someday',
    body: 'Plans start within the next few hours. No group chat that fades after a week, no RSVP three weeks out. Show up, say hi, stay as long as you like.',
  },
]

export function Landing() {
  const { cities } = useResource('cities', listCities)
  return (
    <div className="landing">
      <Header
        nav={[
          { label: 'Why', to: '/#why' },
          { label: 'How it works', to: '/#how' },
          { label: 'Cities', to: '/#cities' },
        ]}
        action={
          <Link to={paths.cities()} className="btn btn--secondary">
            Open the app
          </Link>
        }
      />
      <main>
        <Hero />
        <XRail />
        <XRail tone="dark" />
        <Why />
        <XRail tone="dark" />
        <XRail />
        <How cities={cities} />
        <XRail />
        <Cities cities={cities} />
        <XRail />
        <XRail tone="dark" />
        <Safety />
        <XRail tone="dark" />
        <Travel />
        <XRail />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className="band" aria-labelledby="hero-title">
      <div className="rails hero">
        <div className="hero__copy">
          <RevealText as="h1" id="hero-title" className="t-hero hero__title" text="Meet a small group tonight at the best spots in your city" />
          <FadeIn as="p" className="t-lede hero__lede" delay={250}>
            Pick a city, join a hangout of three to eight people at a public bar or beer garden, and just show up.
          </FadeIn>
          <FadeIn className="hero__actions" delay={380}>
            <Link to={paths.cities()} className="btn btn--primary">
              Find tonight’s plans
            </Link>
          </FadeIn>
        </div>
        <figure className="hero__media">
          <picture>
            <source media="(max-width: 767px)" srcSet={HERO_IMAGE.small} />
            <img src={HERO_IMAGE.src} alt="Three friends meeting on a city corner at night, softened into a blue and violet glow" />
          </picture>
          <HeroOverlay />
          <span className="hero__tag" aria-hidden="true">
            <span className="hero__tag-dot" />3 going · room for one more
          </span>
        </figure>
      </div>
    </section>
  )
}

/** Technical overlay drawn in the artwork's own 1500 × 1000 space so it tracks the figures at every crop. */
function HeroOverlay() {
  const cross = (x: number, y: number, k: string) => (
    <g key={k}>
      <line x1={x - 18} y1={y} x2={x + 18} y2={y} />
      <line x1={x} y1={y - 18} x2={x} y2={y + 18} />
    </g>
  )
  const frame = { x1: 270, y1: 170, x2: 1230, y2: 820 }
  const stack = [0.36, 0.52, 0.68, 0.52, 0.36]
  return (
    <svg className="hero-ov" viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x={frame.x1} y={frame.y1} width={frame.x2 - frame.x1} height={frame.y2 - frame.y1} className="hero-ov__frame" />
      {cross(frame.x1, frame.y1, 'a')}
      {cross(frame.x2, frame.y1, 'b')}
      {cross(frame.x1, frame.y2, 'c')}
      {cross(frame.x2, frame.y2, 'd')}
      {[420, 570, 720, 870, 1020].map((x) =>
        [250, 360].map((y) => (
          <g key={`${x}-${y}`} className="hero-ov__plus">
            <line x1={x - 10} y1={y} x2={x + 10} y2={y} />
            <line x1={x} y1={y - 10} x2={x} y2={y + 10} />
          </g>
        )),
      )}
      <circle className="hero-ov__seat" cx={1120} cy={330} r={46} />
      {stack.map((w, i) => (
        <line
          key={i}
          className="hero-ov__rule"
          x1={750 - (1500 * w) / 2}
          x2={750 + (1500 * w) / 2}
          y1={850 + i * 30}
          y2={850 + i * 30}
        />
      ))}
    </svg>
  )
}

function Why() {
  return (
    <section className="band dark" id="why" aria-labelledby="why-title">
      <div className="rails split">
        <div className="split__left">
          <div className="frames">
            <div className="frames__inner">
              <p className="t-label">Why it works</p>
              <RevealText as="h2" id="why-title" className="t-section split__title" text="Going out alone is easier with a few others" />
            </div>
          </div>
        </div>
        <ul className="split__right">
          {FEATURES.map((f, i) => (
            <FadeIn as="li" key={f.title} className="feature" delay={i * 80}>
              <span className="icon-badge">
                <Icon name={f.icon} size={18} />
              </span>
              <h3 className="t-card feature__title">{f.title}</h3>
              <p className="t-body t-muted">{f.body}</p>
            </FadeIn>
          ))}
        </ul>
      </div>
    </section>
  )
}

function RotatingWord({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % words.length), MOTION.rotateEveryMs)
    return () => window.clearInterval(id)
  }, [words.length])
  const word = words[index]
  return (
    <span className="rotator" aria-live="off">
      <span key={word} className="rotator__word">
        {Array.from(word).map((ch, i) => (
          <span key={i} style={{ animationDelay: `${i * MOTION.letterStaggerMs}ms` }}>
            {ch}
          </span>
        ))}
      </span>
    </span>
  )
}

function How({ cities }: { cities: CityListItem[] }) {
  return (
    <section className="band" id="how" aria-labelledby="how-title">
      <div className="rails how">
        <FadeIn as="p" className="t-label">
          How it works
        </FadeIn>
        <h2 className="t-section how__title" id="how-title">
          <span className="how__muted">Pick a plan, meet the group and make a night of it in </span>
          <RotatingWord words={cities.map((c) => cityName(c))} />
        </h2>
        <div className="tree" aria-hidden="true">
          <span className="tree__stem" />
          <span className="tree__branch tree__branch--l" />
          <span className="tree__branch tree__branch--r" />
        </div>
        <div className="how__cards">
          <FadeIn className="how-card">
            <Glyph name="group" />
            <h3 className="t-card">Join a hangout</h3>
            <p className="t-body t-muted">
              Browse tonight’s plans, see who is going and how many seats are left. Join in three short steps, no account needed.
            </p>
          </FadeIn>
          <FadeIn className="how-card" delay={80}>
            <Glyph name="spot" />
            <h3 className="t-card">Find a spot</h3>
            <p className="t-body t-muted">
              A map of the bars, pubs, clubs and beer gardens worth knowing, so you always know where the group is headed.
            </p>
          </FadeIn>
        </div>
        <div className="tree tree--down" aria-hidden="true">
          <span className="tree__branch tree__branch--l" />
          <span className="tree__branch tree__branch--r" />
          <span className="tree__stem" />
        </div>
        <Link to={paths.cities()} className="btn btn--primary">
          Pick your city
        </Link>
      </div>
    </section>
  )
}

function CityCard({ city, spots }: { city: CityListItem; spots: Spot[] }) {
  const meta = CITY_META[city.slug]
  const picks = spots.slice(0, 2)
  const name = cityName(city)
  return (
    <Link to={paths.city(city.slug)} className="city-card" aria-label={`Tonight in ${name}`}>
      <span className="city-card__media">
        <img src={cityImage(meta?.image ?? '')} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="city-card__body">
        <span className="city-card__head">
          <span className="icon-badge city-card__badge">
            <Glyph name="night" size={30} />
          </span>
          <span>
            <span className="t-label">{meta?.countryName}</span>
            <span className="city-card__name">{name}</span>
          </span>
        </span>
        <span className="city-card__line">{meta?.blurb}</span>
        <span className="city-card__stats">
          <span>
            <strong>{city.openHangouts}</strong>
            <span className="t-label">Hangouts</span>
          </span>
          <span>
            <strong>{city.peopleTonight}</strong>
            <span className="t-label">Going</span>
          </span>
          <span>
            <strong>{spots.length}</strong>
            <span className="t-label">Spots</span>
          </span>
        </span>
        <span className="city-card__spots">
          <span className="t-label">Spots</span>
          {picks.map((s) => (
            <span key={s.id} className="city-card__spot">
              {s.name}
            </span>
          ))}
        </span>
      </span>
    </Link>
  )
}

function Cities({ cities }: { cities: CityListItem[] }) {
  const spotsByCity = useResource('spots:all', async () => {
    const lists = await Promise.all(cities.map((c) => listSpots(c.slug)))
    return Object.fromEntries(lists.map((l) => [l.city.slug, l.spots])) as Record<string, Spot[]>
  })
  const card = (c: CityListItem) => <CityCard key={c.slug} city={c} spots={spotsByCity[c.slug] ?? []} />
  return (
    <section className="band" id="cities" aria-labelledby="cities-title">
      <div className="rails cities">
        <div className="cities__head">
          <FadeIn as="p" className="t-label">
            Tonight
          </FadeIn>
          <RevealText as="h2" id="cities-title" className="t-section" text="Where people are going out tonight" />
        </div>
        <div className="marquee" tabIndex={0} aria-label="Cities">
          <div className="marquee__track">
            {cities.map(card)}
            <span className="marquee__clone" aria-hidden="true">
              {cities.map(card)}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Safety() {
  return (
    <section className="band dark" id="safety" aria-labelledby="safety-title">
      <div className="rails split split--safety">
        <div className="split__left">
          <div className="frames">
            <div className="frames__inner frames__inner--center">
              <p className="t-label">Safety</p>
              <RevealText as="h2" id="safety-title" className="t-section split__title" text="Built for meeting new people, carefully" />
              <p className="t-body split__copy">
                Nicknames instead of full names, public venues only, groups that never grow past eight, and a clear way out of
                any plan. Report anything that feels off and we take it from there.
              </p>
            </div>
          </div>
        </div>
        <div className="split__right split__right--quote">
          <FadeIn className="rule-card">
            <span className="icon-badge">
              <Icon name="shieldCheck" size={18} />
            </span>
            <p className="rule-card__text">
              “Every hangout happens at a public spot, with a small group, and you can leave whenever you want. No private
              addresses, ever.”
            </p>
            <p className="t-label rule-card__by">— House rule no. 1</p>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}

function Travel() {
  return (
    <section className="band" aria-labelledby="travel-title">
      <div className="rails travel">
        <FadeIn as="p" className="t-label">
          For travellers
        </FadeIn>
        <RevealText as="h2" id="travel-title" className="t-section travel__title" text="Plan the trip with Layla, spend the evening with us" />
        <FadeIn as="p" className="t-lede travel__lede" delay={120}>
          Let Layla sort out flights, a bed and the days. When the sun goes down, open your city here and find a table with
          room for one more.
        </FadeIn>
        <FadeIn className="travel__actions" delay={200}>
          <a className="btn btn--secondary" href={goUrl('layla', { from: 'landing' })} target="_blank" rel="noopener">
            Plan your trip with Layla <Icon name="arrowUpRight" size={14} />
          </a>
        </FadeIn>
      </div>
    </section>
  )
}

function Cta() {
  return (
    <section className="cta" aria-label="Get started">
      <div className="cta__stage">
        <img className="cta__bg" src={CTA_IMAGE} alt="" loading="lazy" />
        <span className="cta__rail cta__rail--l" aria-hidden="true" />
        <span className="cta__rail cta__rail--r" aria-hidden="true" />
        <div className="cta__device">
          <div className="cta__screen">
            <img src={CTA_IMAGE} alt="" loading="lazy" />
            <div className="cta__content">
              <p className="cta__kicker">Room for one more</p>
              <Link to={paths.cities()} className="btn btn--primary">
                Find tonight’s plans
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
