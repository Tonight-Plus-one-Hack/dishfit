// Map workspace of the desktop frame: the big map plus a right panel. The panel is a route, so it deep-links:
// / ranking (the start page, also /map), /entdecken Discover, /r/:id restaurant, /d/:id dish. The panel floats over the map as a frosted card
// (Apple Maps manner); on tablet it is a drawer that can be closed.
import { useTranslation } from '../../i18n'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { filtersKey, getDish } from '../../data/api'
import { useLocation, useSearchParams } from '../../lib/location'
import { usePosition } from '../../lib/position'
import { useProfile } from '../../lib/profile'
import { kiezFromParam, rankingFilters } from '../../lib/ranking'
import { springTransition } from '../../motion/transitions'
import { Boundary } from '../Boundary'
import { Screen } from '../Screen'
import { ShellModeContext, type Tier } from '../viewport'
import { defaultFilters, useGlobalFilters } from './globalFilters'
import { MapStage } from './MapStage'
import { RankingPanel, RankingPanelSkeleton } from './RankingPanel'
import type { WorkspaceRoute } from './workspaceRoute'

/** The restaurant of a dish, for the active pin; resolves without suspending the map. */
function useDishRestaurant(dishId: string | null): string | null {
  const [found, setFound] = useState<{ dish: string; restaurant: string } | null>(null)
  useEffect(() => {
    if (!dishId) return
    let live = true
    getDish(dishId).then(
      (d) => live && setFound({ dish: dishId, restaurant: d.restaurant.id }),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [dishId])
  return dishId && found?.dish === dishId ? found.restaurant : null
}

function PanelSkeleton() {
  return <RankingPanelSkeleton />
}

/** Width an element covers from the right edge of its offset parent, kept current. */
function useRightCover() {
  const [cover, setCover] = useState(0)
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) {
      setCover(0)
      return
    }
    const parent = el.offsetParent as HTMLElement | null
    const measure = () => setCover(parent ? parent.clientWidth - el.offsetLeft : el.offsetWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, cover] as const
}

export function Workspace({ route, tier }: { route: WorkspaceRoute; tier: Tier }) {
  const t = useTranslation()
  const { pathname } = useLocation()
  const params = useSearchParams()
  const [filters, setFilters, home] = useGlobalFilters()
  const { position, status } = usePosition()
  const profile = useProfile()
  const reduce = useReducedMotion()
  const drawer = tier === 'tablet'
  // The drawer closes for one route only: opening another panel route shows it again.
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [drawerRef, drawerCover] = useRightCover()

  // Discover ranks by Kiez only (under 12 EUR, by protein); the map list follows every global filter.
  const homeKiez = kiezFromParam(params.get('kiez'), home)
  const choice = route.name === 'home' ? defaultFilters(homeKiez) : filters
  const query = { ...rankingFilters({ ...choice, near: position, distanceBands: status === 'granted', goal: profile?.goal, diet: profile?.diet }), mapCategory: route.name === 'map' ? choice.mapCategory : undefined }

  const dishRestaurant = useDishRestaurant(route.name === 'dish' ? route.id : null)
  const detailView = route.name === 'restaurant' || route.name === 'dish'
  const activeId =
    route.name === 'restaurant' ? route.id : route.name === 'dish' ? dishRestaurant : route.name === 'map' ? params.get('r') : null

  let panel: ReactNode
  if (route.name === 'map') panel = <RankingPanel key={filtersKey(query)} filters={query} choice={filters} onReset={() => setFilters({ ...defaultFilters(home), mapCategory: undefined })} />
  else panel = <Screen route={route} />

  const open = !drawer || closedAt !== pathname
  const label = route.name === 'home' ? t('discover') : route.name === 'map' ? t('rankings') : route.name === 'restaurant' ? t('restaurant') : t('dish')

  return (
    <div className={`ws ${drawer ? 'ws--drawer' : 'ws--docked'} ${open ? 'is-open' : ''}`}>
      <MapStage
        filters={query}
        activeId={activeId}
        detailView={detailView}
        rightInset={open ? drawerCover : 0}
        onCategory={detailView ? undefined : (mapCategory) => setFilters({ kiez: choice.kiez, mapCategory })}
      />

      {drawer && !open && (
        <button type="button" className="ws__reopen" onClick={() => setClosedAt(null)}>
          <Icon name="list" size={18} strokeWidth={1.8} />
          {t('showPanel', label)}</button>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            key="panel"
            ref={drawerRef}
            className="ws__panel"
            aria-label={label}
            initial={drawer && !reduce ? { x: 32, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: 32, opacity: 0 }}
            transition={springTransition('appear')}
          >
            {drawer && (
              <button type="button" className="ws__close" onClick={() => setClosedAt(pathname)} aria-label={t('hide1', label)}>
                <Icon name="close" size={18} strokeWidth={1.8} />
              </button>
            )}
            <div className="ws__scroll" key={pathname}>
              <ShellModeContext.Provider value="panel">
                <Boundary key={pathname}>
                  <Suspense fallback={<PanelSkeleton />}>{panel}</Suspense>
                </Boundary>
              </ShellModeContext.Provider>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
