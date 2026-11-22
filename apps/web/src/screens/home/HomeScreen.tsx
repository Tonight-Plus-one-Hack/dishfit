// Home / Discover: the same ranking as the map ("Die besten Protein-Gerichte unter 12 € in deiner Nähe") as a list of
// big cards, with a Kiez switcher, then the restaurants of that area. The Kiez lives in the query string: /entdecken?kiez=Kreuzberg.
import { useTranslation, LanguageContext, translatorFor, type Language } from '../../i18n'
import { motion, useReducedMotion } from 'framer-motion'
import { Component, Suspense, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { useShellMode } from '../../app/viewport'
import { FitDayButton } from '../../components/FitDay'
import { Icon } from '../../components/Icon'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { LegalLinks } from '../../components/LegalLinks'
import { RankCard, RankCardSkeleton } from '../../components/RankCard'
import { FadeIn } from '../../components/Reveal'
import { OpenState, RestaurantName } from '../../components/ui'
import { filtersKey, KIEZE, listRestaurants, topDishes, type DishFilters, type Kiez } from '../../data/api'
import { track } from '../../lib/analytics'
import { formatCuisine } from '../../lib/cuisine'
import { formatDistance } from '../../lib/format'
import { useGreeting } from '../../lib/greeting'
import { useSearchParams } from '../../lib/location'
import { SHOW_TEST_DATA } from '../../lib/flags'
import { openLocationPrompt, useHomeKiez, usePosition } from '../../lib/position'
import { useProfile } from '../../lib/profile'
import { BUDGET_EUR, dishCount, kiezFromParam, kiezParam, NEARBY_M, rankingBasis, rankingFilters, rankingTitle } from '../../lib/ranking'
import { refresh, useResource } from '../../lib/resource'
import { Link } from '../../lib/router'
import { navigate, paths } from '../../lib/routes'
import { springTransition } from '../../motion/transitions'
import { WaitlistLink } from '../waitlist/WaitlistLink'
import './home.css'

const SHOWN = 8

function mapLink(kiez: Kiez | null, home: Kiez | null): string {
  const value = kiezParam(kiez, home)
  return value ? `/?kiez=${encodeURIComponent(value)}` : paths.map()
}

function KiezSwitcher({ value, home }: { value: Kiez | null; home: Kiez | null }) {
  const t = useTranslation()
  const reduce = useReducedMotion()
  const { status } = usePosition()
  const row = useRef<HTMLDivElement>(null)
  const rowId = useId()
  const [edges, setEdges] = useState({ prev: false, next: false })
  useEffect(() => {
    const el = row.current
    if (!el) return
    const measure = () => {
      const prev = el.scrollLeft > 1
      const next = el.scrollWidth - el.clientWidth - el.scrollLeft > 1
      setEdges((current) => current.prev === prev && current.next === next ? current : { prev, next })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const option of el.children) observer.observe(option)
    el.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [])
  const scroll = (direction: number) => {
    const el = row.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.75, behavior: reduce ? 'instant' : 'smooth' })
  }
  const options: Array<{ value: Kiez | null; label: string }> = [{ value: null, label: t('nearby') }, ...KIEZE.map((k) => ({ value: k, label: k }))]
  return (
    <div className="kiez-strip" data-prev={edges.prev} data-next={edges.next}>
      <div ref={row} id={rowId} className="kiez-switch" role="radiogroup" aria-label={t('neighbourhood')}>
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={on}
              className="kiez-switch__option"
              onClick={() => {
                if (o.value === null && status !== 'granted') {
                  openLocationPrompt()
                  return
                }
                if (!on) track('filter_change')
                const param = kiezParam(o.value, home)
                navigate(param ? `${paths.discover()}?kiez=${encodeURIComponent(param)}` : paths.discover(), { replace: true })
              }}
            >
              {on && <motion.span layoutId="kiez-indicator" className="kiez-switch__indicator" transition={reduce ? { duration: 0 } : springTransition('state')} />}
              <span className="kiez-switch__label">
                {o.value === null && <Icon name="locate" size={14} strokeWidth={1.8} />}
                {o.label}
              </span>
            </button>
          )
        })}
      </div>
      {edges.prev && (
        <button type="button" className="kiez-strip__arrow kiez-strip__arrow--prev" aria-controls={rowId} aria-label={t('showPreviousNeighbourhoods')} onClick={() => scroll(-1)}>
          <Icon name="chevronRight" size={16} />
        </button>
      )}
      {edges.next && (
        <button type="button" className="kiez-strip__arrow" aria-controls={rowId} aria-label={t('showMoreNeighbourhoods')} onClick={() => scroll(1)}>
          <Icon name="chevronRight" size={16} />
        </button>
      )}
    </div>
  )
}

