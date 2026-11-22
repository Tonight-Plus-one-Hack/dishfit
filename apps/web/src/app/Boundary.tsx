// Route-level error boundary and the 404 page, shared by the phone and the desktop layout.
import { useTranslation, LanguageContext, translatorFor, type Language } from '../i18n'
import { Component, type ReactNode } from 'react'
import { isNotFound } from '../data/api'
import { navigate, paths } from '../lib/routes'
import { AppShell } from './AppShell'

export function NotFound() {
  const t = useTranslation()
  return (
    <AppShell tab={null}>
      <div className="empty-state">
        <p className="t-label">404</p>
        <h1 className="t-section">{t('pageNotFound')}</h1>
        <button className="btn btn--primary" onClick={() => navigate(paths.start())}>{t('backToHome')}</button>
      </div>
    </AppShell>
  )
}

export class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  static contextType = LanguageContext
  declare context: Language
  private translate = translatorFor(() => this.context)
  state: { error: unknown } = { error: null }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    if (this.state.error) {
      if (isNotFound(this.state.error)) return <NotFound />
      return (
        <AppShell tab={null}>
          <div className="empty-state">
            <p className="t-label">{this.translate('error')}</p>
            <h1 className="t-section">{this.translate('somethingWentWrong')}</h1>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>{this.translate('reload')}</button>
          </div>
        </AppShell>
      )
    }
    return this.props.children
  }
}
