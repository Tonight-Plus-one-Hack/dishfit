import { useState, type ReactNode } from 'react'
import logoLight from '../assets/brand/logo-light.svg'
import logoPrimary from '../assets/brand/logo-primary.svg'
import symbol from '../assets/brand/symbol.svg'
import { BRAND } from '../lib/brand'
import { Link } from '../lib/router'
import { useLocation } from '../lib/location'
import { paths } from '../lib/routes'
import { capitalize, nightWord } from '../lib/time'
import { Icon } from './Icon'
import './chrome.css'

/** Brand lockup from brand/assets (outlined wordmark, so it renders identically everywhere). */
export function Wordmark({ tone = 'primary', className }: { tone?: 'primary' | 'light'; className?: string }) {
  return (
    <img
      className={`wordmark ${className ?? ''}`}
      src={tone === 'light' ? logoLight : logoPrimary}
      alt={BRAND.name}
      width={143}
      height={32}
    />
  )
}

interface NavItem {
  label: string
  to: string
}

export function Header({
  nav = [],
  action,
}: {
  nav?: NavItem[]
  action?: ReactNode
}) {
  const { pathname, hash } = useLocation()
  // The menu belongs to the page it was opened on, so any navigation closes it.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const here = pathname + hash
  const open = openedAt === here
  const setOpen = (fn: (o: boolean) => boolean) => setOpenedAt(fn(open) ? here : null)

  return (
    <header className={`site-header ${open ? 'is-open' : ''}`}>
      <div className="site-header__bar">
        <Link to={paths.landing()} className="site-header__brand" aria-label={`${BRAND.name} home`}>
          <Wordmark />
        </Link>
        {nav.length > 0 && (
          <nav className="site-header__nav" aria-label="Primary">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} aria-current={pathname === item.to ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="site-header__actions">
          {action}
          {nav.length > 0 && (
            <button
              className="site-header__menu"
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name={open ? 'close' : 'menu'} size={22} strokeWidth={1.25} />
            </button>
          )}
        </div>
      </div>
      {nav.length > 0 && (
        <nav className="site-header__sheet" aria-label="Menu" hidden={!open}>
          {nav.map((item) => (
            <Link key={item.to} to={item.to} className="site-header__sheet-link">
              {item.label}
              <Icon name="chevronRight" size={16} />
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

/** Technical divider band: crosses on a quarter grid joined by hairlines. */
export function XRail({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <div className={`xrail band ${tone === 'dark' ? 'dark' : ''}`} aria-hidden="true">
      <div className="xrail__inner">
        <div className="xrail__track">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="xrail__cross" style={{ left: `${i * 25}%` }} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="xrail__line"
              style={{ left: `calc(${i * 25}% + 32px)`, width: 'calc(25% - 64px)' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function Footer() {
  return (
    <footer className="site-footer dark">
      <XRail tone="dark" />
      <div className="band dark">
        <div className="rails site-footer__pattern" aria-hidden="true">
          <div className="site-footer__pattern-grid" />
          <img className="site-footer__pattern-mark" src={symbol} alt="" />
        </div>
      </div>
      <div className="band dark">
        <div className="rails site-footer__main">
          <div className="site-footer__frame">
            <Wordmark tone="light" />
            <p className="site-footer__tagline">{BRAND.tagline}</p>
            <div className="site-footer__cols">
              <div>
                <p className="t-label">Explore</p>
                <Link to={paths.cities()} className="site-footer__link">
                  All cities <Icon name="arrowUpRight" size={12} />
                </Link>
                <Link to={paths.create()} className="site-footer__link">
                  Start a hangout <Icon name="arrowUpRight" size={12} />
                </Link>
              </div>
              <div>
                <p className="t-label">Legal</p>
                <Link to={paths.imprint()} className="site-footer__link">
                  Impressum
                </Link>
                <Link to={paths.privacy()} className="site-footer__link">
                  Datenschutz
                </Link>
              </div>
              <div>
                <p className="t-label">Spot data</p>
                <a
                  className="site-footer__link"
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap <Icon name="arrowUpRight" size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="band dark">
        <div className="rails site-footer__legal">
          <p>
            © 2026 {BRAND.name}. Prototype for the Layla 5K hackathon. Hangouts and people shown are demo data.
          </p>
        </div>
      </div>
    </footer>
  )
}

export function AppFrame({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <>
      <Header
        nav={[
          { label: 'Cities', to: paths.cities() },
          { label: `${capitalize(nightWord('Europe/Berlin'))} in Berlin`, to: paths.city('berlin') },
          { label: 'Spots', to: paths.spots('berlin') },
          { label: 'Start a hangout', to: paths.create() },
        ]}
        action={action}
      />
      <main className="app-main">{children}</main>
      <LegalLinks />
    </>
  )
}

/** Small legal footer for app pages and flows, so Impressum and Datenschutz are one tap away everywhere. */
export function LegalLinks({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`legal-links ${compact ? 'legal-links--compact' : ''}`}>
      <div className={compact ? undefined : 'band'}>
        <nav className={compact ? 'legal-links__row' : 'rails legal-links__row'} aria-label="Legal">
          <span>© 2026 {BRAND.name}</span>
          <Link to={paths.imprint()} data-testid="link-imprint">
            Impressum
          </Link>
          <Link to={paths.privacy()} data-testid="link-privacy">
            Datenschutz
          </Link>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap
          </a>
        </nav>
      </div>
    </footer>
  )
}