function Ranking({ filters, kiez, home, showDistance }: { filters: DishFilters; kiez: Kiez | null; home: Kiez | null; showDistance: boolean }) {
  const t = useTranslation()
  const dishes = useResource(`home:top:${filtersKey(filters)}`, () => topDishes(filters))
  if (dishes.length === 0) {
    return (
      <div className="home-empty" role="status">
        <p className="home-empty__title">{kiez ? t('theresNothingUnder2In1', kiez, BUDGET_EUR) : t('theresNothingUnder1NearYou', BUDGET_EUR)}</p>
        <p className="t-muted">{t('chooseAnotherNeighbourhoodOrTakeA')}</p>
        <Link to={mapLink(kiez, home)} className="btn btn--secondary">{t('viewMap')}</Link>
      </div>
    )
  }
  const shown = dishes.slice(0, SHOWN)
  return (
    <>
      <p className="home-rank__meta">
        {dishCount(dishes.length)} · {rankingBasis(filters)}
      </p>
      <ol className="home-rank">
        {shown.map((result, i) => (
          <FadeIn as="li" key={result.dish.id} delay={Math.min(i, 4) * 60}>
            <RankCard result={result} rank={i + 1} showDistance={showDistance} />
          </FadeIn>
        ))}
      </ol>
      {dishes.length > SHOWN && (
        <Link to={paths.search(`priceMax=${BUDGET_EUR}&sort=protein${kiez ? `&kiez=${encodeURIComponent(kiez)}` : ''}`)} className="btn btn--secondary btn--wide">{t('viewAllDishes', dishes.length)}</Link>
      )}
    </>
  )
}

function RankingSkeleton() {
  const t = useTranslation()
  return (
    <div className="home-rank" aria-busy="true" aria-label={t('loadingDishes')}>
      <RankCardSkeleton />
      <RankCardSkeleton />
    </div>
  )
}

