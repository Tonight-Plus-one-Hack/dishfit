// Inline error state for the result list: the search bar stays usable, and a retry reloads only this screen's data.
import { LanguageContext, translatorFor, type Language } from '../../i18n'
import { Component, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { refresh } from '../../lib/resource'
import { KEY_PREFIX } from './queries'

interface State {
  failed: boolean
  retrying: boolean
  resetKey: string
}

export class ResultsBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  static contextType = LanguageContext
  declare context: Language
  private translate = translatorFor(() => this.context)
  state: State = { failed: false, retrying: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  // A new query gets a fresh try.
  static getDerivedStateFromProps(props: { resetKey: string }, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { resetKey: props.resetKey, failed: false }
  }

  retry = async () => {
    this.setState({ retrying: true })
    await refresh((key) => key.startsWith(KEY_PREFIX))
    this.setState({ failed: false, retrying: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="search-empty search-error" role="alert">
        <span className="search-empty__icon" aria-hidden="true">
          <Icon name="alert" size={22} />
        </span>
        <h3 className="search-empty__title">{this.translate('weCouldntLoadTheResults')}</h3>
        <p className="t-muted search-empty__text">{this.translate('weCouldntConnectYourFiltersAre')}</p>
        <button type="button" className="btn btn--primary" onClick={this.retry} disabled={this.state.retrying}>
          {this.state.retrying ? this.translate('loading') : this.translate('resultsBoundaryTryAgain')}
        </button>
      </div>
    )
  }
}

/** For small helpers next to the results (the share button): on error show the fallback, the list explains. */
export class QuietBoundary extends Component<{ children: ReactNode; fallback: ReactNode; resetKey: string }, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { resetKey: props.resetKey, failed: false }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
