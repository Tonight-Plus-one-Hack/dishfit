// Community profile (/me): the device profile's nickname, stats, badges and contributions
// (scanned menus, added restaurants, confirmations). No account needed; the magic-link upgrade comes later.
import { localizedFormatter, useTranslation, translate, type MessageKey } from '../../i18n'
import { useState } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { Icon } from '../../components/Icon'
import { ApiRequestError, getMe, setNickname, type MeView, type MyScan } from '../../data/api'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import { UnseenBadges } from './BadgeMoment'
import { BADGE_COPY, BADGE_ART, KIEZ_NAMES, useLoaded } from './community'
import { Avatar, BadgeMedal } from './shared'
import './community.css'

const monthYear = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }))
const shortDate = localizedFormatter((lang) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }))

const STATUS: Record<MyScan['status'], { label: string; tone: string }> = {
  pending: { get label() { return translate('underReview') }, tone: 'wait' },
  review: { get label() { return translate('withTheTeam') }, tone: 'wait' },
  published: { get label() { return translate('published') }, tone: 'ok' },
  rejected: { get label() { return translate('rejected') }, tone: 'no' },
}

function NicknameEditor({ me, onSaved }: { me: MeView; onSaved: () => void }) {
  const t = useTranslation()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(me.profile?.nickname ?? '')
  const [error, setError] = useState<MessageKey | null>(null)
  const [saving, setSaving] = useState(false)
  if (!editing) {
    return (
      <button
        className="cm-name__edit"
        onClick={() => {
          setValue(me.profile?.nickname ?? '')
          setEditing(true)
        }}
      >
        {me.profile ? t('changeName') : t('chooseAName')}
      </button>
    )
  }
  return (
    <form
      className="cm-name__form"
      onSubmit={async (e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await setNickname(value.trim())
          setEditing(false)
          onSaved()
        } catch (err) {
          const status = err instanceof ApiRequestError ? err.status : undefined
          setError(
            status === 400 ? 'nicknameInvalid' : status === 422 ? 'nicknameRejected' :
              status === 429 ? 'nicknameRateLimited' : status === 0 ? 'profileScreenNoConnection' : 'somethingWentWrongTryAgain',
          )
        } finally {
          setSaving(false)
        }
      }}
    >
      <input
        className="cm-name__input"
        value={value}
        maxLength={24}
        minLength={2}
        autoFocus
        aria-label={t('yourLeaderboardName')}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn btn--primary cm-pill" disabled={saving || value.trim().length < 2}>{t('save')}</button>
      <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>{t('cancel')}</button>
      {error && (
        <p className="cm-name__error" role="alert">
          {t(error)}
        </p>
      )}
    </form>
  )
}

