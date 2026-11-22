import { describe, expect, it } from 'vitest'
import { browserKind, locationHelp } from './locationHelp'

const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const chromeIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1'
const instagram = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 330.0.0.30.109'

describe('location recovery help', () => {
  it('recognises the browsers named in the requirement', () => {
    expect(browserKind(safari)).toBe('safari')
    expect(browserKind(chrome)).toBe('chrome')
    expect(browserKind(chromeIos)).toBe('chrome')
    expect(browserKind(instagram)).toBe('instagram')
    expect(browserKind('Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0')).toBe('other')
  })

  it('gives every cause distinct German and English copy', () => {
    for (const language of ['de', 'en'] as const) {
      const titles = (['insecure', 'denied', 'unavailable', 'timeout', 'outside'] as const).map((cause) => locationHelp(cause, 'other', language).title)
      expect(new Set(titles).size).toBe(5)
    }
  })

  it('points Instagram users to Safari and Safari users to website settings', () => {
    expect(locationHelp('denied', 'instagram', 'de').steps).toContain('In Safari öffnen')
    expect(locationHelp('denied', 'instagram', 'en').steps).toContain('Open in Safari')
    expect(locationHelp('denied', 'safari', 'de').steps).toContain('Website-Einstellungen')
    expect(locationHelp('denied', 'chrome', 'en').steps).toContain('Site settings')
  })

  it('keeps out-of-Berlin free of browser settings advice', () => {
    expect(locationHelp('outside', 'instagram', 'en').steps).toBeNull()
  })
})
