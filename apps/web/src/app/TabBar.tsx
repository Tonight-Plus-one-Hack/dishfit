import { useTranslation, translate } from '../i18n'
import { motion } from 'framer-motion'
import { Glyph, type GlyphName } from '../components/glyphs/Glyph'
import { Link } from '../lib/router'
import { paths, type Tab } from '../lib/routes'
import { springTransition } from '../motion/transitions'

const TABS: Array<{ tab: Tab; label: string; icon: GlyphName; to: string }> = [
  { tab: 'map', get label() { return translate('map') }, icon: 'map', to: paths.map() },
  { tab: 'home', get label() { return translate('discover') }, icon: 'home', to: paths.discover() },
  { tab: 'search', get label() { return translate('search') }, icon: 'search', to: paths.search() },
  { tab: 'today', get label() { return translate('today') }, icon: 'today', to: paths.today() },
]

export function TabBar({ active }: { active: Tab | null }) {
  const t = useTranslation()
  return (
    <nav className="tabbar" aria-label={t('mainNavigation')}>
      {TABS.map(({ tab, label, icon, to }) => {
        const current = tab === active
        return (
          <Link key={tab} to={to} className="tabbar__item" aria-current={current ? 'page' : undefined}>
            {current && <motion.span layoutId="tabbar-indicator" className="tabbar__indicator" transition={springTransition('state')} />}
            <Glyph name={icon} size={24} filled={current} />
            <span className="tabbar__label">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
