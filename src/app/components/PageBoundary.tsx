import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 화면을 그리다 오류가 나면 화면 전체가 검게 비지 않게, 오류 내용과 돌아갈 길을 보여 준다.
 * 흔한 원인: 화면(TEAM4_AGENT_FRONT)과 서버(TEAM4_AGENT) 코드 버전이 달라 서버가 화면이 기대하는 값을 주지 않음
 * (예: 화면만 pull하고 백엔드는 예전 코드). 오류 화면에서 주소가 바뀌면(resetKey) 다시 그린다.
 */
export class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('화면 오류:', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main role="alert" className="grid min-h-dvh place-items-center bg-canvas px-4 text-fg">
        <div className="w-full max-w-xl space-y-3 rounded-lg border border-danger/40 bg-card p-6">
          <h1 className="text-title font-semibold">이 화면을 그리지 못했습니다</h1>
          <p className="break-all rounded-md bg-sunken px-3 py-2 font-mono text-small text-danger">{error.message || String(error)}</p>
          <p className="text-small text-fg-2">
            서버(TEAM4_AGENT)와 화면(TEAM4_AGENT_FRONT) 코드 버전이 다르면 자주 생깁니다. 두 저장소를 모두 최신으로 받았는지
            (pull) 확인하고, 새 DB 마이그레이션이 있으면 <code className="font-mono">alembic upgrade head</code>를 실행한 뒤 새로고침하세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()}
              className="min-h-9 rounded-sm bg-primary px-3 text-label font-semibold text-on-primary">새로고침</button>
            <button type="button" onClick={() => { window.location.hash = '#/home' }}
              className="min-h-9 rounded-sm border border-line px-3 text-label">홈으로</button>
          </div>
        </div>
      </main>
    )
  }
}
