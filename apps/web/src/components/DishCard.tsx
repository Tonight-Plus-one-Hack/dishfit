// Dish cards for feeds, search results and menus.
import type { DishResult } from '../data/contract'
import { formatDistance, formatPrice } from '../lib/format'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import { DishThumb, MacroLine, RestaurantName, ScoreRing, SourceBadge, TestBadge } from './ui'
import './dish-card.css'

/** Tall card for horizontal rails: art, name, restaurant, kcal and protein, price. */
export function DishTile({ result }: { result: DishResult }) {
  const { dish, restaurant, distance } = result
  return (
    <Link to={paths.dish(dish.id)} className="dish-tile">
      <span className="dish-tile__media">
        <DishThumb dish={dish} className="dish-tile__thumb" />
        <span className="dish-tile__price">{formatPrice(dish.price)}</span>
        <span className="dish-tile__score">
          <ScoreRing score={dish.healthScore} size={36} />
        </span>
      </span>
      <span className="dish-tile__body">
        <span className="dish-tile__name">{dish.name}</span>
        <span className="dish-tile__meta">
          {restaurant.name}
          {distance !== null && ` · ${formatDistance(distance)}`}
        </span>
        <MacroLine dish={dish} showPrice={false} />
        <span className="dish-tile__badges">
          <SourceBadge nutrition={dish.nutrition} isTestData={dish.isTestData} compact />
          {dish.isTestData && <TestBadge />}
        </span>
      </span>
    </Link>
  )
}

/** Full-width row for lists. */
export function DishRow({ result, showRestaurant = true }: { result: DishResult; showRestaurant?: boolean }) {
  const { dish, restaurant, distance } = result
  return (
    <Link to={paths.dish(dish.id)} className="dish-row">
      <DishThumb dish={dish} className="dish-row__thumb" />
      <span className="dish-row__body">
        <span className="dish-row__name">{dish.name}</span>
        {showRestaurant && (
          <span className="dish-row__meta">
            <RestaurantName restaurant={restaurant} />
            {distance !== null && <span> · {formatDistance(distance)}</span>}
          </span>
        )}
        <MacroLine dish={dish} />
        <SourceBadge nutrition={dish.nutrition} isTestData={dish.isTestData} compact />
      </span>
      <ScoreRing score={dish.healthScore} size={36} />
    </Link>
  )
}