function NearbyRestaurants({ filters }: { filters: DishFilters }) {
  const t = useTranslation()
  const restaurants = useResource(`home:restaurants:${filtersKey(filters)}`, () => listRestaurants(filters))
  if (restaurants.length === 0) return <p className="t-muted home-empty__inline">{t('weDontHaveAnyRestaurantsHere')}</p>
  return (
    <ul className="near-list">
      {restaurants.map((r) => (
        <li key={r.id}>
          <Link to={paths.restaurant(r.id)} className="near-row">
            <span className="near-row__body">
              <span className="near-row__name">
                <RestaurantName restaurant={r} />
              </span>
              <span className="near-row__meta">
                {r.kiez} · {formatCuisine(r.cuisine)}
                {filters.distanceBands && r.distance !== null && ` · ${formatDistance(r.distance)}`}
              </span>
              <span className="near-row__meta">
                <OpenState open={r.openNow} />
              </span>
            </span>
            <span className="near-row__count t-label">{r.totalDishes > 0 ? dishCount(r.totalDishes) : t('homeScreenNoMenuYet')}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

class SectionBoundary extends Component<{ children: ReactNode; prefix: string }, { error: unknown }> {
  static contextType = LanguageContext
  declare context: Language
  private translate = translatorFor(() => this.context)
  state: { error: unknown } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  retry = async () => {
    await refresh((key) => key.startsWith(this.props.prefix))
    this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="home-empty" role="alert">
        <p className="home-empty__title">{this.translate('loadFailed')}</p>
        <p className="t-muted">{this.translate('checkConnection')}</p>
        <button type="button" className="btn btn--secondary" onClick={this.retry}>{this.translate('tryAgain')}</button>
      </div>
    )
  }
}

export function HomeScreen() {
  const t = useTranslation()
  const eyebrow = useGreeting()
  const { position, status } = usePosition()
  const profile = useProfile()
  const params = useSearchParams()
  const home = useHomeKiez()
  const kiez = kiezFromParam(params.get('kiez'), home)
  const reduce = useReducedMotion()
  const showDistance = status === 'granted'
  // The desktop frame has the same button in its top bar.
  const phone = useShellMode() === 'phone'

  const ranking = rankingFilters({ near: position, distanceBands: showDistance, goal: profile?.goal, kiez, underBudget: true, proteinPlus: false, openNow: false, diet: profile?.diet })
  const rankingKey = useDeferredValue(filtersKey(ranking))
  const nearby: DishFilters = { near: ranking.near, distanceBands: showDistance, sort: ranking.sort, kiez: kiez ? [kiez] : undefined, maxDistance: kiez ? undefined : NEARBY_M, limit: 8 }
  const nearbyKey = useDeferredValue(filtersKey(nearby))
  const rankingFiltersStable = useMemo(() => JSON.parse(rankingKey) as DishFilters, [rankingKey])
  const nearbyFiltersStable = useMemo(() => JSON.parse(nearbyKey) as DishFilters, [nearbyKey])

  return (
    <AppShell tab="home">
      <ScreenHeader
        large
        eyebrow={t(eyebrow)}
        title={t('homeTitle')}
        actions={
          <>
            {phone && <LanguageSwitch />}
            <Link to={mapLink(kiez, home)} className="btn btn--secondary btn--icon home-action" aria-label={t('map')}>
              <Icon name="map" size={18} />
            </Link>
            <Link to={paths.search()} className="btn btn--secondary btn--icon home-action" aria-label={t('homeScreenSearch')}>
              <Icon name="search" size={18} />
            </Link>
            <Link to={paths.me()} className="btn btn--secondary btn--icon home-action" aria-label={t('profile')}>
              <Icon name="user" size={18} />
            </Link>
          </>
        }
      />
      <div className="page home">
        <div><WaitlistLink /></div>
        {!profile && (
          <Link to={paths.onboarding()} className="goal-card">
            <span className="goal-card__text">
              <span className="goal-card__title">{t('setYourGoal')}</span>
              <span className="t-muted">{t('loseWeightMaintainItOrBuild')}</span>
            </span>
            <Icon name="arrowRight" size={18} />
          </Link>
        )}

        {phone && (
          <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springTransition('appear', 40)}>
            <FitDayButton variant="card" />
          </motion.div>
        )}

        <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springTransition('appear', 80)}>
          <KiezSwitcher value={kiez} home={home} />
        </motion.div>

        {status !== 'granted' && (
          <button type="button" className="locate-hint" onClick={openLocationPrompt} disabled={status === 'locating'}>
            <Icon name="locate" size={18} />
            <span>{status === 'locating' ? t('locating') : status === 'denied' ? t('locationAccessBlocked') : t('useDeviceLocation')}</span>
          </button>
        )}

        <section className="home__section" aria-labelledby="ranking-title">
          <div className="home-rank__head">
            <h2 id="ranking-title" className="home-rank__title">
              {rankingTitle({ kiez, underBudget: true })}
            </h2>
            <Link to={mapLink(kiez, home)} className="home-rank__map">
              <Icon name="map" size={14} strokeWidth={1.8} />{t('map')}</Link>
          </div>
          <SectionBoundary prefix="home:top:">
            <Suspense fallback={<RankingSkeleton />}>
              <Ranking filters={rankingFiltersStable} kiez={kiez} home={home} showDistance={showDistance} />
            </Suspense>
          </SectionBoundary>
        </section>

        <section className="home__section" aria-labelledby="near-title">
          <div className="section-head">
            <h2 id="near-title">{kiez ? t('restaurantsIn1', kiez) : t('restaurantsNearby')}</h2>
            <Link to={mapLink(kiez, home)}>{t('map')}</Link>
          </div>
          <SectionBoundary prefix="home:restaurants:">
            <Suspense fallback={<div className="skeleton home__skeleton" aria-busy="true" />}>
              <NearbyRestaurants filters={nearbyFiltersStable} />
            </Suspense>
          </SectionBoundary>
        </section>

        <p className="home__note t-muted">{t('nutritionValuesAreEstimatedFromThe')}{SHOW_TEST_DATA && t('testDataNote')}
        </p>
        <LegalLinks />
      </div>
    </AppShell>
  )
}
