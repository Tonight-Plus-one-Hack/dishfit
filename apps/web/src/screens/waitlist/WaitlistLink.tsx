import { Icon } from '../../components/Icon'
import { useTranslation } from '../../i18n'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { persisted, useStore } from '../../lib/store'
import './waitlist.css'

const dismissed = persisted('dishfit.waitlist.map.dismissed', false)
export function WaitlistLink() {
  const t = useTranslation()
  return <Link className="waitlist-link" to={paths.waitlist()}>{t('waitlistTitle')}</Link>
}

export function WaitlistMapRow() {
  const hidden = useStore(dismissed)
  const t = useTranslation()
  if (hidden) return null
  return (
    <div className="waitlist-map-row">
      <WaitlistLink />
      <button type="button" onClick={() => dismissed.set(true)} aria-label={t('waitlistDismiss')}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
