import { useCallback, useEffect, useRef, useState } from 'react'
import { PageBoundary } from './components/PageBoundary'
import type { ShellBase } from './components/Shell'
import { clearCache, useProjects } from './lib/data'
import { PAGE_LABEL, useRoute, type Route } from './lib/route'
import { useSession } from './lib/session'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Members } from './pages/Members'
import { Workspace } from './pages/Workspace'

export function App() {
  const { user, signIn, signOut } = useSession()
  const [route, navigate] = useRoute()
  const [reloadKey, setReloadKey] = useState(0)
  const projects = useProjects(reloadKey)
  // 로그인 전에 열려던 화면 (로그인하면 그리로 보낸다)
  const pending = useRef<Route | null>(null)

  useEffect(() => {
    if (user === undefined) return   // 로그인 확인 중
    if (!user && route.name !== 'login') {
      pending.current = route
      navigate({ name: 'login' }, true)
    } else if (user && route.name === 'login') {
      navigate(pending.current ?? { name: 'home' }, true)
      pending.current = null
    }
  }, [user, route, navigate])

  useEffect(() => {
    document.title = route.name === 'login' ? '로그인 · 설계 초안 작업실'
      : route.name === 'home' ? '홈 · 설계 초안 작업실'
      : route.name === 'members' ? '관리자 페이지 · 설계 초안 작업실'
      : `${PAGE_LABEL[route.page]} · ${route.project} v${route.version}`
  }, [route])

  const reload = useCallback(() => {
    clearCache()
    setReloadKey((k) => k + 1)
  }, [])

  if (user === undefined) return <div role="status" className="grid min-h-dvh place-items-center bg-canvas text-label text-fg-3">로그인 확인 중…</div>
  if (!user || route.name === 'login') {
    return <Login onSignIn={signIn} />
  }

  const shell: ShellBase = {
    user,
    onSignOut: signOut,
    route,
    navigate,
    projects,
    onReloadProjects: reload,
  }

  // 화면 오류로 전체가 검게 비지 않게 감싼다 (오류 화면에서 주소가 바뀌면 다시 그린다. 평소에는 페이지를 새로 만들지 않음)
  return (
    <PageBoundary resetKey={JSON.stringify(route)}>
      {route.name === 'workspace' ? <Workspace shell={shell} />
        : route.name === 'members' && user.is_admin ? <Members shell={shell} /> : <Home shell={shell} />}
    </PageBoundary>
  )
}
