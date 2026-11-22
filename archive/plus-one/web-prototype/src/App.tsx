import { Component, Suspense, type ReactNode } from 'react'
import { AppFrame } from './components/Chrome'
import { isNotFound } from './data/api'
import { Link, RouterProvider } from './lib/router'
import { useLocation, useRoute } from './lib/location'
import { paths } from './lib/routes'
import { Cities } from './screens/Cities'
import { CityTonight } from './screens/CityTonight'
import { CreateFlow } from './screens/Create'
import { HangoutPage } from './screens/Hangout'
import { JoinFlow } from './screens/Join'
import { Imprint, Privacy } from './screens/Legal'
import { Landing } from './screens/Landing'
import { Spots } from './screens/Spots'

function Screen() {
  const route = useRoute()
  switch (route.name) {
    case 'landing':
      return <Landing />
    case 'cities':
      return <Cities />
    case 'city':
      return <CityTonight slug={route.city} />
    case 'spots':
      return <Spots slug={route.city} />
    case 'hangout':
      return <HangoutPage id={route.id} />
    case 'join':
      return <JoinFlow id={route.id} />
    case 'create':
      return <CreateFlow city={route.city} />
    case 'imprint':
      return <Imprint />
    case 'privacy':
      return <Privacy />
    case 'notFound':
      return <NotFound />
  }
}

function NotFound() {
  return (
    <AppFrame>
      <div className="container empty-state">
        <p className="t-label">404</p>
        <h1 className="t-section">This plan doesn’t exist, or it already happened</h1>
        <Link to={paths.cities()} className="btn btn--primary">
          Back to cities
        </Link>
      </div>
    </AppFrame>
  )
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    if (this.state.error) {
      if (isNotFound(this.state.error)) return <NotFound />
      return (
        <AppFrame>
          <div className="container empty-state">
            <p className="t-label">Something went wrong</p>
            <h1 className="t-section">We couldn’t load this page</h1>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </AppFrame>
      )
    }
    return this.props.children
  }
}

function Routed() {
  const { pathname } = useLocation()
  return (
    <Boundary key={pathname}>
      <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
        <Screen />
      </Suspense>
    </Boundary>
  )
}

export function App() {
  return (
    <RouterProvider>
      <Routed />
    </RouterProvider>
  )
}
