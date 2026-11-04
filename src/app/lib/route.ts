import { useCallback, useEffect, useState } from 'react'

/** 편집하는 화면 */
export type EditPage = 'spec' | 'erd'
/** 단계 진행: 기능 명세 → ERD → 최종 산출물 */
export type StagePage = EditPage | 'final'
/** 산출물을 읽기만 하는 화면 (예전 viewer.html의 탭) */
export type DocPage = 'overview' | 'requirements' | 'questions' | 'final-erd' | 'ddl' | 'dev-spec' | 'trace' | 'issues' | 'decisions'
export type Page = StagePage | DocPage

export const DOC_PAGES: { id: DocPage; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'requirements', label: '요구사항' },
  { id: 'questions', label: '확인 질문' },
  { id: 'final-erd', label: '최종 ERD' },
  { id: 'ddl', label: 'DDL' },
  { id: 'trace', label: '추적' },
  { id: 'issues', label: '이슈' },
  { id: 'decisions', label: '판단 기록' },
  { id: 'dev-spec', label: '개발 스펙' },   // 최종본('ERD 최종 확정')에만 있는 개발 AI용 문서 10개
]

export const PAGE_LABEL: Record<Page, string> = {
  spec: '기능 명세서',
  erd: 'ERD',
  final: '최종 산출물',
  ...Object.fromEntries(DOC_PAGES.map((p) => [p.id, p.label])) as Record<DocPage, string>,
}

export const isDocPage = (p: Page): p is DocPage => p !== 'spec' && p !== 'erd' && p !== 'final'
const isPage = (p: string | undefined): p is Page => p !== undefined && p in PAGE_LABEL

export type Route =
  | { name: 'login' }
  | { name: 'home' }
  | { name: 'members' }
  | { name: 'workspace'; project: string; version: string; page: Page; focus?: string }

// 주소: #/login, #/home, #/members(회원 관리), #/p/<프로젝트>/<버전>/<화면>/<항목 ID> — 공유하거나 새로고침해도 같은 화면
export function parseHash(hash = window.location.hash): Route {
  const [head, ...rest] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  if (head === 'login') return { name: 'login' }
  if (head === 'members') return { name: 'members' }
  if (head === 'p') {
    const [project, version, page, focus] = rest
    if (project && /^\d+(\.\d+)*$/.test(version ?? '')) {
      return {
        name: 'workspace',
        project,
        version: version!,
        page: isPage(page) ? page : 'spec',
        focus: focus || undefined,
      }
    }
  }
  return { name: 'home' }
}

export function toHash(r: Route): string {
  if (r.name === 'login') return '#/login'
  if (r.name === 'home') return '#/home'
  if (r.name === 'members') return '#/members'
  const parts = ['p', r.project, r.version, r.page, r.focus ?? ''].map(encodeURIComponent)
  return '#/' + parts.join('/').replace(/\/+$/, '')
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash())

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((next: Route, replace = false) => {
    const hash = toHash(next)
    if (replace) window.history.replaceState(null, '', hash)
    else if (window.location.hash !== hash) window.location.hash = hash
    setRoute(next)
  }, [])

  return [route, navigate] as const
}
