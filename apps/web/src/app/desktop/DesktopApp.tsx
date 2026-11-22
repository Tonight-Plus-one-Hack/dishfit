// Desktop frame (768 px and up): sidebar navigation, a top bar with search and the global filters,
// and either the map workspace (map plus right panel) or a page in the main column.
// The phone layout below 768 px stays untouched; it is the reference for the iOS app.
import { useTranslation } from '../../i18n'
import { Suspense, useState } from 'react'
import { useLocation, useRoute } from '../../lib/location'
import { persisted, useStore } from '../../lib/store'
import { Boundary } from '../Boundary'
import { Screen } from '../Screen'
import { ShellModeContext, type Tier } from '../viewport'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { Workspace } from './Workspace'
import { isWorkspace } from './workspaceRoute'
import './desktop.css'

/** Desktop only: the user folded the sidebar to icons. Tablet always starts as a rail. */
const railStore = persisted<boolean>('dishfit.desktop.rail.v1', false)

export function DesktopApp({ tier }: { tier: Tier }) {
  const t = useTranslation()
  const route = useRoute()
  const { pathname } = useLocation()
  const railPreference = useStore(railStore)
  // The expanded tablet sidebar overlays the content and belongs to one route: any navigation folds it again.
  const [expandedAt, setExpandedAt] = useState<string | null>(null)
  const tabletExpanded = expandedAt === pathname
  const setTabletExpanded = (expanded: boolean) => setExpandedAt(expanded ? pathname : null)

  // Onboarding and the menu scan are focused, one-question-per-screen flows: no navigation around them.
  if (route.name === 'onboarding' || route.name === 'snap' || route.name === 'snapStatus') {
    return (
      <div className="dsk-focus">
        <Boundary key={pathname}>
          <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
            <Screen route={route} />
          </Suspense>
        </Boundary>
      </div>
    )
  }

  const rail = tier === 'tablet' ? !tabletExpanded : railPreference
  const toggle = () => (tier === 'tablet' ? setTabletExpanded(!tabletExpanded) : railStore.set(!railPreference))
  const workspace = isWorkspace(route)

  return (
    <div className={`dsk dsk--${tier} ${rail ? 'dsk--rail' : ''} ${workspace ? 'dsk--workspace' : 'dsk--page'}`}>
      <Sidebar route={route} tier={tier} rail={rail} onToggle={toggle} />
      {tier === 'tablet' && tabletExpanded && <button type="button" className="dsk__scrim" aria-label={t('collapseNavigation')} onClick={() => setTabletExpanded(false)} />}
      <div className="dsk__body">
        <TopBar route={route} />
        {workspace ? (
          <Workspace route={route} tier={tier} />
        ) : (
          <main className="dsk__page" id="main" key={pathname}>
            <ShellModeContext.Provider value="page">
              <Boundary key={pathname}>
                <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
                  <Screen route={route} />
                </Suspense>
              </Boundary>
            </ShellModeContext.Provider>
          </main>
        )}
      </div>
    </div>
  )
}