function Stats({ me }: { me: MeView }) {
  const t = useTranslation()
  const items = [
    { n: me.stats.scans, label: me.stats.scans === 1 ? t('menuScanned') : t('menusScanned'), icon: 'camera' as const, tone: '#f5a524' },
    { n: me.stats.restaurantsAdded, label: me.stats.restaurantsAdded === 1 ? t('newRestaurant') : t('newRestaurants'), icon: 'pin' as const, tone: '#ef5b4c' },
    { n: me.stats.confirmations, label: t('dishesConfirmed'), icon: 'check' as const, tone: '#1f9d6b' },
  ]
  return (
    <div className="cm-stats">
      {items.map((s) => (
        <div className="cm-stat" key={s.label}>
          <span className="cm-stat__icon" style={{ color: s.tone }}>
            <Icon name={s.icon} size={16} strokeWidth={2} />
          </span>
          <b className="cm-stat__num">{s.n}</b>
          <span className="cm-stat__label">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function Badges({ me }: { me: MeView }) {
  const t = useTranslation()
  return (
    <section className="cm-card" aria-labelledby="cm-badges">
      <h2 className="cm-card__title" id="cm-badges">{t('badges')}</h2>
      <ul className="cm-badges">
        {me.badges.map((b) => (
          <li className="cm-badge" key={b.key}>
            <BadgeMedal badge={b.key} />
            <span className="cm-badge__title">{t(BADGE_COPY[b.key]?.title ?? 'badges')}</span>
            <span className="cm-badge__sub">{b.earnedAt ? shortDate().format(new Date(b.earnedAt)) : ''}</span>
          </li>
        ))}
        {me.lockedBadges.map((b) => (
          <li className="cm-badge cm-badge--locked" key={b.key}>
            <BadgeMedal badge={b.key} locked />
            <span className="cm-badge__title">{t(BADGE_COPY[b.key]?.title ?? 'badges')}</span>
            <span className="cm-badge__sub">{BADGE_ART[b.key].goal}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Contributions({ me }: { me: MeView }) {
  const t = useTranslation()
  const [tab, setTab] = useState<'scans' | 'confirmations'>('scans')
  return (
    <section className="cm-card" aria-labelledby="cm-contrib">
      <div className="cm-card__row">
        <h2 className="cm-card__title" id="cm-contrib">{t('contributions')}</h2>
        <div className="cm-seg" role="tablist" aria-label={t('contributions')}>
          <button role="tab" aria-selected={tab === 'scans'} onClick={() => setTab('scans')}>{t('menus')}</button>
          <button role="tab" aria-selected={tab === 'confirmations'} onClick={() => setTab('confirmations')}>{t('confirmations')}</button>
        </div>
      </div>
      {tab === 'scans' ? (
        me.scans.length === 0 ? (
          <p className="cm-empty">{t('noMenusYetYourFirstScan')}</p>
        ) : (
          <ul className="cm-list">
            {me.scans.map((s) => (
              <li key={s.id}>
                <Link to={paths.snapStatus(s.id)} className="cm-row">
                  <span className={`cm-row__icon ${s.restaurant.isNew ? 'cm-row__icon--new' : ''}`}>
                    <Icon name={s.restaurant.isNew ? 'pin' : 'camera'} size={18} strokeWidth={1.8} />
                  </span>
                  <span className="cm-row__main">
                    <span className="cm-row__title">{s.restaurant.name}</span>
                    <span className="cm-row__sub">
                      {s.restaurant.isNew ? t('profileScreenNewRestaurant') : t('menu')}
                      {s.kiez && ` · ${KIEZ_NAMES[s.kiez] ?? s.kiez}`} · {shortDate().format(new Date(s.createdAt))}
                      {s.status === 'published' && s.dishCount > 0 && t('profileScreenCount1Dishes', s.dishCount)}
                    </span>
                  </span>
                  <span className={`cm-status cm-status--${STATUS[s.status].tone}`}>{STATUS[s.status].label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : me.confirmations.length === 0 ? (
        <p className="cm-empty">{t('noConfirmationsYetOnEachDish')}</p>
      ) : (
        <ul className="cm-list">
          {me.confirmations.map((c) => (
            <li key={c.dishId}>
              <Link to={paths.dish(c.dishId)} className="cm-row">
                <span className={`cm-row__icon cm-row__icon--${c.verdict}`}>
                  <Icon name={c.verdict === 'yes' ? 'check' : 'close'} size={18} strokeWidth={2} />
                </span>
                <span className="cm-row__main">
                  <span className="cm-row__title">{c.dishName ?? t('dish')}</span>
                  <span className="cm-row__sub">
                    {c.verdict === 'yes' ? t('profileScreenConfirmed') : c.correction ? `„${c.correction}“` : t('inaccurate')} · {shortDate().format(new Date(c.at))}
                  </span>
                </span>
                <Icon name="chevronRight" size={16} className="cm-row__chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Content({ me, reload }: { me: MeView; reload: () => void }) {
  const t = useTranslation()
  const name = me.profile?.nickname ?? t('guest')
  return (
    <div className="page cm-page">
      <section className="cm-hero">
        <Avatar name={name} size={72} />
        <div className="cm-name">
          <h1 className="cm-name__title">{name}</h1>
          <p className="cm-name__sub">
            {me.profile ? t('joined1', monthYear().format(new Date(me.profile.since))) : t('noContributionsYet')}
            {' · '}{t('deviceProfile')}</p>
          <NicknameEditor me={me} onSaved={reload} />
        </div>
      </section>

      <Stats me={me} />

      <div className="cm-ctas">
        <Link to={paths.snap()} className="btn btn--primary cm-pill cm-cta">
          <Icon name="camera" size={16} />{t('scanAMenu')}</Link>
        <Link to={paths.leaderboard()} className="btn btn--secondary cm-pill cm-cta">
          <Icon name="star" size={16} />{t('neighbourhoodLeaderboard')}</Link>
      </div>

      <Badges me={me} />
      <Contributions me={me} />

      <p className="cm-note">
        <Icon name="shield" size={14} />{t('yourProfileIsStoredOnThis')}</p>
    </div>
  )
}

export function ProfileScreen() {
  const t = useTranslation()
  const [me, reload] = useLoaded('me', getMe)
  return (
    <AppShell tab={null}>
      <ScreenHeader title={t('profile')} backTo={paths.start()} />
      {me.state === 'loading' && (
        <div className="page cm-page" aria-busy="true" aria-label={t('loadingProfile')}>
          <span className="skeleton cm-sk-hero" />
          <span className="skeleton cm-sk-stats" />
          <span className="skeleton cm-sk-card" />
        </div>
      )}
      {me.state === 'error' && (
        <div className="empty-state">
          <p className="t-label">{t('offline')}</p>
          <h1 className="t-section">{t('profileCurrentlyUnavailable')}</h1>
          <button className="btn btn--primary" onClick={reload}>{t('tryAgain')}</button>
        </div>
      )}
      {me.state === 'ok' && <Content me={me.data} reload={reload} />}
      {me.state === 'ok' && <UnseenBadges />}
    </AppShell>
  )
}
