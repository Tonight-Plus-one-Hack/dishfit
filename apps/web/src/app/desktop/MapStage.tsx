// The big map of the desktop frame: the map screen's ScoreMap with the restaurants for the active filters.
// Selecting a pin opens the restaurant in the right panel. No Google Places content goes on this map.
import { useTranslation, LanguageContext, translatorFor, type Language } from '../../i18n'
import { motion, useReducedMotion } from 'framer-motion'
import { Component, lazy, Suspense, useDeferredValue, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Glyph } from '../../components/glyphs/Glyph'
import { Icon } from '../../components/Icon'
import { filtersKey, listRestaurants, type DishFilters, type LatLng } from '../../data/api'
import { compareDiscoveryScore } from '../../data/scoring'
import type { MapCategory } from '../../lib/map-category'
import { byRankingGroup } from '../../lib/ranking'
import { openLocationPrompt, usePosition } from '../../lib/position'
import { refresh, useResource } from '../../lib/resource'
import { Link } from '../../lib/router'
import { navigate, paths } from '../../lib/routes'
import { persisted, useStore } from '../../lib/store'
import { springTransition } from '../../motion/transitions'
import { NEAR_FRAME } from '../../screens/map/camera'
import { MapCategoryFilter } from '../../screens/map/MapCategoryFilter'
import type { MapInsets, PinData, PinMetric } from '../../screens/map/ScoreMap'
import '../../screens/map/map.css'

const ScoreMap = lazy(() => import('../../screens/map/ScoreMap'))

/** Same key as the phone map, so the pin value preference carries over. */
const metricStore = persisted<PinMetric>('dishfit.map.metric.v1', 'kcal')

function Pins({
  filters,
  activeId,
  detailView,
  metric,
  locateNonce,
  rightInset,
}: {
  filters: DishFilters
  activeId: string | null
  detailView: boolean
  metric: PinMetric
  locateNonce: number
  rightInset: number
}) {
  const restaurants = useResource(`desk-map:${filtersKey(filters)}`, () => listRestaurants(filters))
  const position = usePosition()
  const user: LatLng | null = position.status === 'granted' ? position.position : null

  const pins = useMemo<PinData[]>(() => {
    const ranked = restaurants
      .filter((r) => r.topDish)
      .sort((a, b) => byRankingGroup(a, b, filters.distanceBands) || compareDiscoveryScore(a.topDish!, b.topDish!, filters.sort))
    const order = new Map(ranked.map((r, i) => [r.id, i]))
    return restaurants.map((r) => ({
      id: r.id,
      order: order.get(r.id) ?? ranked.length,
      lat: r.lat,
      lng: r.lng,
      name: r.name,
      isTestData: r.isTestData,
      dish: r.topDish ? { kcal: r.topDish.nutrition.kcal.value, score: r.topDish.healthScore, estimate: r.topDish.nutrition.source !== 'official' || r.topDish.isTestData } : null,
      category: r.mapCategory,
    }))
  }, [restaurants, filters.distanceBands, filters.sort])

  // The pin controls sit bottom left; a tablet drawer covers the right edge.
  const insets = useMemo<MapInsets>(() => ({ top: 8, bottom: 108, right: rightInset }), [rightInset])
  const open = (id: string) => navigate(paths.restaurant(id))
  return (
    <ScoreMap
      pins={pins}
      metric={metric}
      activeId={activeId}
      detailView={detailView}
      onSelect={open}
      onOpen={open}
      user={user}
      frameKey={filters.kiez || filters.mapCategory ? JSON.stringify([filters.kiez, filters.mapCategory]) : NEAR_FRAME}
      locateNonce={locateNonce}
      insets={insets}
    />
  )
}

class StageBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  static contextType = LanguageContext
  declare context: Language
  private translate = translatorFor(() => this.context)
  state: { error: unknown } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  retry = async () => {
    await refresh((key) => key.startsWith('desk-map:'))
    this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="stage__error" role="alert">
        <Icon name="alert" size={20} />
        <p>{this.translate('theMapCouldntLoad')}</p>
        <button type="button" className="btn btn--secondary" onClick={this.retry}>{this.translate('tryAgain')}</button>
      </div>
    )
  }
}

function MetricToggle({ metric }: { metric: PinMetric }) {
  const t = useTranslation()
  const reduce = useReducedMotion()
  const options: Array<{ value: PinMetric; label: string }> = [
    { value: 'kcal', label: 'kcal' },
    { value: 'score', label: t('score') },
  ]
  return (
    <div className="seg" role="radiogroup" aria-label={t('valueShownOnMapPins')}>
      {options.map((o) => {
        const on = metric === o.value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className="seg__option" onClick={() => metricStore.set(o.value)}>
            {on && <motion.span layoutId="stage-metric" className="seg__indicator" transition={reduce ? { duration: 0 } : springTransition('state')} />}
            <span className="seg__label">
              {o.value === 'score' ? <Glyph name="score" size={15} /> : <Glyph name="flame" size={15} />}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function MapStage({
  filters,
  activeId,
  detailView,
  rightInset = 0,
  onCategory,
}: {
  filters: DishFilters
  activeId: string | null
  detailView: boolean
  /** Width of chrome covering the map's right edge. */
  rightInset?: number
  onCategory?: (category?: MapCategory) => void
}) {
  const t = useTranslation()
  const metric = useStore(metricStore)
  const position = usePosition()
  const [locateNonce, setLocateNonce] = useState(0)
  const key = useDeferredValue(filtersKey(filters))
  // Resume the overview with its deferred filters, including any selected category.
  const deferredDetailView = useDeferredValue(detailView)
  const stable = useMemo(() => JSON.parse(key) as DishFilters, [key])

  const locate = () => {
    if (position.status === 'granted') setLocateNonce((n) => n + 1)
    else openLocationPrompt()
  }
  const locateLabel =
    position.status === 'locating' ? t('locating') : position.status === 'denied' ? t('locationAccessBlocked') : t('nearMe')

  return (
    <section
      className={`stage ${key !== filtersKey(filters) ? 'is-stale' : ''}`}
      aria-label={t('map')}
      style={{ '--map-right-inset': `${rightInset}px` } as CSSProperties}
    >
      <StageBoundary>
        <Suspense fallback={<div className="score-map score-map--loading" aria-busy="true" />}>
          <Pins filters={stable} activeId={activeId} detailView={detailView || deferredDetailView} metric={metric} locateNonce={locateNonce} rightInset={rightInset} />
        </Suspense>
      </StageBoundary>
      <div className="stage__controls">
        <div className="stage__category">
          <MapCategoryFilter value={filters.mapCategory} onChange={onCategory} />
        </div>
        <MetricToggle metric={metric} />
        <button type="button" className={`stage__locate ${position.status === 'granted' ? 'is-on' : ''}`} onClick={locate} disabled={position.status === 'locating'}>
          <Glyph name="locate" size={18} filled={position.status === 'granted'} />
          <span>{position.status === 'granted' ? t('goToMyLocation') : locateLabel}</span>
        </button>
        <Link to={paths.snap()} className="stage__scan">
          <Icon name="camera" size={17} strokeWidth={1.8} />
          <span>{t('scanAMenu')}</span>
        </Link>
      </div>
    </section>
  )
}
