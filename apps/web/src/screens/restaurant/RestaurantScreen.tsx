// Restaurant detail: facts, route, the menu grouped by section with a sort, our opening hours and live Google content.
import { useTranslation } from '../../i18n'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import { ScreenBoundary } from '../../components/ScreenBoundary'
import { ShareSheet, type ShareTarget } from '../../components/ShareSheet'
import { DetailError, HeaderTitle } from './DetailParts'
import { useShare, useTitleShown } from './hooks'
import { getRestaurant, type Dish, type Restaurant } from '../../data/api'
import { isOpenAt } from '../../data/hours'
import { track } from '../../lib/analytics'
import { formatPrice } from '../../lib/format'
import { menuSection } from '../../lib/menu-copy'
import { useSearchParams } from '../../lib/location'
import { prefersReducedMotion } from '../../lib/motion'
import { useResource } from '../../lib/resource'
import { navigate, paths } from '../../lib/routes'
import { framer } from '../../motion'
import { GooglePlaceBlock } from './GooglePlaceBlock'
import {
  MENU_SORTS,
  formatDate,
  formatOpeningHours,
  groupMenu,
  hostOf,
  isMenuSort,
  sectionId,
  sourceKind,
  type MenuSort,
} from './info'
import { MenuDishCard, TipCard } from './MenuCards'
import { PlaceCard } from './PlaceCard'
import { Art } from '../../components/glyphs/Art'
import { CommunityDishes, ScanCard } from './Community'
import './detail.css'
import './restaurant.css'

const { Reveal } = framer

