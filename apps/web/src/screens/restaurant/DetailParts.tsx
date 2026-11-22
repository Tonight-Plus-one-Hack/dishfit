// Pieces shared by the restaurant and dish screens: the scroll-in header title and the error state.
import { useTranslation, translate } from '../../i18n'
import type { ReactNode } from 'react'
import { ScreenHeader } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import { isHidden, isNotFound } from '../../data/api'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'

export function HeaderTitle({ shown, children }: { shown: boolean; children: ReactNode }) {
  return <span className={`detail-head-title ${shown ? 'is-shown' : ''}`}>{children}</span>
}

/** Copy for a record the healthy rule hides: we know it, we just do not list it. */
const HIDDEN_COPY = {
  Restaurant: {
    get title() { return translate('thisRestaurantIsCurrentlyHidden') },
    get text() { return translate('weListRestaurantsWithAtLeast') },
  },
  Gericht: {
    get title() { return translate('thisDishIsCurrentlyHidden') },
    get text() { return translate('weShowHealthyDishesSoPizza') },
  },
} as const

export function DetailError({ error, retry, what }: { error: unknown; retry: () => void; what: 'Restaurant' | 'Gericht' }) {
  const t = useTranslation()
  const missing = isNotFound(error)
  const hidden = isHidden(error) ? HIDDEN_COPY[what] : null
  return (
    <>
      <ScreenHeader title="" backTo={paths.start()} />
      <div className="empty-state detail-error" role="alert">
        <span className="icon-badge" aria-hidden="true">
          <Icon name={missing ? 'search' : 'alert'} size={18} />
        </span>
        <p className="t-label">{hidden ? t('unavailable') : missing ? t('notFound') : t('error')}</p>
        <h1 className="t-section">
          {hidden
            ? hidden.title
            : missing
              ? what === 'Restaurant'
                ? t('weDontKnowThisRestaurant')
                : t('weDontKnowThisDish')
              : t('somethingWentWrong')}
        </h1>
        <p className="t-muted">
          {hidden
            ? hidden.text
            : missing
              ? t('theLinkMayBeOldOr')
              : t('weCouldntLoadTheDataCheck')}
        </p>
        <div className="detail-error__actions">
          {missing ? (
            <Link to={paths.map()} className="btn btn--primary">{t('viewMap')}</Link>
          ) : (
            <button className="btn btn--primary" onClick={retry}>{t('tryAgain')}</button>
          )}
          <Link to={paths.discover()} className="btn btn--secondary">{t('discover')}</Link>
        </div>
      </div>
    </>
  )
}
