// Left navigation of the desktop frame. Desktop: full width with labels, collapsible to an icon rail.
// Tablet: icon rail that expands over the content.
import { useTranslation } from '../../i18n'
import { motion, useReducedMotion } from 'framer-motion'
import { Glyph, type GlyphName } from '../../components/glyphs/Glyph'
import { Icon } from '../../components/Icon'
import { LegalLinks } from '../../components/LegalLinks'
import { BRAND } from '../../lib/brand'
import { useProfile } from '../../lib/profile'
import { Link } from '../../lib/router'
import { paths, type Route } from '../../lib/routes'
import { springTransition } from '../../motion/transitions'
import { GOAL_LABEL } from '../../screens/onboarding/targets'
import type { Tier } from '../viewport'
import { BrandMark } from './BrandMark'
import { homeHref, mapHref, useStoredFilters } from './globalFilters'

type NavKey = 'home' | 'map' | 'search' | 'today' | 'me'

/** The highlighted item: detail routes open in the map panel, so Karte stays lit. */
function activeOf(route: Route): NavKey | null {
  switch (route.name) {
    case 'home':
    case 'map':
    case 'search':
    case 'today':
      return route.name
    case 'restaurant':
    case 'dish':
      return 'map'
    case 'camera':
      return 'today'
    case 'me':
    case 'leaderboard':
      return 'me'
    default:
      return null
  }
}

export function Sidebar({
  route,
  tier,
  rail,
  onToggle,
}: {
  route: Route
  tier: Tier
  /** Icons only. */
  rail: boolean
  onToggle: () => void
}) {
  const t = useTranslation()
  const { filters, home } = useStoredFilters()
  const profile = useProfile()
  const reduce = useReducedMotion()
  const active = activeOf(route)

  const items: Array<{ key: NavKey; label: string; icon: GlyphName; to: string }> = [
    { key: 'map', label: t('map'), icon: 'map', to: mapHref(filters, home) },
    { key: 'home', label: t('discover'), icon: 'home', to: homeHref(filters, home) },
    { key: 'search', label: t('search'), icon: 'search', to: paths.search() },
    { key: 'today', label: t('today'), icon: 'today', to: paths.today() },
    { key: 'me', label: t('community'), icon: 'spark', to: paths.me() },
  ]
  const me = profile ? `${GOAL_LABEL[profile.goal]} · ${profile.kcalTarget} kcal` : t('setGoal')

  return (
    <nav className={`sidebar ${rail ? 'sidebar--rail' : ''}`} aria-label={t('mainNavigation')} data-tier={tier}>
      <div className="sidebar__head">
        <Link to={mapHref(filters, home)} className="sidebar__brand" aria-label={t('count1Home', BRAND.name)}>
          <BrandMark size={32} />
          <span className="sidebar__name">{BRAND.name}</span>
        </Link>
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={rail ? t('expandNavigation') : t('collapseNavigation')}
          aria-expanded={!rail}
        >
          <Icon name="sidebar" size={18} />
        </button>
      </div>

      <ul className="sidebar__list">
        {items.map((item) => {
          const current = item.key === active
          return (
            <li key={item.key}>
              <Link
                to={item.to}
                className="sidebar__item"
                aria-current={current ? 'page' : undefined}
                title={rail ? item.label : undefined}
              >
                {current && (
                  <motion.span
                    layoutId="sidebar-indicator"
                    className="sidebar__indicator"
                    transition={reduce ? { duration: 0 } : springTransition('state')}
                  />
                )}
                <Glyph name={item.icon} size={22} filled={current} />
                <span className="sidebar__label">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="sidebar__foot">
        <LegalLinks className="sidebar__legal" />
        <Link
          to={profile ? `${paths.today()}#goal-title` : paths.onboarding()}
          className="sidebar__me"
          title={rail ? t('me1', me) : undefined}
          aria-label={t('me1', me)}
        >
          <span className="sidebar__avatar" aria-hidden="true">
            <Glyph name="profile" size={18} />
          </span>
          <span className="sidebar__me-text">
            <span className="sidebar__me-title">{t('me')}</span>
            <span className="sidebar__me-sub">{me}</span>
          </span>
        </Link>
      </div>
    </nav>
  )
}
