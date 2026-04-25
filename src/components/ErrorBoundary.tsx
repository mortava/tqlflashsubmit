import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[color:var(--tql-bg)] p-4">
          <div className="max-w-md w-full bg-white border border-[#EF4444]/40 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[rgba(239,68,68,0.1)] flex items-center justify-center shrink-0 text-[#EF4444] font-bold">!</div>
              <div className="min-w-0">
                <div className="text-sm font-bold tql-text-primary">Something went wrong</div>
                <div className="text-[11px] tql-text-muted mt-0.5">The pricer hit a render error. Reload to recover.</div>
              </div>
            </div>
            {this.state.error?.message && (
              <pre className="text-[11px] tql-text-slate bg-[color:var(--tql-bg)] border tql-border-steel rounded-md px-3 py-2 mb-4 overflow-auto max-h-40 whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-2.5 tql-bg-teal hover:opacity-90 text-white rounded-lg text-[12px] font-bold uppercase tracking-wider transition-opacity"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
