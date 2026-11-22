// Footer links to the Impressum and the Datenschutzerklärung. German sites must keep both one click away,
// so every layout renders this: Home and Heute on the phone, the sidebar foot on tablet and desktop.
import { useLanguage, useTranslation, translate } from '../i18n'
import { useLocation } from '../lib/location'
import { Link } from '../lib/router'
import { paths } from '../lib/routes'
import './legal-links.css'

// A plain anchor: the guides are static pages outside the single-page app, so this is a full navigation.
const GUIDES_PATH = '/kiez/kreuzberg'

const LINKS = [
  { to: paths.impressum(), get label() { return translate('legalNotice') } },
  { to: paths.datenschutz(), get label() { return translate('privacyPolicy') } },
]

export function LegalLinks({ className = '' }: { className?: string }) {
  const language = useLanguage()
  const t = useTranslation()
  const { pathname } = useLocation()
  return (
    <nav className={`legal-links ${className}`} aria-label={t('legal')}>
      {LINKS.map((link) => (
        <Link key={link.to} to={link.to} className="legal-links__a" aria-current={pathname === link.to ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
      <a href={language === 'en' ? `/en${GUIDES_PATH}` : GUIDES_PATH} className="legal-links__a">
        {t('neighbourhoodGuides')}
      </a>
    </nav>
  )
}
