import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDesign, listProjects } from './api'
import { Badge } from './components/ui'
import { DesignContext, TABS, buildIndex, buildLinks, useDesign, type DesignContextValue, type Tab } from './context'
import { formatDate } from './labels'
import type { Design, Project } from './types'
import { DataModel } from './views/DataModel'
import { Ddl } from './views/Ddl'
import { Decisions } from './views/Decisions'
import { Functions } from './views/Functions'
import { Issues } from './views/Issues'
import { Overview } from './views/Overview'
import { Questions } from './views/Questions'
import { Requirements } from './views/Requirements'
import { Trace } from './views/Trace'

/** 직접 연 design.json은 API가 없으므로 이 프로젝트 이름으로 구분한다 */
const LOCAL = '@local'

interface Route {
  project: string | null
  version: string | null
  tab: Tab
  focus?: string
}

// 주소: #/<프로젝트>/<버전>/<탭>/<항목 ID> — 새로고침하거나 주소를 공유해도 같은 화면이 열린다
function parseHash(): Route {
  const [project, version, tab, focus] = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  return {
    project: project || null,
    version: version && /^\d+(\.\d+)*$/.test(version) ? version : null,
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : 'overview',
    focus: focus || undefined,
  }
}

function toHash(r: Route): string {
  const parts = [r.project ?? '', r.version ?? '', r.tab, r.focus ?? ''].map((p) => encodeURIComponent(String(p)))
  return '#/' + parts.join('/').replace(/\/+$/, '')
}

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T }

const VIEWS: Record<Tab, () => React.JSX.Element> = {
  overview: Overview,
  requirements: Requirements,
  questions: Questions,
  functions: Functions,
  data: DataModel,
  ddl: Ddl,
  trace: Trace,
  issues: Issues,
  decisions: Decisions,
}