function SortChips({ sort, hasPrices, onChange }: { sort: MenuSort; hasPrices: boolean; onChange: (sort: MenuSort) => void }) {
  const t = useTranslation()
  return (
    <div className="sort-chips" role="group" aria-label={t('sortDishes')}>
      {MENU_SORTS.map((s) => {
        const disabled = !hasPrices && (s.key === 'price' || s.key === 'proteinPerEuro')
        return (
          <button
            key={s.key}
            className="chip"
            aria-pressed={sort === s.key}
            disabled={disabled}
            title={disabled ? t('theMenuDoesntListPrices') : s.hint}
            onClick={() => onChange(s.key)}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/** Sticky section chips that jump to a menu section and follow the scroll position. */
function SectionNav({ sections }: { sections: string[] }) {
  const t = useTranslation()
  const [active, setActive] = useState(sections[0])
  const nav = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The active section is the last one whose top has passed under the sticky header and chips.
    let frame = 0
    const update = () => {
      frame = 0
      const line = (nav.current?.getBoundingClientRect().bottom ?? 0) + 24
      let current = sections[0]
      for (const s of sections) {
        const el = document.getElementById(sectionId(s))
        if (el && el.getBoundingClientRect().top <= line) current = s
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [sections])

  useEffect(() => {
    // Scroll only the chip track sideways; scrollIntoView would also move the page.
    const track = nav.current?.querySelector<HTMLElement>('.section-nav__track')
    const chip = track?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!track || !chip) return
    const left = chip.offsetLeft - (track.clientWidth - chip.offsetWidth) / 2
    track.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [active])

  return (
    <div className="section-nav" ref={nav}>
      <nav className="section-nav__track" aria-label={t('menuSections')}>
        {sections.map((s) => (
          <button
            key={s}
            className="section-nav__chip"
            aria-current={active === s ? 'true' : undefined}
            onClick={() => {
              setActive(s)
              document
                .getElementById(sectionId(s))
                ?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
            }}
          >
            {menuSection(s)}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Menu({ restaurant, dishes }: { restaurant: Restaurant; dishes: Dish[] }) {
  const t = useTranslation()
  const params = useSearchParams()
  const hasPrices = dishes.some((d) => d.price !== null)
  const requested = params.get('sort')
  const fallback: MenuSort = hasPrices ? 'proteinPerEuro' : 'protein'
  const sort: MenuSort =
    isMenuSort(requested) && (hasPrices || (requested !== 'price' && requested !== 'proteinPerEuro')) ? requested : fallback
  const groups = useMemo(() => groupMenu(dishes, sort), [dishes, sort])
  const sections = useMemo(() => groups.map((g) => g.section), [groups])
  const tip = useMemo(() => [...dishes].sort((a, b) => b.healthScore - a.healthScore)[0], [dishes])
  const hint = MENU_SORTS.find((s) => s.key === sort)?.hint

  const setSort = (next: MenuSort) =>
    navigate(`${paths.restaurant(restaurant.id)}${next === fallback ? '' : `?sort=${next}`}`, { replace: true })

  return (
    <section className="menu" aria-labelledby="menu-title">
      <div className="menu__head">
        <h2 id="menu-title" className="detail-title">{t('menu')}</h2>
        <span className="t-label">{dishes.length}{' '}{t('dishes')}</span>
      </div>
      {restaurant.menu && <MenuSourceLine restaurant={restaurant} />}

      <Reveal className="menu__tip">
        <TipCard dish={tip} />
      </Reveal>

      <div className="menu__controls">
        <SortChips sort={sort} hasPrices={hasPrices} onChange={setSort} />
        <p className="menu__hint t-muted" aria-live="polite">
          {hint}
          {!hasPrices && t('restaurantScreenTheMenuDoesntListPrices')}
        </p>
      </div>

      {sections.length > 1 && <SectionNav sections={sections} />}

      {groups.map((g) => (
        <section key={menuSection(g.section)} id={sectionId(g.section)} className="menu__section" aria-label={menuSection(g.section)}>
          <h3 className="menu__section-title">
            {menuSection(g.section)}
            <span className="t-label">{g.dishes.length}</span>
          </h3>
          <ul className="menu__list">
            {g.dishes.map((dish) => (
              <Reveal as="li" key={dish.id} y={20} amount={0.2}>
                <MenuDishCard dish={dish} sort={sort} />
              </Reveal>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

function MenuSourceLine({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslation()
  const menu = restaurant.menu
  if (!menu) return null
  const read = t('readOn1', formatDate(menu.fetchedAt))
  if (restaurant.isTestData) {
    return (
      <p className="source-line">
        <Icon name="info" size={14} />
        <span>{t('testDataFictionalMenu')}{' '}{read}</span>
      </p>
    )
  }
  return (
    <p className="source-line">
      <Icon name="globe" size={14} />
      <span>
        {t('source')}{' '}
        <a
          href={menu.url}
          target="_blank"
          rel="noreferrer"
          className="source-line__link"
          onClick={() => track('menu_tap')}
          onAuxClick={(e) => e.button === 1 && track('menu_tap')}
        >
          {hostOf(menu.url)}
          <Icon name="arrowUpRight" size={12} />
        </a>{' '}
        ({sourceKind(menu)}) · {read}
      </span>
    </p>
  )
}

function NoMenu({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslation()
  return (
    <section className="no-menu" aria-labelledby="menu-title">
      <Art name="empty-no-menu" size={120} className="no-menu__art" />
      <h2 id="menu-title" className="detail-title">{t('noMenuYet')}</h2>
      <p className="t-muted">{t('weHaventReadThisRestaurantsMenu')}</p>
      <div className="no-menu__actions">
        <ScanCard restaurant={restaurant} primary />
        {restaurant.website && (
          <a href={restaurant.website} target="_blank" rel="noreferrer" className="btn btn--secondary">{t('seeTheMenuOnTheWebsite')}<Icon name="arrowUpRight" size={14} />
          </a>
        )}
      </div>
    </section>
  )
}

function Hours({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslation()
  const lines = restaurant.openingHours?.weekdayText ?? []
  return (
    <section className="hours" aria-labelledby="hours-title">
      <h2 id="hours-title" className="detail-title">{t('openingHours')}</h2>
      {lines.length === 0 ? (
        <p className="t-muted">{t('openingHoursAreUnknownCheckBefore')}</p>
      ) : (
        <dl className="hours__list">
          {lines.map((line) => {
            const { days, times } = formatOpeningHours(line)
            return (
              <div key={line} className="hours__row">
                <dt>{days}</dt>
                <dd>{times}</dd>
              </div>
            )
          })}
        </dl>
      )}
      <p className="hours__source t-muted">
        {restaurant.baseSource === 'osm' && restaurant.osmId ? (
          <>{t('addressAndHours')}{' '}
            <a href={`https://www.openstreetmap.org/${restaurant.osmId}`} target="_blank" rel="noreferrer">{t('openstreetmapContributors')}</a>
          </>
        ) : restaurant.baseSource === 'test' ? (
          t('testDataFictionalLocationAndHours')
        ) : (
          t('addressAndHoursFromTheRestaurants')
        )}
      </p>
    </section>
  )
}

function Content({ id }: { id: string }) {
  const t = useTranslation()
  const { restaurant, dishes } = useResource(`restaurant:${id}`, () => getRestaurant(id))
  useEffect(() => track('restaurant_view'), [id])
  const [titleRef, titleShown] = useTitleShown()
  const [shareTarget, share, closeShare] = useShare()
  const open = isOpenAt(restaurant.openingHours)
  const prices = dishes.map((d) => d.price).filter((p): p is number => p !== null)
  const maxProtein = dishes.reduce((m, d) => Math.max(m, d.nutrition.protein.value), 0)
  const target: ShareTarget = {
    title: restaurant.name,
    text: t('letsEatHere12', restaurant.name, restaurant.kiez),
    url: `${window.location.origin}${paths.restaurant(restaurant.id)}`,
    meta: `${restaurant.kiez} · ${restaurant.address}`,
  }

  return (
    <>
      <ScreenHeader
        title={<HeaderTitle shown={titleShown}>{restaurant.name}</HeaderTitle>}
        backTo={paths.map(restaurant.id)}
        actions={
          <button className="screen-head__back" onClick={() => share(target)} aria-label={t('shareRestaurant')}>
            <Icon name="share" size={18} />
          </button>
        }
      />
      <div className="page detail">
        <Reveal className="r-place" trigger="mount">
          <PlaceCard restaurant={restaurant} dishes={dishes} open={open} titleRef={titleRef} />
        </Reveal>

        <Reveal className="r-actions" trigger="mount" delay={60}>
          {restaurant.website && (
            <a
              href={restaurant.website}
              target="_blank"
              rel="noreferrer"
              className="btn btn--secondary"
              onClick={() => track('menu_tap')}
              onAuxClick={(e) => e.button === 1 && track('menu_tap')}
            >
              {restaurant.logoUrl ? <img className="r-actions__logo" src={restaurant.logoUrl} width={24} height={24} alt="" /> : <Icon name="globe" size={16} />}
              {t('website')}
            </a>
          )}
          <button className="btn btn--secondary r-actions__share" onClick={() => share(target)}>
            <Icon name="share" size={16} />{t('share')}</button>
        </Reveal>

        {dishes.length > 0 && (
          <Reveal className="r-stats" trigger="mount" delay={120}>
            <span className="r-stat">
              <b>{dishes.length}</b>
              <span>{t('dishes')}</span>
            </span>
            <span className="r-stat">
              <b>{t('upToGrams', maxProtein)}</b>
              <span>{t('protein')}</span>
            </span>
            <span className="r-stat">
              <b>{prices.length ? t('fromPrice', formatPrice(Math.min(...prices))) : t('atTheRestaurant')}</b>
              <span>{t('price')}</span>
            </span>
          </Reveal>
        )}

        {dishes.length > 0 ? <Menu restaurant={restaurant} dishes={dishes} /> : <NoMenu restaurant={restaurant} />}

        <CommunityDishes restaurant={restaurant} />
        {dishes.length > 0 && <ScanCard restaurant={restaurant} />}

        <GooglePlaceBlock restaurant={restaurant} />
        <Hours restaurant={restaurant} />

        <p className="detail-note t-muted">{t('restaurantScreenNutritionValuesAreEstimatedFromThe')}</p>
      </div>
      <ShareSheet target={shareTarget} onClose={closeShare} />
    </>
  )
}

function Skeleton() {
  const t = useTranslation()
  return (
    <>
      <ScreenHeader title="" backTo={paths.map()} />
      <div className="page detail" aria-busy="true" aria-label={t('loadingRestaurant')}>
        <div className="r-hero">
          <span className="skeleton sk-line" style={{ width: 140 }} />
          <span className="skeleton sk-title" />
          <span className="skeleton sk-line" style={{ width: 220 }} />
        </div>
        <div className="r-actions">
          <span className="skeleton sk-btn" />
          <span className="skeleton sk-btn" />
        </div>
        <span className="skeleton sk-stats" />
        <span className="skeleton sk-card sk-card--tall" />
        <span className="skeleton sk-card" />
        <span className="skeleton sk-card" />
      </div>
    </>
  )
}

export function RestaurantScreen({ id }: { id: string }) {
  return (
    <AppShell tab={null}>
      <ScreenBoundary keys={[`restaurant:${id}`]} fallback={(error, retry) => <DetailError error={error} retry={retry} what="Restaurant" />}>
        <Suspense fallback={<Skeleton />}>
          <Content id={id} />
        </Suspense>
      </ScreenBoundary>
    </AppShell>
  )
}

