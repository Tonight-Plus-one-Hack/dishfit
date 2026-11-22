// Error boundary for the content part of a screen, so the header and tab bar stay when a load fails.
// retry() reloads the failed resource keys through refresh() before rendering the children again.
import { Component, type ReactNode } from 'react'
import { refresh } from '../lib/resource'

export class ScreenBoundary extends Component<
  {
    children: ReactNode
    /** Resource keys this subtree reads; retry reloads exactly these. */
    keys: string[]
    fallback: (error: unknown, retry: () => void) => ReactNode
  },
  { error: unknown }
> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  retry = () => {
    const keys = new Set(this.props.keys)
    void refresh((key) => keys.has(key)).then(() => this.setState({ error: null }))
  }

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.retry)
    return this.props.children
  }
}
