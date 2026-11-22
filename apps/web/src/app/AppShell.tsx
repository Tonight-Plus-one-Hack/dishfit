// Phone app frame: a scrolling screen above a fixed bottom tab bar, respecting the safe areas.
// Inside the desktop frame (src/app/desktop) the same screens render into the main column or the right panel.
import { useTranslation } from '../i18n'
import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { back } from '../lib/routes'
import { TabBar } from './TabBar'
import { useShellMode } from './viewport'
import type { Tab } from '../lib/routes'
import './shell.css'

export function AppShell({
  tab,
  children,
  bleed = false,
  hideTabs = false,
}: {
  /** The highlighted tab; null for detail screens opened from anywhere. */
  tab: Tab | null
  children: ReactNode
  /** Full-height content without page padding (the map). */
  bleed?: boolean
  hideTabs?: boolean
}) {
  const mode = useShellMode()
  // Inside the desktop frame the sidebar replaces the tab bar; the screen only needs its own column.
  if (mode !== 'phone') {
    return <div className={`dsk-screen dsk-screen--${mode} ${bleed ? 'dsk-screen--bleed' : ''}`}>{children}</div>
  }
  return (
    <div className={`app ${bleed ? 'app--bleed' : ''} ${hideTabs ? 'app--no-tabs' : ''}`}>
      <main className="app__main" id="main">
        {children}
      </main>
      {!hideTabs && <TabBar active={tab} />}
    </div>
  )
}

/** Sticky top bar with an optional back button, a title and trailing actions. */
export function ScreenHeader({
  title,
  backTo,
  actions,
  large = false,
  eyebrow,
}: {
  title: ReactNode
  /** Fallback route for the back button when the screen was opened directly; omit to hide it. */
  backTo?: string
  actions?: ReactNode
  /** Large serif title for tab roots; detail screens use the compact bar. */
  large?: boolean
  eyebrow?: ReactNode
}) {
  const t = useTranslation()
  if (large) {
    return (
      <header className="screen-head screen-head--large">
        <div className="screen-head__row">
          {eyebrow ? <p className="t-label">{eyebrow}</p> : <span />}
          {actions && <div className="screen-head__actions">{actions}</div>}
        </div>
        <h1 className="t-section screen-head__title">{title}</h1>
      </header>
    )
  }
  return (
    <header className="screen-head">
      {backTo ? (
        <button className="screen-head__back" onClick={() => back(backTo)} aria-label={t('back')}>
          <Icon name="arrowLeft" size={20} />
        </button>
      ) : (
        <span />
      )}
      <h1 className="screen-head__compact">{title}</h1>
      <div className="screen-head__actions">{actions}</div>
    </header>
  )
}

/** A screen that is not built yet; screen workers replace it. */
export function StubScreen({ title, owner, children }: { title: string; owner: string; children?: ReactNode }) {
  const t = useTranslation()
  return (
    <div className="stub">
      <p className="t-label">{t('inProgress')}{' '}{owner}</p>
      <h2 className="t-feature">{title}</h2>
      {children}
    </div>
  )
}
