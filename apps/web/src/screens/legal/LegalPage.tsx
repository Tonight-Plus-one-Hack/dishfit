// Shared frame and building blocks of the Impressum and the Datenschutzerklärung.
import { useLanguage, useTranslation } from '../../i18n'
import type { ReactNode } from 'react'
import { AppShell, ScreenHeader } from '../../app/AppShell'
import { useShellMode } from '../../app/viewport'
import { LegalLinks } from '../../components/LegalLinks'
import { paths } from '../../lib/routes'
import { addressLines, OPERATOR, PENDING } from './operator'
import './legal.css'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslation()
  const language = useLanguage()
  const mode = useShellMode()
  return (
    <AppShell tab={null}>
      {mode === 'phone' ? <ScreenHeader title={title} backTo={paths.start()} /> : <ScreenHeader large eyebrow={t('legal')} title={title} />}
      <article className="legal">
        <p className="t-label">{t('legalUpdated')}</p>
        {language === 'en' && <p className="legal__section">{t('legalLanguageNote')}</p>}
        <div lang="de">{children}</div>
        <LegalLinks className="legal__links" />
      </article>
    </AppShell>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal__section">
      <h2 className="legal__h2">{title}</h2>
      {children}
    </section>
  )
}

export function Pending() {
  return <span className="legal__pending">{PENDING}</span>
}

/** Name and postal address of the responsible person, or the pending note while the config is empty. */
export function OperatorAddress() {
  const lines = addressLines(OPERATOR)
  if (lines.length === 0) {
    return (
      <p>
        <Pending />
      </p>
    )
  }
  return (
    <address className="legal__address">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </address>
  )
}

export function OperatorEmail() {
  return OPERATOR.email ? <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> : <Pending />
}

/** A link to another site, opened in a new tab. */
export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
