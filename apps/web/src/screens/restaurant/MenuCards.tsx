// Menu cards for the restaurant screen: one big "tip" card and the list card per dish.
import { dishDescription } from '../../lib/menu-copy'
import { useTranslation } from '../../i18n'
import { DishThumb, ScoreRing, SourceBadge, TestBadge } from '../../components/ui'
import type { Dish } from '../../data/contract'
import { formatNumber, formatPrice, formatRange } from '../../lib/format'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import type { MenuSort } from './info'

function Approx({ dish }: { dish: Dish }) {
  const t = useTranslation()
  return dish.nutrition.source === 'ai' ? <small className="approx">{t('approximate')}</small> : null
}

/** List card: name, description, price and protein per euro beside the art, kcal with its range and macros below. */
export function MenuDishCard({ dish, sort }: { dish: Dish; sort: MenuSort }) {
  const t = useTranslation()
  const n = dish.nutrition
  return (
    <Link to={paths.dish(dish.id)} className="menu-card">
      <span className="menu-card__top">
        <span className="menu-card__text">
          <span className="menu-card__name">{dish.name}</span>
          {dishDescription(dish) && <span className="menu-card__desc">{dishDescription(dish)}</span>}
          <span className="menu-card__price-row">
            <span className={`menu-card__price ${sort === 'price' ? 'is-key' : ''}`}>{formatPrice(dish.price)}</span>
            {dish.proteinPerEuro !== null && (
              <span className={`menu-card__ppe ${sort === 'proteinPerEuro' ? 'is-key' : ''}`}>
                {formatNumber(dish.proteinPerEuro)}{' '}{t('dishHeroCardGProtein')}</span>
            )}
          </span>
        </span>
        <span className="menu-card__media">
          <DishThumb dish={dish} className="menu-card__thumb" />
          <span className="menu-card__score">
            <ScoreRing score={dish.healthScore} size={34} />
          </span>
        </span>
      </span>
      <span className="menu-card__stats">
        <span className={`menu-stat menu-stat--kcal ${sort === 'kcal' ? 'is-key' : ''}`}>
          <span className="menu-stat__value">
            <Approx dish={dish} />
            {n.kcal.value}
            <small> kcal</small>
          </span>
          <span className="menu-stat__label">{formatRange(n.kcal, 'kcal')}</span>
        </span>
        <span className={`menu-stat ${sort === 'protein' ? 'is-key' : ''}`}>
          <span className="menu-stat__value menu-stat__value--protein">
            {n.protein.value}
            <small> g</small>
          </span>
          <span className="menu-stat__label">{t('protein')}</span>
        </span>
        <span className="menu-stat">
          <span className="menu-stat__value">
            {n.carbs.value}
            <small> g</small>
          </span>
          <span className="menu-stat__label">{t('menuCardsCarbs')}</span>
        </span>
        <span className="menu-stat">
          <span className="menu-stat__value">
            {n.fat.value}
            <small> g</small>
          </span>
          <span className="menu-stat__label">{t('fat')}</span>
        </span>
      </span>
      <span className="menu-card__badges">
        <SourceBadge nutrition={n} isTestData={dish.isTestData} />
        {dish.isTestData && <TestBadge />}
      </span>
    </Link>
  )
}

/** Big card for the best dish of the restaurant. */
export function TipCard({ dish }: { dish: Dish }) {
  const t = useTranslation()
  const n = dish.nutrition
  return (
    <Link to={paths.dish(dish.id)} className="tip-card">
      <span className="tip-card__media">
        <DishThumb dish={dish} className="tip-card__thumb" />
        <span className="tip-card__price">{formatPrice(dish.price)}</span>
        <span className="tip-card__score">
          <ScoreRing score={dish.healthScore} size={44} />
        </span>
      </span>
      <span className="tip-card__body">
        <span className="t-label">{t('ourPickHereHighestHealthScore')}</span>
        <span className="tip-card__name">{dish.name}</span>
        <span className="tip-card__chips">
          <span className="tag">
            {n.source === 'ai' && t('approximatePrefix')}
            {n.kcal.value} kcal
          </span>
          <span className="tag tag--protein">{n.protein.value}{' '}{t('cameraScreenGProtein')}</span>
          {dish.proteinPerEuro !== null && <span className="tag">{formatNumber(dish.proteinPerEuro)} g/€</span>}
          <SourceBadge nutrition={n} isTestData={dish.isTestData} compact />
          {dish.isTestData && <TestBadge />}
        </span>
      </span>
    </Link>
  )
}
