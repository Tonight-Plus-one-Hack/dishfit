// Guest contributions on the restaurant page: dishes that came online from a menu photo ("Community" + date),
// and the "Speisekarte scannen" entry into the snap flow (src/screens/snap).
import { dishDescription } from '../../lib/menu-copy'
import { localizedFormatter, useTranslation } from '../../i18n'
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { communityDishes, type CommunityDish, type Restaurant } from '../../data/api'
import { formatPrice } from '../../lib/format'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import './community.css'

const day = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }))

/** Loads without suspending: when the Worker is not reachable the section simply stays hidden. */
function useCommunityDishes(restaurantId: string): CommunityDish[] {
  const [dishes, setDishes] = useState<CommunityDish[]>([])
  useEffect(() => {
    let live = true
    void communityDishes(restaurantId).then((d) => live && setDishes(d))
    return () => {
      live = false
    }
  }, [restaurantId])
  return dishes
}

export function CommunityBadge({ addedAt }: { addedAt: string }) {
  const t = useTranslation()
  return (
    <span className="community-badge">
      <Icon name="users" size={12} strokeWidth={1.8} />{t('community')}<span className="community-badge__date">· {day().format(new Date(addedAt))}</span>
    </span>
  )
}

export function CommunityDishes({ restaurant }: { restaurant: Restaurant }) {
  const t = useTranslation()
  const dishes = useCommunityDishes(restaurant.id)
  if (dishes.length === 0) return null
  return (
    <section className="community" aria-labelledby="community-title">
      <div className="community__head">
        <h2 id="community-title" className="detail-title">{t('fromTheCommunity')}</h2>
        <span className="t-label">{dishes.length}</span>
      </div>
      <p className="t-muted community__hint">{t('fromMenuPhotosSubmittedByGuests')}</p>
      <ul className="community__list">
        {dishes.map((d) => (
          <li key={d.id} className="community-dish">
            <div className="community-dish__top">
              <span className="community-dish__name">{d.name}</span>
              <span className="community-dish__price">{formatPrice(d.priceCents === null ? null : d.priceCents / 100)}</span>
            </div>
            {dishDescription(d) && <p className="community-dish__desc">{dishDescription(d)}</p>}
            <p className="macro-line">
              <span>
                <b>{t('approximate')}{' '}{Math.round(d.kcal)}</b> kcal
              </span>
              <span>
                <b>{t('approximate')}{' '}{Math.round(d.proteinG)} g</b>{' '}{t('protein')}</span>
            </p>
            <CommunityBadge addedAt={d.addedAt} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The way in: photograph this restaurant's menu. Primary when we have no menu yet. */
export function ScanCard({ restaurant, primary = false }: { restaurant: Restaurant; primary?: boolean }) {
  const t = useTranslation()
  const to = paths.snap({ id: restaurant.id, name: restaurant.name })
  if (primary) {
    return (
      <Link to={to} className="btn btn--primary">
        <Icon name="camera" size={16} />{t('scanAMenu')}</Link>
    )
  }
  return (
    <section className="scan-card" aria-labelledby="scan-title">
      <span className="scan-card__icon" aria-hidden="true">
        <Icon name="camera" size={20} />
      </span>
      <div className="scan-card__text">
        <h2 id="scan-title" className="scan-card__title">{t('areYouHereRightNow')}</h2>
        <p className="t-muted">{t('takeAPhotoOfTheMenu')}</p>
      </div>
      <Link to={to} className="btn btn--secondary scan-card__btn">{t('scanAMenu')}</Link>
    </section>
  )
}
