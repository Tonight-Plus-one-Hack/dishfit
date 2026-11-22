import { describe, expect, it } from 'vitest'
import { message } from '../i18n'
import { greeting as greetingKey } from './greeting'

const greeting = (...args: Parameters<typeof greetingKey>) => message('de', greetingKey(...args))

describe('greeting', () => {
  it('reads the browser time zone for the same instant', () => {
    const instant = new Date('2026-11-22T08:15:00Z')
    expect(greeting(instant, 'Europe/Berlin')).toBe('Guten Morgen')
    expect(greeting(instant, 'Asia/Tokyo')).toBe('Guten Abend')
  })

  it('uses Berlin time across daylight saving when the browser omits its zone', () => {
    expect(greeting(new Date('2026-06-22T08:59:00Z'), '')).toBe('Guten Morgen')
    expect(greeting(new Date('2026-06-22T09:00:00Z'), '')).toBe('Mittagszeit in Berlin')
    expect(greeting(new Date('2026-11-22T16:00:00Z'), '')).toBe('Guten Abend')
  })
})
