import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WAITLIST_OFFER, WAITLIST_OFFERS, type WaitlistCoupon } from '../../../../../packages/contract/src/waitlist'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { LanguageSwitch } from '../../components/LanguageSwitch'
import { useLanguage, useTranslation } from '../../i18n'
import { ApiRequestError, joinWaitlist } from '../../data/api'
import { Link } from '../../lib/router'
import { paths } from '../../lib/routes'
import './waitlist.css'

export function WaitlistScreen() {
  const language = useLanguage()
  const t = useTranslation()
  const [coupon, setCoupon] = useState<WaitlistCoupon | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<'waitlistInvalid' | 'waitlistLimited' | 'waitlistError' | null>(null)
  const [copyStatus, setCopyStatus] = useState<'waitlistCopied' | 'waitlistCopyFallback' | null>(null)
  const successTitle = useRef<HTMLHeadingElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (coupon) successTitle.current?.focus()
  }, [coupon])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    setError(null)
    setPending(true)
    try {
      const result = await joinWaitlist({
        email: String(form.get('email') ?? ''),
        consent: form.has('consent'),
        website: String(form.get('website') ?? ''),
      })
      if (result && typeof result.code === 'string' && Object.hasOwn(WAITLIST_OFFERS, result.offer)) setCoupon(result)
      else setError('waitlistError')
    } catch (failure) {
      const status = failure instanceof ApiRequestError ? failure.status : 0
      setError(status === 429 ? 'waitlistLimited' : status === 400 ? 'waitlistInvalid' : 'waitlistError')
    } finally {
      setPending(false)
    }
  }

  async function copyCoupon(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopyStatus('waitlistCopied')
    } catch {
      codeInput.current?.focus()
      codeInput.current?.select()
      setCopyStatus('waitlistCopyFallback')
    }
  }

  return (
    <AppShell tab={null}>
      <ScreenHeader large title={t('waitlistTitle')} actions={<LanguageSwitch />} />
      <div className="page">
        {coupon ? (
          <div className="waitlist-content">
            <h2 ref={successTitle} tabIndex={-1} className="t-feature">{t('waitlistSuccess')}</h2>
            <p>{WAITLIST_OFFERS[coupon.offer][language]}</p>
            <label className="waitlist-field" htmlFor="waitlist-code">
              {t('waitlistCode')}
              <input className="waitlist-input waitlist-code" id="waitlist-code" ref={codeInput} value={coupon.code} readOnly />
            </label>
            <p className="t-muted">{t('waitlistSave')}</p>
            <button type="button" className="btn btn--primary btn--wide" onClick={() => void copyCoupon(coupon.code)}>{t('waitlistCopy')}</button>
            <p role="status">{copyStatus && t(copyStatus)}</p>
          </div>
        ) : (
          <form className="waitlist-content" onSubmit={submit} aria-busy={pending}>
            <p>{t('waitlistIntro')}</p>
            <p className="waitlist-offer">{WAITLIST_OFFERS[WAITLIST_OFFER][language]}</p>
            <label className="waitlist-field" htmlFor="waitlist-email">
              {t('waitlistEmail')}
              <input className="waitlist-input" id="waitlist-email" name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
            <div hidden>
              <label htmlFor="waitlist-website">{t('waitlistWebsite')}</label>
              <input id="waitlist-website" name="website" type="text" autoComplete="off" tabIndex={-1} />
            </div>
            <label className="waitlist-consent">
              <input name="consent" type="checkbox" required />
              <span>{t('waitlistConsent')}</span>
            </label>
            <p className="t-muted">
              {t('waitlistPrivacyNote')}{' '}
              <Link className="waitlist-link" to={paths.datenschutz()} hrefLang="de">{t('waitlistPrivacy')}</Link>
            </p>
            <button type="submit" className="btn btn--primary btn--wide" disabled={pending}>
              {pending ? t('waitlistPending') : t('waitlistSubmit')}
            </button>
            {error && <p role="alert">{t(error)}</p>}
          </form>
        )}
      </div>
    </AppShell>
  )
}
