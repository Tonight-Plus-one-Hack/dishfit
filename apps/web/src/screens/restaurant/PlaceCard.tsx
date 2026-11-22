// Restaurant header in the Cal AI manner: round avatar, name, chips (open state, Kiez, price level from our
// own menu prices), a rounded mini map with our pin and nearby restaurants, and a pill bar with distance and Route.
// Never shows Google rating, price level or photos; those appear live in GooglePlaceBlock only.
import { useTranslation, translate } from '../../i18n'
import { lazy, Suspense, useMemo, useRef, type Ref, type RefObject } from 'react'
import { Art } from '../../components/glyphs/Art'
import { Glyph } from '../../components/glyphs/Glyph'
import { restaurantIcon } from '../../lib/category'
import { formatCuisine } from '../../lib/cuisine'
import { TestBadge } from '../../components/ui'
import { listRestaurants, type Dish, type Restaurant } from '../../data/api'
import { track } from '../../lib/analytics'
import { formatDistance, walkMinutes } from '../../lib/format'
import { distance } from '../../lib/geo'
import { usePosition } from '../../lib/position'
import { useResource } from '../../lib/resource'
import { navigate, paths } from '../../lib/routes'
import { routeUrl } from './info'
import './place-card.css'

const MiniMap = lazy(() => import('../../components/MiniMap'))

const NEIGHBOUR_RADIUS_M = 700
const BAR_INSET = 76

/** €, €€ or €€€ from the median menu price; null without prices. Our own data, not Google's price level. */
function priceLevel(dishes: Dish[]): { symbol: string; label: string } | null {
  const prices = dishes
    .map((d) => d.price)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b)
  if (prices.length === 0) return null
  const median = prices[Math.floor(prices.length / 2)]
  if (median < 10) return { symbol: '€', label: translate('inexpensive') }
  if (median < 16) return { symbol: '€€', label: translate('moderate') }
  return { symbol: '€€€', label: translate('upscale') }
}

function Neighbours({ restaurant, routeBar }: { restaurant: Restaurant; routeBar: RefObject<HTMLDivElement | null> }) {
  const near = { lat: restaurant.lat, lng: restaurant.lng }
  const found = useResource(`place-near:${restaurant.id}`, () => listRestaurants({ near, maxDistance: NEIGHBOUR_RADIUS_M, limit: 8 }))
  const place = useMemo(
    () => ({ id: restaurant.id, name: restaurant.name, lat: restaurant.lat, lng: restaurant.lng, category: restaurantIcon(restaurant) }),
    [restaurant],
  )
  const neighbours = useMemo(
    () => found.filter((r) => r.id !== restaurant.id).map((r) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, category: restaurantIcon(r) })),
    [found, restaurant.id],
  )
  return <MiniMap place={place} neighbours={neighbours} onOpen={(id) => navigate(paths.restaurant(id))} bottomInset={BAR_INSET} routeBar={routeBar} />
}

export function PlaceCard({
  restaurant,
  dishes,
  open,
  titleRef,
}: {
  restaurant: Restaurant
  dishes: Dish[]
  open: boolean | null
  titleRef: Ref<HTMLHeadingElement>
}) {
  const t = useTranslation()
  const level = priceLevel(dishes)
  const routeBar = useRef<HTMLDivElement>(null)
  // Without a shared position the app counts from Moritzplatz, and says so.
  const { position, status } = usePosition()
  const metres = distance(position, restaurant)
  return (
    <header className="place">
      <span className="place__avatar" aria-hidden="true">
        <Art name={`cat-${restaurantIcon(restaurant)}`} size={76} />
      </span>
      <h1 className="place__name" ref={titleRef}>
        {restaurant.name}
      </h1>
      <p className="place__cuisine">
        {formatCuisine(restaurant.cuisine)}
        {restaurant.isTestData && <TestBadge />}
      </p>
      <ul className="place__chips">
        {open !== null && (
          <li className={`place-tag ${open ? 'place-tag--open' : 'place-tag--closed'}`}>{open ? t('open') : t('closed')}</li>
        )}
        <li className="place-tag place-tag--plain">
          <Glyph name="pin" size={18} />
          {restaurant.kiez}
        </li>
        {level && (
          <li className="place-tag place-tag--plain" aria-label={t('priceLevel1BasedOnThe', level.label)}>
            <Glyph name="euro" size={18} />
            {level.symbol}
          </li>
        )}
      </ul>

      <div className="place__map">
        <Suspense fallback={<span className="place__map-loading" aria-hidden="true" />}>
          <Neighbours restaurant={restaurant} routeBar={routeBar} />
        </Suspense>
        <div className="place__bar" ref={routeBar}>
          <span className="place__distance">
            <Glyph name="route" size={20} filled={false} />
            <span>
              {status === 'granted' ? t('count1Away2', formatDistance(metres), walkMinutes(metres)) : t('count1FromMoritzplatz', formatDistance(metres))}
            </span>
          </span>
          <a
            href={routeUrl(restaurant)}
            target="_blank"
            rel="noreferrer"
            className="btn-brand"
            onClick={() => track('directions_tap')}
            onAuxClick={(e) => e.button === 1 && track('directions_tap')}
          >
            {t('directions')}
          </a>
        </div>
      </div>
    </header>
  )
}
