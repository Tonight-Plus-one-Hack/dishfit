// Route switch. Content is visible without onboarding; Home offers the goal setup.
// Below 768 px every route renders as a phone screen with the bottom tab bar (the reference for the iOS app);
// from 768 px the desktop frame takes over: sidebar, filter bar, map with a right panel, pages in a main column.
// Routes are registered in src/app/Screen.tsx; screen workers own their screen folders and should not need to edit this file.
import { Suspense } from 'react'
import { AppShell } from './app/AppShell'
import { Boundary } from './app/Boundary'
import { DesktopApp } from './app/desktop/DesktopApp'
import { InstallHint } from './components/InstallHint'
import { Screen } from './app/Screen'
import { useTier } from './app/viewport'
import { RouterProvider } from './lib/router'
import { useLocation, useRoute } from './lib/location'
import { LanguageContext, useLanguage } from './i18n'
import { tabOf } from './lib/routes'
import { useLocationChoice, useLocationPrompt } from './lib/position'
import { LocationStep } from './screens/onboarding/LocationStep'

function PhoneRouted() {
  const { pathname } = useLocation()
  const route = useRoute()
  return (
    <Boundary key={pathname}>
      <Suspense fallback={<AppShell tab={tabOf(route)}>{<div className="page-loading" aria-busy="true" />}</AppShell>}>
        <Screen route={route} />
      </Suspense>
    </Boundary>
  )
}

function Routed() {
  const tier = useTier()
  return tier === 'phone' ? <PhoneRouted /> : <DesktopApp tier={tier} />
}

export function App() {
  const language = useLanguage()
  return (
    <LanguageContext.Provider value={language}>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </LanguageContext.Provider>
  )
}

function AppContent() {
  const route = useRoute()
  const choice = useLocationChoice()
  const requested = useLocationPrompt()
  if (requested || (choice === null && (route.name === 'home' || route.name === 'map'))) return <LocationStep />
  return <><Routed /><InstallHint /></>
}
