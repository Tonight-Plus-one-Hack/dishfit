// Map start experience: warm MapLibre map with score pins, floating filter chips, a compact dish carousel
// synced with the pins, and a draggable sheet with the full ranking.
// The start page (/, older links use /map). Filter choices and the selected restaurant live in the query string:
// /?r=<id>&kiez=<Kiez>&open=1&protein=1&budget=0.
import { useTranslation, LanguageContext, translatorFor, type Language } from '../../i18n'
import { motion, useReducedMotion } from 'framer-motion'
import { Component, lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppShell } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import { RankCard, RankCardSkeleton, RankRow } from '../../components/RankCard'
import { TestBadge } from '../../components/ui'
import { filtersKey, listRestaurants, topDishes, type DishFilters, type DishResult, type Kiez, type LatLng } from '../../data/api'
import { compareDiscoveryScore } from '../../data/scoring'
import { track } from '../../lib/analytics'
import { SHOW_TEST_DATA } from '../../lib/flags'
import { useSearchParams } from '../../lib/location'
import { readMapCategory, type MapCategory } from '../../lib/map-category'
import { prefersReducedMotion } from '../../lib/motion'
import { isLocationFailure, openLocationPrompt, useHomeKiez, usePosition, type PositionState } from '../../lib/position'
import { useProfile } from '../../lib/profile'
import { BUDGET_EUR, byRankingGroup, dishCount, kiezFromParam, kiezParam, PROTEIN_GOAL_G, rankingBasis, rankingFilters, rankingTitle } from '../../lib/ranking'
import { refresh, useResource } from '../../lib/resource'
import { Link } from '../../lib/router'
import { navigate, paths } from '../../lib/routes'
import { persisted, useStore } from '../../lib/store'
import { springTransition } from '../../motion/transitions'
import { NEAR_FRAME } from './camera'
import { KiezPicker } from './KiezPicker'
import { MapCategoryFilter } from './MapCategoryFilter'
import { RankSheet } from './RankSheet'
import { WaitlistMapRow } from '../waitlist/WaitlistLink'
import type { MapInsets, PinData, PinMetric } from './ScoreMap'
import './map.css'

const ScoreMap = lazy(() => import('./ScoreMap'))

const metricStore = persisted<PinMetric>('dishfit.map.metric.v1', 'kcal')
// Keep the camera's framing clear of the 44px action buttons and their gap.
const MAP_ACTION_INSET = 52

interface MapChoice {
  kiez: Kiez | null
  underBudget: boolean
  proteinPlus: boolean
  openNow: boolean
  mapCategory?: MapCategory
}

/** Rows the ranking sheet renders per page; the count above always covers all matching dishes. */
const PAGE = 40

const DEFAULT_CHOICE: MapChoice = { kiez: null, underBudget: true, proteinPlus: false, openNow: false }

/** Without a `kiez` in the URL the map starts in the home Kiez from onboarding. */
function readChoice(params: URLSearchParams, home: Kiez | null): MapChoice {
  return {
    kiez: kiezFromParam(params.get('kiez'), home),
    underBudget: params.get('budget') !== '0',
    proteinPlus: params.get('protein') === '1',
    openNow: params.get('open') === '1',
    mapCategory: readMapCategory(params.get('category')),
  }
}

function mapUrl(choice: MapChoice, active: string | null, home: Kiez | null): string {
  const p = new URLSearchParams()
  const kiez = kiezParam(choice.kiez, home)
  if (active) p.set('r', active)
  if (kiez) p.set('kiez', kiez)
  if (!choice.underBudget) p.set('budget', '0')
  if (choice.proteinPlus) p.set('protein', '1')
  if (choice.openNow) p.set('open', '1')
  if (choice.mapCategory) p.set('category', choice.mapCategory)
  const qs = p.toString()
  return qs ? `/?${qs}` : '/'
}

/** Height of an element, kept current. */
function useHeight<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, height] as const
}

// ---------- Top chrome: search and filter chips ----------

