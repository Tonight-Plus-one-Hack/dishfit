import { NAV_EVENT, parse } from './routes'

type FathomWindow = Window & { fathom?: { trackPageview: () => void } }

function isTrackablePath(pathname: string): boolean {
  try {
    const { name } = parse(pathname)
    return name !== 'snapStatus' && name !== 'notFound'
  } catch {
    // A malformed URL may contain arbitrary input and cannot be a known route.
    return false
  }
}

export function startFathom(configuredSiteId: string | undefined) {
  const siteId = configuredSiteId?.trim()
  if (!siteId) return

  const script = document.createElement('script')
  script.src = 'https://cdn.usefathom.com/script.js'
  script.async = true
  script.referrerPolicy = 'strict-origin'
  script.dataset.site = siteId
  script.dataset.auto = 'false'
  script.dataset.canonical = 'false'
  script.dataset.honorDnt = 'true'

  let countedPath: string | undefined
  const countPageview = () => {
    const { pathname, search } = window.location
    if (pathname === countedPath) return
    countedPath = undefined

    // Even manual Fathom pageviews read the live query string, which can contain search text or share IDs.
    if (search || !isTrackablePath(pathname)) return
    const { fathom } = window as FathomWindow
    if (!fathom) return
    fathom.trackPageview()
    countedPath = pathname
  }

  script.addEventListener('load', () => {
    countPageview()
    window.addEventListener(NAV_EVENT, countPageview)
    window.addEventListener('popstate', countPageview)
  }, { once: true })
  document.head.append(script)
}
