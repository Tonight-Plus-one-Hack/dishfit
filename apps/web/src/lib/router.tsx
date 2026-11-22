// A tiny History API router (playbook 06: "History API or one small router").
import { startTransition, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { LocationContext } from './location'
import { current, navigate, NAV_EVENT, type Location } from './routes'

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location>(current)

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    const onPush = () => {
      const next = current()
      startTransition(() => setLocation(next))
    }
    const onPop = () => {
      const next = current()
      startTransition(() => setLocation(next))
    }
    window.addEventListener(NAV_EVENT, onPush)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener(NAV_EVENT, onPush)
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  // Land at the top of every new page, or at the anchor when one is given.
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1))
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [location.pathname, location.hash])

  return <LocationContext.Provider value={location}>{children}</LocationContext.Provider>
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (rest.target && rest.target !== '_self') return
    e.preventDefault()
    navigate(to, { replace })
  }
  return <a href={to} onClick={handle} {...rest} />
}