export function App() {
  const [route, setRoute] = useState<Route>(parseHash)
  const [projects, setProjects] = useState<Load<{ outputDir: string; list: Project[] }>>({ state: 'loading' })
  const [design, setDesign] = useState<Load<Design> | null>(null)
  const [localDesign, setLocalDesign] = useState<{ name: string; design: Design } | null>(null)

  const navigate = useCallback((next: Route, replace = false) => {
    const hash = toHash(next)
    if (replace) window.history.replaceState(null, '', hash)
    else window.location.hash = hash
    setRoute(next)
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const reloadProjects = useCallback(() => {
    setProjects({ state: 'loading' })
    listProjects()
      .then((r) => setProjects({ state: 'ready', data: { outputDir: r.output_dir, list: r.projects } }))
      .catch((e: Error) => setProjects({ state: 'error', message: e.message }))
  }, [])

  useEffect(reloadProjects, [reloadProjects])

  // 프로젝트·버전을 고르지 않았으면 가장 최근 프로젝트의 최신 버전을 연다
  useEffect(() => {
    if (projects.state !== 'ready' || route.project === LOCAL) return
    const list = projects.data.list
    const project = list.find((p) => p.id === route.project) ?? list[0]
    if (!project) return
    const version = project.versions.find((v) => v.design_version === route.version) ?? project.versions[0]
    if (project.id !== route.project || version.design_version !== route.version) {
      navigate({ project: project.id, version: version.design_version, tab: route.tab }, true)
    }
  }, [projects, route, navigate])

  useEffect(() => {
    if (!route.project || route.project === LOCAL || route.version === null) return
    let cancelled = false
    setDesign({ state: 'loading' })
    getDesign(route.project, route.version)
      .then((d) => { if (!cancelled) setDesign({ state: 'ready', data: d }) })
      .catch((e: Error) => { if (!cancelled) setDesign({ state: 'error', message: e.message }) })
    return () => { cancelled = true }
  }, [route.project, route.version])

  const openLocalFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Design
      if (!parsed.meta || !Array.isArray(parsed.requirements)) throw new Error('design.json 형식이 아닙니다.')
      setLocalDesign({ name: file.name, design: parsed })
      navigate({ project: LOCAL, version: String(parsed.meta.design_version), tab: 'overview' })
    } catch (e) {
      setDesign({ state: 'error', message: `${file.name}을 열지 못했습니다: ${(e as Error).message}` })
    }
  }

  const current: Load<Design> | null = route.project === LOCAL
    ? localDesign ? { state: 'ready', data: localDesign.design } : { state: 'error', message: '직접 연 파일은 새로고침하면 사라집니다. 파일을 다시 여세요.' }
    : design

  const projectList = projects.state === 'ready' ? projects.data.list : []
  const project = projectList.find((p) => p.id === route.project)
  const versionRecord = project?.versions.find((v) => v.design_version === route.version)

  const ctx = useMemo<DesignContextValue | null>(() => {
    if (current?.state !== 'ready') return null
    const d = current.data
    return {
      design: d,
      project: route.project ?? '',
      versionNumber: route.version ?? String(d.meta.design_version),
      version: versionRecord,
      focus: route.focus,
      go: (tab, focus) => navigate({ ...route, tab, focus }),
      index: buildIndex(d),
      links: buildLinks(d),
    }
  }, [current, route, versionRecord, navigate])

  const View = VIEWS[route.tab]

  return (
    <div className="app">
      <a className="skip" href="#main">본문으로 건너뛰기</a>
      <aside className="sidebar">
        <p className="brand">설계 검토 뷰어</p>
        <nav aria-label="프로젝트">
          {projects.state === 'loading' && <p className="muted">output 폴더를 읽는 중…</p>}
          {projects.state === 'error' && (
            <div className="sidebar__error">
              <p>산출물 목록을 불러오지 못했습니다. ({projects.message})</p>
              <p className="muted">frontend 폴더에서 npm run dev로 띄웠는지 확인하세요.</p>
              <button type="button" className="button" onClick={reloadProjects}>다시 시도</button>
            </div>
          )}
          {projects.state === 'ready' && projectList.length === 0 && (
            <p className="muted">
              {projects.data.outputDir}에 실행 결과가 없습니다. 백엔드 폴더에서 python -m app run을 먼저 실행하세요.
            </p>
          )}
          <ul className="projects">
            {projectList.map((p) => {
              const active = p.id === route.project
              return (
                <li key={p.id} className={active ? 'projects__item is-active' : 'projects__item'}>
                  <button
                    type="button"
                    className="projects__name"
                    aria-expanded={active}
                    onClick={() => navigate({ project: p.id, version: p.versions[0].design_version, tab: route.tab })}
                  >
                    {p.name}
                    {p.id !== p.name && <span className="projects__path">{p.id}</span>}
                  </button>
                  {active && (
                    <ol className="versions" aria-label={`${p.name} 설계 버전`}>
                      {p.versions.map((v) => (
                        <li key={v.design_version}>
                          <button
                            type="button"
                            className="versions__item"
                            aria-current={v.design_version === route.version ? 'true' : undefined}
                            onClick={() => navigate({ project: p.id, version: v.design_version, tab: route.tab })}
                          >
                            <span className="versions__num">v{v.design_version}</span>
                            <span className="versions__date">{formatDate(v.created_at)}</span>
                            {v.db_validation && (
                              <Badge tone={v.db_validation === 'PASSED' ? 'pass' : 'fail'}>
                                DB {v.db_validation === 'PASSED' ? '통과' : '실패'}
                              </Badge>
                            )}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="sidebar__foot">
          <label className="button button--ghost filebutton">
            design.json 직접 열기
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void openLocalFile(f); e.target.value = '' }}
            />
          </label>
          {projects.state === 'ready' && (
            <button type="button" className="textbutton" onClick={reloadProjects}>목록 새로고침</button>
          )}
        </div>
      </aside>

      <main id="main" className="main">
        {current === null || current.state === 'loading' ? (
          <p className="muted pad">불러오는 중…</p>
        ) : current.state === 'error' ? (
          <p className="error pad">{current.message}</p>
        ) : ctx && (
          <DesignContext.Provider value={ctx}>
            <Header localName={route.project === LOCAL ? localDesign?.name : undefined} />
            <nav className="tabs" aria-label="산출물">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="tabs__item"
                  aria-current={t.id === route.tab ? 'page' : undefined}
                  onClick={() => navigate({ ...route, tab: t.id, focus: undefined })}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="view"><View /></div>
          </DesignContext.Provider>
        )}
      </main>
    </div>
  )
}

function Header({ localName }: { localName?: string }) {
  const { design } = useDesign()
  const { meta, completion } = design
  const passed = completion.checks.filter((c) => c.passed).length
  const total = completion.checks.length
  return (
    <header className="header">
      <div className="header__text">
        <h1 className="header__title">{meta.document.file_name}</h1>
        <p className="header__meta">
          <span>설계 버전 v{meta.design_version}</span>
          <span>{formatDate(meta.generated_at)}</span>
          <span className="code">{meta.run_id}</span>
          {localName && <span>직접 연 파일: {localName}</span>}
        </p>
      </div>
      <div className={passed === total ? 'verdict verdict--pass' : 'verdict verdict--fail'}>
        <span className="verdict__count">{passed}<span className="verdict__total">/{total}</span></span>
        <span className="verdict__label">{passed === total ? '완료 조건 충족' : '완료 조건 미충족'}</span>
      </div>
    </header>
  )
}
