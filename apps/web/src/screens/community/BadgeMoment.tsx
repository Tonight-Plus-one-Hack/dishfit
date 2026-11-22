import { BADGE_COPY } from './community'
// The thank-you moment: a badge earned for the first scan, the first restaurant or 10 confirmations.
// Shown once per badge; closing it marks the badge as seen on the Worker.
import { useTranslation } from '../../i18n'
import { useEffect, useState } from 'react'
import { getMe, markBadgesSeen, type Badge } from '../../data/api'
import { Icon } from '../../components/Icon'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { BadgeMedal } from './shared'
import './community.css'

export function BadgeMoment({ badges, onClose }: { badges: Badge[]; onClose: () => void }) {
  const t = useTranslation()
  const [index, setIndex] = useState(0)
  const badge = badges[index]
  if (!badge) return null
  const last = index === badges.length - 1
  const close = () => {
    void markBadgesSeen(badges.map((b) => b.key)).catch(() => undefined)
    onClose()
  }
  return (
    <div className="cm-moment" role="dialog" aria-modal="true" aria-labelledby="cm-moment-title">
      <div className="cm-moment__card">
        <button className="cm-moment__close" onClick={close} aria-label={t('close')}>
          <Icon name="close" size={18} />
        </button>
        <div className="cm-moment__burst" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <BadgeMedal badge={badge.key} size={96} />
        <p className="cm-moment__eyebrow">{t('badgeUnlocked')}</p>
        <h2 className="cm-moment__title" id="cm-moment-title">
          {BADGE_COPY[badge.key] ? t(BADGE_COPY[badge.key].title) : badge.title}
        </h2>
        <p className="cm-moment__text">{BADGE_COPY[badge.key] ? t(BADGE_COPY[badge.key].text) : badge.text}</p>
        {last ? (
          <div className="cm-moment__actions">
            <button className="btn btn--primary btn--wide cm-pill" onClick={close}>{t('continue')}</button>
            <Link to={paths.me()} className="cm-moment__link" onClick={close}>{t('goToYourProfile')}</Link>
          </div>
        ) : (
          <button className="btn btn--primary btn--wide cm-pill" onClick={() => setIndex(index + 1)}>{t('nextBadge')}</button>
        )}
      </div>
    </div>
  )
}

/** Shows badges the Worker has but this device has not celebrated yet (e.g. after a scan). */
export function UnseenBadges() {
  const [badges, setBadges] = useState<Badge[]>([])
  useEffect(() => {
    let live = true
    getMe().then(
      (me) => live && setBadges(me.badges.filter((b) => !b.seen)),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [])
  if (badges.length === 0) return null
  return <BadgeMoment badges={badges} onClose={() => setBadges([])} />
}