function Chip({ pressed, onClick, icon, children, popup = false }: { pressed: boolean; onClick: () => void; icon: Parameters<typeof Icon>[0]['name']; children: ReactNode; popup?: boolean }) {
  return (
    <button type="button" className="map-chip" aria-pressed={pressed} aria-haspopup={popup ? 'dialog' : undefined} onClick={onClick}>
      <Icon name={icon} size={15} strokeWidth={1.8} />
      {children}
      {popup && <Icon name="chevronRight" size={14} strokeWidth={1.8} className="map-chip__caret" />}
    </button>
  )
}

function MetricToggle({ metric, onChange }: { metric: PinMetric; onChange: (m: PinMetric) => void }) {
  const t = useTranslation()
  const reduce = useReducedMotion()
  const options: Array<{ value: PinMetric; label: string }> = [
    { value: 'kcal', label: 'kcal' },
    { value: 'score', label: t('score') },
  ]
  return (
    <div className="metric-toggle" role="radiogroup" aria-label={t('valueShownOnMapPins')}>
      {options.map((o) => {
        const on = metric === o.value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className="map-chip metric-toggle__option" onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId="metric-indicator" className="metric-toggle__indicator" transition={reduce ? { duration: 0 } : springTransition('state')} />}
            <span className="metric-toggle__label">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function LocateButton({ status, onLocate }: { status: PositionState['status']; onLocate: () => void }) {
  const t = useTranslation()
  const label = status === 'granted' ? t('goToMyLocation')
    : status === 'locating' ? t('findingYourLocation')
    : status === 'denied' ? t('locationAccessBlocked')
    : isLocationFailure(status) ? t('locationUnavailable')
    : t('nearMe')
  return (
    <button
      type="button"
      className={`locate-btn ${status === 'granted' ? 'is-on' : ''}`}
      onClick={onLocate}
      disabled={status === 'locating'}
      aria-label={label}
      title={label}
    >
      <Icon name="locate" size={18} strokeWidth={1.8} />
    </button>
  )
}

// ---------- Carousel, synced with the pins ----------

function Carousel({ items, activeId, onActive, showDistance }: { items: DishResult[]; activeId: string | null; onActive: (id: string) => void; showDistance: boolean }) {
  const t = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef(0)
  const fromScroll = useRef(false)
  const mounted = useRef(false)
  const reduce = useReducedMotion()

  // Bring the active restaurant's card into the centre when the selection comes from a pin or the URL.
  useEffect(() => {
    const el = ref.current
    const first = !mounted.current
    mounted.current = true
    if (!el || !activeId) return
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    const i = items.findIndex((x) => x.restaurant.id === activeId)
    const card = el.children[i] as HTMLElement | undefined
    if (!card) return
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: first || prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [activeId, items])

  useEffect(() => () => window.clearTimeout(settle.current), [])

  const onScroll = () => {
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      const el = ref.current
      if (!el) return
      const centre = el.scrollLeft + el.clientWidth / 2
      let best = -1
      let bestDistance = Infinity
      Array.from(el.children).forEach((child, i) => {
        const c = child as HTMLElement
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - centre)
        if (d < bestDistance) {
          bestDistance = d
          best = i
        }
      })
      const id = items[best]?.restaurant.id
      if (id && id !== activeId) {
        fromScroll.current = true
        onActive(id)
      }
    }, 140)
  }

  return (
    <div ref={ref} className="carousel" onScroll={onScroll} role="list" aria-label={t('bestDishesByRestaurant')}>
      {items.map((result, i) => (
        <motion.div
          key={result.dish.id}
          role="listitem"
          className="carousel__item"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition('appear', 80 + Math.min(i, 4) * 60)}
          onFocus={() => {
            if (result.restaurant.id !== activeId) {
              fromScroll.current = false
              onActive(result.restaurant.id)
            }
          }}
        >
          <RankCard
            result={result}
            showDistance={showDistance}
            active={result.restaurant.id === activeId}
            showPlaceCover={false}
            className="carousel__card"
          />
        </motion.div>
      ))}
    </div>
  )
}

function EmptyCard({ onReset }: { onReset: () => void }) {
  const t = useTranslation()
  return (
    <div className="map-empty" role="status">
      <p className="map-empty__title">{t('nothingMatchesThisSelectionRightNow')}</p>
      <p className="t-muted">{t('loosenAFilterOrChooseAnother')}</p>
      <button type="button" className="btn btn--secondary" onClick={onReset}>{t('resetFilters')}</button>
    </div>
  )
}

// ---------- Results: map, carousel and sheet ----------

interface ResultsProps {
  filters: DishFilters
  stale: boolean
  choice: MapChoice
  metric: PinMetric
  activeId: string | null
  onActive: (id: string | null) => void
  expanded: boolean
  onExpanded: (open: boolean) => void
  chromeHeight: number
  position: PositionState
  onLocate: () => void
  locateNonce: number
  onReset: () => void
}

function MapResults(props: ResultsProps) {
  const t = useTranslation()
  const { filters, choice, metric, activeId, onActive, expanded, onExpanded, chromeHeight, position } = props
  const key = filtersKey(filters)
  // The same query as Discover, without a limit, so both screens count the same dishes.
  const [restaurants, ranking] = useResource(`map:${key}`, () => Promise.all([listRestaurants(filters), topDishes(filters)]))
  const [sheetHead, setSheetHead] = useState(64)
  // A new query starts at the first page again.
  const [paging, setPaging] = useState({ key, shown: PAGE })
  const shown = paging.key === key ? paging.shown : PAGE
  const [layerRef, layerHeight] = useHeight<HTMLDivElement>(120)
  const showDistance = position.status === 'granted'

  // One card per restaurant: its best dish, in ranking order.
  const items = useMemo<DishResult[]>(
    () =>
      restaurants
        .filter((r) => r.topDish)
        .map((r) => ({ dish: r.topDish!, restaurant: r, distance: r.distance, openNow: r.openNow }))
        .sort((a, b) => byRankingGroup(a, b, filters.distanceBands) || compareDiscoveryScore(a.dish, b.dish, filters.sort)),
    [restaurants, filters.distanceBands, filters.sort],
  )

  const pins = useMemo<PinData[]>(() => {
    const order = new Map(items.map((x, i) => [x.restaurant.id, i]))
    return restaurants.map((r) => ({
        id: r.id,
        order: order.get(r.id) ?? 0,
        lat: r.lat,
        lng: r.lng,
        name: r.name,
        isTestData: r.isTestData,
        dish: r.topDish ? { kcal: r.topDish.nutrition.kcal.value, score: r.topDish.healthScore, estimate: r.topDish.nutrition.source !== 'official' || r.topDish.isTestData } : null,
        category: r.mapCategory,
      }))
  }, [restaurants, items])

  const insets = useMemo<MapInsets>(
    () => ({ top: chromeHeight, bottom: sheetHead + layerHeight, right: MAP_ACTION_INSET }),
    [chromeHeight, sheetHead, layerHeight],
  )
  const anyTest = ranking.some((r) => r.restaurant.isTestData) || items.some((r) => r.restaurant.isTestData)
  const user: LatLng | null = position.status === 'granted' ? position.position : null
  const onHeaderHeight = useCallback((h: number) => setSheetHead(h), [])

  return (
    <div className={`map-results ${props.stale ? 'is-stale' : ''}`} style={{ ['--sheet-head' as string]: `${sheetHead}px` }}>
      <Suspense fallback={<div className="score-map score-map--loading" aria-busy="true" />}>
        <ScoreMap
          pins={pins}
          metric={metric}
          activeId={activeId}
          onSelect={onActive}
          onOpen={(id) => navigate(paths.restaurant(id))}
          user={user}
          frameKey={filters.kiez || filters.mapCategory ? JSON.stringify([filters.kiez, filters.mapCategory]) : NEAR_FRAME}
          locateNonce={props.locateNonce}
          insets={insets}
        />
      </Suspense>

      <div ref={layerRef} className="map-layer" inert={expanded}>
        <div className="map-actions">
          <LocateButton status={position.status} onLocate={props.onLocate} />
          <Link to={paths.snap()} className="map-scan-btn" aria-label={t('scanAMenu')} title={t('scanAMenu')}>
            <Icon name="camera" size={20} strokeWidth={1.8} />
          </Link>
        </div>
        {items.length > 0 ? (
          <Carousel items={items} activeId={activeId} onActive={onActive} showDistance={showDistance} />
        ) : (
          <EmptyCard onReset={props.onReset} />
        )}
      </div>

      <RankSheet
        expanded={expanded}
        onExpandedChange={onExpanded}
        onHeaderHeight={onHeaderHeight}
        header={
          <>
            <h2 className="rank-sheet__heading">{expanded ? rankingTitle(choice) : dishCount(ranking.length)}</h2>
            {expanded && (
              <p className="rank-sheet__meta">
                <span>
                  {dishCount(ranking.length)}
                  {ranking.length > shown && ` · ${t('nShown', shown)}`}
                  {ranking.length > 0 && ` · ${rankingBasis(filters)}`}
                </span>
                {anyTest && <TestBadge />}
              </p>
            )}
          </>
        }
      >
        <WaitlistMapRow />
        {ranking.length === 0 ? (
          <EmptyCard onReset={props.onReset} />
        ) : (
          <>
            <ol className="rank-list">
              {ranking.slice(0, shown).map((result, i) => (
                <li key={result.dish.id}>
                  <RankRow result={result} rank={i + 1} showDistance={showDistance} />
                </li>
              ))}
            </ol>
            {ranking.length > shown && (
              <button type="button" className="btn btn--secondary btn--wide rank-list__more" onClick={() => setPaging({ key, shown: shown + PAGE })}>
                {Math.min(PAGE, ranking.length - shown)}{' '}{t('more')}</button>
            )}
          </>
        )}
        <p className="rank-sheet__note">
          {t('proteinGoalNote', PROTEIN_GOAL_G)} {t('nutritionEstimateNote')}
          {SHOW_TEST_DATA && t('testDataNote')}
        </p>
      </RankSheet>
    </div>
  )
}

function ResultsSkeleton() {
  const t = useTranslation()
  return (
    <div className="map-results" aria-busy="true" aria-label={t('loadingMap')}>
      <div className="score-map score-map--loading" />
      <div className="map-layer">
        <div className="carousel carousel--loading">
          <RankCardSkeleton className="carousel__card" />
          <RankCardSkeleton className="carousel__card" />
        </div>
      </div>
      <div className="rank-sheet rank-sheet--skeleton">
        <div className="rank-sheet__head">
          <span className="rank-sheet__handle" />
          <span className="skeleton rank-skel rank-skel--title" />
          <span className="skeleton rank-skel rank-skel--line" />
        </div>
      </div>
    </div>
  )
}

class ResultsBoundary extends Component<{ children: ReactNode }, { error: unknown; retrying: boolean }> {
  static contextType = LanguageContext
  declare context: Language
  private translate = translatorFor(() => this.context)
  state: { error: unknown; retrying: boolean } = { error: null, retrying: false }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  retry = async () => {
    this.setState({ retrying: true })
    await refresh((key) => key.startsWith('map:'))
    this.setState({ error: null, retrying: false })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="map-results map-results--error">
        <div className="map-error" role="alert">
          <Icon name="alert" size={22} />
          <h2 className="map-error__title">{this.translate('weCouldntLoadTheDishes')}</h2>
          <p className="t-muted">{this.translate('checkConnection')}</p>
          <button type="button" className="btn btn--primary" onClick={this.retry} disabled={this.state.retrying}>
            {this.state.retrying ? this.translate('loading') : this.translate('tryAgain')}
          </button>
        </div>
      </div>
    )
  }
}

