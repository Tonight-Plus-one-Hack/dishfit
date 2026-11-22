import { useEffect, type ReactNode } from 'react'
import { FlowFooter, Question } from '../../components/Flow'
import { KIEZE, type Kiez } from '../../data/contract'
import { useLanguage, useTranslation } from '../../i18n'
import { useLocation } from '../../lib/location'
import { browserKind, locationHelp } from '../../lib/locationHelp'
import { finishLocationPrompt, isLocationFailure, requestPosition, usePosition } from '../../lib/position'
import { navigate } from '../../lib/routes'

export function LocationQuestion({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return <Question title={title} hint={hint} art="onb-location">{children}</Question>
}

export function LocationKieze({ value, onPick }: { value?: Kiez | null; onPick: (kiez: Kiez) => void }) {
  const t = useTranslation()
  const choosing = value !== undefined
  return (
    <div className="kiez-grid" role={choosing ? 'radiogroup' : 'group'} aria-label={t('chooseANeighbourhood')}>
      {KIEZE.map((kiez) => (
        <button key={kiez} type="button" role={choosing ? 'radio' : undefined} aria-checked={choosing ? value === kiez : undefined} className="kiez-chip" onClick={() => onPick(kiez)}>
          {kiez}
        </button>
      ))}
    </div>
  )
}

export function LocationStep() {
  const t = useTranslation()
  const language = useLanguage()
  const { status } = usePosition()
  const { pathname, search } = useLocation()
  const manual = isLocationFailure(status)
  const help = manual ? locationHelp(status, browserKind(navigator.userAgent), language) : null
  const locating = status === 'locating'

  useEffect(() => {
    if (status === 'granted') finishLocationPrompt('allowed')
  }, [status])

  const pickKiez = (kiez: Kiez) => {
    const params = new URLSearchParams(search)
    if (params.has('kiez')) {
      params.delete('kiez')
      navigate(params.size ? `${pathname}?${params}` : pathname, { replace: true })
    }
    finishLocationPrompt('manual', kiez)
  }

  return (
    <main className="flow onboarding" id="main" lang={language}>
      <div className="flow__body" key={manual ? 'kiez' : 'consent'}>
        <LocationQuestion title={help?.title ?? t('nearbyLocationTitle')} hint={help?.body ?? t('nearbyLocationHint')}>
          {help?.steps && <p className="t-muted" role="note">{help.steps}</p>}
          {manual && <LocationKieze onPick={pickKiez} />}
        </LocationQuestion>
      </div>
      <FlowFooter>
        {(!manual || status === 'denied' || status === 'timeout' || status === 'unavailable') && (
          <button type="button" className="btn btn--primary btn--wide" onClick={requestPosition} disabled={locating}>
            {locating ? t('findingYourLocation') : manual ? t('tryAgain') : t('useDeviceLocation')}
          </button>
        )}
        <button type="button" className="btn btn--secondary btn--wide" onClick={() => finishLocationPrompt(manual ? 'manual' : 'later')}>
          {t('later')}
        </button>
      </FlowFooter>
    </main>
  )
}
