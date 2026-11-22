import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startFathom } from './fathom'
import { navigate } from './routes'

describe('Fathom pageviews', () => {
  const trackPageview = vi.fn()
  let script: EventTarget & { dataset: Record<string, string> }
  const createElement = vi.fn(() => script)
  const append = vi.fn()
  let browser: EventTarget & {
    location: URL
    fathom: { trackPageview: typeof trackPageview }
    history: { state: object; pushState: typeof setLocation; replaceState: typeof setLocation }
  }

  function setLocation(_state: object, _title: string, url: URL) {
    browser.location = url
  }

  beforeEach(() => {
    vi.clearAllMocks()
    script = Object.assign(new EventTarget(), { dataset: {} })
    browser = Object.assign(new EventTarget(), {
      location: new URL('https://dishfit.example/'),
      fathom: { trackPageview },
      history: { state: {}, pushState: setLocation, replaceState: setLocation },
    })
    vi.stubGlobal('window', browser)
    vi.stubGlobal('document', { createElement, head: { append } })
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([undefined, '', '  '])('omits the script when the site ID is %j', (siteId) => {
    startFathom(siteId)

    expect(createElement).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
  })

  it('loads the official script with the configured ID, honoring Do Not Track', () => {
    startFathom('  test-site-id  ')

    expect(createElement).toHaveBeenCalledExactlyOnceWith('script')
    expect(append).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      src: 'https://cdn.usefathom.com/script.js',
      async: true,
      dataset: { site: 'test-site-id', auto: 'false', canonical: 'false', honorDnt: 'true' },
    }))
    expect(trackPageview).not.toHaveBeenCalled()
  })

  it('counts one initial pageview and tracks navigation, including back and replace', () => {
    startFathom('test-site-id')
    script.dispatchEvent(new Event('load'))
    expect(trackPageview).toHaveBeenCalledTimes(1)

    navigate('/map')
    navigate('/map?kiez=mitte')
    navigate('/map#results')
    expect(trackPageview).toHaveBeenCalledTimes(2)

    navigate('/search', { replace: true })
    browser.location = new URL('https://dishfit.example/map')
    browser.dispatchEvent(new Event('popstate'))
    expect(trackPageview).toHaveBeenCalledTimes(4)
  })

  it('excludes search text, share IDs and individual scan-status pages', () => {
    browser.location = new URL('https://dishfit.example/search?q=private+text')
    startFathom('test-site-id')
    script.dispatchEvent(new Event('load'))

    navigate('/d/dish?ref=whatsapp&s=first-party-id')
    navigate('/scan/submission-id')
    expect(trackPageview).not.toHaveBeenCalled()

    navigate('/d/dish')
    expect(trackPageview).toHaveBeenCalledTimes(1)
  })
})