// ---------- Screen ----------

function MapExperience() {
  const t = useTranslation()
  const params = useSearchParams()
  const profile = useProfile()
  const position = usePosition()
  const home = useHomeKiez()
  const choice = readChoice(params, home)
  const [active, setActive] = useState<string | null>(() => params.get('r'))
  const [expanded, setExpanded] = useState(false)
  const [kiezOpen, setKiezOpen] = useState(false)
  const [locateNonce, setLocateNonce] = useState(0)
  const metric = useStore(metricStore)
  const [chromeRef, chromeHeight] = useHeight<HTMLDivElement>(112)
  const reduce = useReducedMotion()
  const filters = { ...rankingFilters({ ...choice, near: position.position, distanceBands: position.status === 'granted', goal: profile?.goal, diet: profile?.diet }), mapCategory: choice.mapCategory }
  const key = filtersKey(filters)
  const deferredKey = useDeferredValue(key)
  const deferredFilters = useMemo(() => JSON.parse(deferredKey) as DishFilters, [deferredKey])

  // Keep the selection in the URL, so coming back from a dish restores the card.
  useEffect(() => {
    const current = readChoice(new URLSearchParams(window.location.search), home)
    navigate(mapUrl(current, active, home), { replace: true })
  }, [active, home])

  const update = (next: Partial<MapChoice>) => {
    const merged = { ...choice, ...next }
    const target = mapUrl(merged, null, home)
    if (target !== mapUrl(choice, null, home)) track('filter_change')
    setActive(null)
    navigate(target, { replace: true })
  }
  const reset = () => {
    update({ ...DEFAULT_CHOICE, kiez: home, mapCategory: undefined })
  }
  const locate = () => {
    if (position.status === 'granted') setLocateNonce((n) => n + 1)
    else openLocationPrompt()
  }

  return (
    <div className="map-screen" style={{ ['--chrome' as string]: `${chromeHeight}px` }}>
      <motion.div
        ref={chromeRef}
        className="map-chrome"
        initial={reduce ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springTransition('appear')}
      >
        <Link to={paths.search()} className="map-search">
          <Icon name="search" size={18} />
          <span>{t('dishRestaurantOrCuisine')}</span>
        </Link>
        <div className="map-chips" role="group" aria-label={t('filters')}>
          <MapCategoryFilter value={choice.mapCategory} onChange={(mapCategory) => update({ mapCategory })} />
          <MetricToggle metric={metric} onChange={(m) => metricStore.set(m)} />
          <Chip icon="clock" pressed={choice.openNow} onClick={() => update({ openNow: !choice.openNow })}>{t('openNow')}</Chip>
          <Chip icon="euro" pressed={choice.underBudget} onClick={() => update({ underBudget: !choice.underBudget })}>{t('under')}{' '}{BUDGET_EUR} €
          </Chip>
          <Chip icon="bolt" pressed={choice.proteinPlus} onClick={() => update({ proteinPlus: !choice.proteinPlus })}>
            {PROTEIN_GOAL_G}{' '}{t('gProtein')}</Chip>
          <Chip icon="pin" pressed={choice.kiez !== null} popup onClick={() => setKiezOpen(true)}>
            {choice.kiez ?? t('neighbourhood')}
          </Chip>
        </div>
      </motion.div>

      <ResultsBoundary>
        <Suspense fallback={<ResultsSkeleton />}>
          <MapResults
            filters={deferredFilters}
            stale={key !== deferredKey}
            choice={choice}
            metric={metric}
            activeId={active}
            onActive={setActive}
            expanded={expanded}
            onExpanded={setExpanded}
            chromeHeight={chromeHeight}
            position={position}
            onLocate={locate}
            locateNonce={locateNonce}
            onReset={reset}
          />
        </Suspense>
      </ResultsBoundary>

      <KiezPicker open={kiezOpen} value={choice.kiez} onChange={(kiez) => update({ kiez })} onClose={() => setKiezOpen(false)} />
    </div>
  )
}

export function MapScreen() {
  return (
    <AppShell tab="map" bleed>
      <MapExperience />
    </AppShell>
  )
}
