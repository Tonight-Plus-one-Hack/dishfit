import { message, type Language, type MessageKey } from '../i18n'
import type { LocationFailure } from './position'

export type BrowserKind = 'instagram' | 'safari' | 'chrome' | 'other'

export function browserKind(userAgent: string): BrowserKind {
  if (/Instagram/i.test(userAgent)) return 'instagram'
  if (/Edg(e|A|iOS)?\//.test(userAgent) || /FxiOS|OPR\/|SamsungBrowser/.test(userAgent)) return 'other'
  if (/CriOS|Chrome\//.test(userAgent)) return 'chrome'
  if (/Safari\//.test(userAgent)) return 'safari'
  return 'other'
}

const causes = {
  insecure: { title: 'locationHelpInsecureTitle', body: 'locationHelpInsecureBody' },
  denied: { title: 'locationAccessBlocked', body: 'locationHelpDeniedBody' },
  unavailable: { title: 'locationHelpUnavailableTitle', body: 'locationHelpUnavailableBody' },
  timeout: { title: 'locationHelpTimeoutTitle', body: 'locationHelpTimeoutBody' },
  outside: { title: 'locationHelpOutsideTitle', body: 'locationHelpOutsideBody' },
} satisfies Record<LocationFailure, { title: MessageKey; body: MessageKey }>

const steps = {
  safari: 'locationHelpSafariSteps',
  chrome: 'locationHelpChromeSteps',
  instagram: 'locationHelpInstagramSteps',
  other: 'locationHelpOtherSteps',
} satisfies Record<BrowserKind, MessageKey>

export function locationHelp(cause: LocationFailure, browser: BrowserKind, language: Language) {
  const { title, body } = causes[cause]
  const needsSteps = cause !== 'outside' && cause !== 'insecure'
  const guidance = needsSteps || (browser === 'instagram' && cause !== 'outside')
  return {
    title: message(language, title),
    body: message(language, body),
    steps: guidance ? message(language, steps[browser]) : null,
  }
}
