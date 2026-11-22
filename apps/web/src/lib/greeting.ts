import { useEffect, useState } from 'react'
import type { MessageKey } from '../i18n'

/** Message key of the greeting. Use the device clock, with Berlin as the default when the browser cannot resolve its time zone. */
export function greeting(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): MessageKey {
  const hourPart = Intl.DateTimeFormat('de-DE', {
    timeZone: timeZone || 'Europe/Berlin',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now).find((part) => part.type === 'hour')
  const hour = Number(hourPart?.value)
  if (hour < 11) return 'goodMorning'
  if (hour < 17) return 'lunchtimeInBerlin'
  return 'goodEvening'
}

/** Re-reads the greeting every minute and when the tab becomes visible again. */
export function useGreeting(): MessageKey {
  const [text, setText] = useState(() => greeting())
  useEffect(() => {
    const update = () => setText(greeting())
    const timer = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return text
}
