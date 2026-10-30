import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShellBase } from './components/Shell'
import { clearCache, useProjects } from './lib/data'
import { PAGE_LABEL, useRoute, type Route } from './lib/route'
import { useSession } from './lib/session'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Workspace } from './pages/Workspace'

export function App() {
  const { user, signIn, signOut } = useSession()
  const [route, navigate] = useRoute()
  const [reloadKey, setReloadKey] = useState(0)
  const projects = useProjects(reloadKey)
  // 로그인 전에 열려던 화면 (로그인하면 그리로 보낸다)
  const pending = useRef<Route | null>(null)

  useEffect(() => {
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
      : `${PAGE_LABEL[route.page]} · ${route.project} v${route.version}`
  }, [route])

  const reload = useCallback(() => {
    clearCache()
    setReloadKey((k) => k + 1)
  }, [])

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

  return route.name === 'workspace' ? <Workspace shell={shell} /> : <Home shell={shell} />
}
