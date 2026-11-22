// Layout tiers. Below 768 px the phone layout (the reference for the iOS app) renders unchanged;
// tablet gets a collapsible icon rail and the right panel as a drawer; desktop docks sidebar and panel.
import { createContext, useContext, useSyncExternalStore } from 'react'

export type Tier = 'phone' | 'tablet' | 'desktop'

const TABLET = '(min-width: 768px)'
const DESKTOP = '(min-width: 1280px)'

function read(): Tier {
  if (typeof window === 'undefined' || !window.matchMedia) return 'phone'
  if (window.matchMedia(DESKTOP).matches) return 'desktop'
  if (window.matchMedia(TABLET).matches) return 'tablet'
  return 'phone'
}

function subscribe(listener: () => void) {
  const queries = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)]
  queries.forEach((q) => q.addEventListener('change', listener))
  return () => queries.forEach((q) => q.removeEventListener('change', listener))
}

export function useTier(): Tier {
  return useSyncExternalStore(subscribe, read, () => 'phone' as Tier)
}

/**
 * Where a screen renders. `phone`: the phone app frame with the bottom tab bar.
 * `page`: the main column of the desktop frame. `panel`: the right panel next to the map.
 */
export type ShellMode = 'phone' | 'page' | 'panel'

export const ShellModeContext = createContext<ShellMode>('phone')

export function useShellMode(): ShellMode {
  return useContext(ShellModeContext)
}
