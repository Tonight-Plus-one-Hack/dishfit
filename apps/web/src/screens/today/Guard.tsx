// Error boundary for one card or badge, so a failed or missing dish never takes the whole screen down.
import { Component, type ReactNode } from 'react'

export class Guard extends Component<
  { fallback: (error: unknown, reset: () => void) => ReactNode; children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset)
    return this.props.children
  }
}
