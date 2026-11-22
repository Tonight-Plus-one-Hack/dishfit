// Restaurants whose name, cuisine or Kiez match the search text, above the dish results.
// Restaurant-level filters (Kiez, open now, distance) still apply; the count shows how many dishes pass all filters.
import { useTranslation, translate } from '../../i18n'
import { Icon } from '../../components/Icon'
import { OpenState, RestaurantName } from '../../components/ui'
import { filtersKey, listRestaurants, type DishFilters, type RestaurantSummary } from '../../data/api'
import { formatCuisine } from '../../lib/cuisine'
import { formatDistance } from '../../lib/format'
import { useResource } from '../../lib/resource'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { matchingRestaurants } from '../../lib/search-text'
import { KEY_PREFIX } from './queries'

const MAX_SHOWN = 3

function dishCount(r: RestaurantSummary): string {
  if (r.totalDishes === 0) return translate('noMenuYet')
  if (r.matchingDishes === r.totalDishes) return translate('count1Dishes', r.totalDishes)
  return translate('count1Of2DishesMatch', r.matchingDishes, r.totalDishes)
}

export function RestaurantMatches({ filters, q }: { filters: DishFilters; q: string }) {
  const t = useTranslation()
  const query = { ...filters, sort: 'distance' as const, limit: undefined }
  const all = useResource(`${KEY_PREFIX}restaurants:${filtersKey(query)}`, () => listRestaurants(query))
  const found = matchingRestaurants(all, q)
  if (found.length === 0) return null
  return (
    <section className="search-section" aria-labelledby="restaurants-title">
      <h2 id="restaurants-title" className="t-label">{t('restaurants')}{' '}{found.length}
      </h2>
      <ul className="place-list">
        {found.slice(0, MAX_SHOWN).map((r) => (
          <li key={r.id}>
            <Link to={paths.restaurant(r.id)} className="place-row">
              <span className="place-row__body">
                <span className="place-row__name">
                  <RestaurantName restaurant={r} />
                </span>
                <span className="place-row__meta">
                  <span>{r.kiez}</span>
                  <span>{formatCuisine(r.cuisine)}</span>
                  {r.distance !== null && <span>{formatDistance(r.distance)}</span>}
                </span>
                <span className="place-row__meta">
                  <OpenState open={r.openNow} />
                  <span>{dishCount(r)}</span>
                </span>
              </span>
              <Icon name="chevronRight" size={18} className="place-row__chevron" />
            </Link>
          </li>
        ))}
      </ul>
      {found.length > MAX_SHOWN && (
        <p className="t-label place-list__more">{t('and')}{' '}{found.length - MAX_SHOWN}{' '}{t('moreRefineYourSearchToSee')}</p>
      )}
    </section>
  )
}
