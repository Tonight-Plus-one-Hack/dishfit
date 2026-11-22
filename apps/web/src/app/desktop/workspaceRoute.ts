import type { Route } from '../../lib/routes'

/** Routes that render as the map workspace: the map plus a right panel. */
export type WorkspaceRoute = Extract<Route, { name: 'home' | 'map' | 'restaurant' | 'dish' }>

export function isWorkspace(route: Route): route is WorkspaceRoute {
  return route.name === 'home' || route.name === 'map' || route.name === 'restaurant' || route.name === 'dish'
}
