import { ArrowsClockwise, CaretDown, FolderSimple, House, List, SignOut, TreeStructure, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Project } from '../../types'
import { draftSummaries } from '../lib/draft'
import type { Load } from '../lib/data'
import type { Route } from '../lib/route'
import { initials, type User } from '../lib/session'
import { VersionGraph } from './VersionGraph'
import { cx, fmt, IconButton } from './ui'

/** 모든 화면이 같이 쓰는 값 (App이 만든다) */
export interface ShellBase {
  user: User
  onSignOut: () => void
  route: Route
  navigate: (r: Route, replace?: boolean) => void
  projects: Load<Project[]>
  onReloadProjects: () => void
}

interface ShellProps extends ShellBase {
  header: ReactNode
  insights: ReactNode
  children: ReactNode
}

/** 3단 화면: 왼쪽 사용자·대시보드 / 가운데 초안 / 오른쪽 진행 상황. 1024px 아래에서는 왼쪽이 서랍, 1280px 아래에서는 오른쪽이 아래로 내려간다. */
export function Shell({ user, onSignOut, route, navigate, projects, onReloadProjects, header, insights, children }: ShellProps) {
  const drawer = useRef<HTMLDialogElement>(null)
  const main = useRef<HTMLElement>(null)
  const firstRoute = useRef(true)
  const routeKey = route.name === 'workspace' ? `${route.project}@${route.version}/${route.page}` : route.name

  // 화면이 바뀌면 서랍을 닫고, 화면 읽기 사용자를 위해 본문으로 포커스를 옮긴다
  useEffect(() => {
    drawer.current?.close()
    if (firstRoute.current) { firstRoute.current = false; return }
    main.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  }, [routeKey])

  const sidebar = (inDrawer: boolean) => (
    <Sidebar
      user={user}
      onSignOut={onSignOut}
      route={route}
      navigate={navigate}
      projects={projects}
      onReloadProjects={onReloadProjects}
      onClose={inDrawer ? () => drawer.current?.close() : undefined}
    />
  )

  return (
    <div className="min-h-dvh bg-canvas text-fg lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        본문으로 건너뛰기
      </a>

      {/* 넓은 화면: 고정 사이드바 */}
      <aside className="hidden border-r border-line lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto">
        {sidebar(false)}
      </aside>

      {/* 좁은 화면: 상단 막대 + 서랍 */}
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-canvas/95 px-3 py-2 backdrop-blur lg:hidden">
        <IconButton label="메뉴 열기" icon={<List />} onClick={() => drawer.current?.showModal()} />
        <Brand compact />
        <span className="ml-auto inline-flex size-8 items-center justify-center rounded-md bg-card text-small font-semibold ring-1 ring-line" aria-hidden="true">
          {initials(user.name)}
        </span>
      </div>
      <dialog
        ref={drawer}
        aria-label="메뉴"
        className="m-0 h-dvh max-h-dvh w-[288px] max-w-[85vw] border-r border-line bg-canvas p-0 text-fg backdrop:bg-black/40 lg:hidden"
        onClick={(e) => { if (e.target === e.currentTarget) drawer.current?.close() }}
      >
        {sidebar(true)}
      </dialog>

      <div className="min-w-0 px-4 pt-4 pb-10 sm:px-6 lg:px-6 lg:pt-5">
        {header}
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <main id="main" ref={main} tabIndex={-1} className="min-w-0 focus:outline-none">
            {children}
          </main>
          <aside aria-label="진행 상황" className="min-w-0 space-y-4 xl:sticky xl:top-5 xl:max-h-[calc(100dvh-2.5rem)] xl:overflow-y-auto">
            {insights}
          </aside>
        </div>
      </div>
    </div>
  )
}

/** 왼쪽 프로젝트 목록에 처음 보이는 수 (넘으면 '더보기') */
const PROJECTS_SHOWN = 3
/** 프로젝트 목록을 펼쳤는지 (화면을 옮길 때마다 사이드바가 새로 그려지므로 밖에 둔다) */
let projectsExpanded = false
/** 프로젝트의 마지막 수정 시각: 가장 최근에 만든 버전의 생성 시각 */
const lastChanged = (p: Project) => p.versions.reduce((m, v) => (v.created_at && v.created_at > m ? v.created_at : m), '')

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary">
        <TreeStructure size={18} weight="bold" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-label font-semibold">Req Agent</span>
        {!compact && <span className="block truncate text-micro text-fg-3">설계 초안 작업실</span>}
      </span>
    </div>
  )
}

function Sidebar({ user, onSignOut, route, navigate, projects, onReloadProjects, onClose }: {
  user: User
  onSignOut: () => void
  route: Route
  navigate: (r: Route) => void
  projects: Load<Project[]>
  onReloadProjects: () => void
  onClose?: () => void
}) {
  const list = projects.state === 'ready' ? projects.data : []
  const current = route.name === 'workspace' ? route : null
  const project = current ? list.find((p) => p.id === current.project) : undefined
  // 최근에 버전이 생긴(수정한) 프로젝트가 위. 접으면 PROJECTS_SHOWN개만 보이고 '더보기'로 펼친다.
  // 보고 있는 프로젝트가 그 아래에 있으면 마지막 자리에 넣어 접어도 보이게 한다 (개수는 그대로).
  // 펼침 상태는 화면을 옮겨도(사이드바가 다시 그려져도) 유지한다
  const [expanded, setExpandedState] = useState(projectsExpanded)
  const setExpanded = (v: boolean) => { projectsExpanded = v; setExpandedState(v) }
  const sorted = useMemo(() => [...list].sort((a, b) => lastChanged(b).localeCompare(lastChanged(a))), [list])
  const hidden = Math.max(0, sorted.length - PROJECTS_SHOWN)
  const top = sorted.slice(0, PROJECTS_SHOWN)
  const picked = sorted.find((p) => p.id === current?.project)
  const shown = expanded ? sorted
    : picked && !top.includes(picked) ? [...top.slice(0, PROJECTS_SHOWN - 1), picked] : top

  // 초안은 이 브라우저 저장소에 있으므로 화면을 옮길 때마다 다시 센다
  const drafts = useMemo(() => draftSummaries(), [route])
  const inProgress = drafts.filter((d) => d.edited > 0 && d.finalized === 0).length
  const finalized = drafts.filter((d) => d.finalized > 0).length

  return (
    <div className="flex min-h-full flex-col gap-5 px-3 py-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <Brand />
        {onClose && <IconButton label="메뉴 닫기" icon={<X />} onClick={onClose} />}
      </div>

      {/* 사용자 정보 */}
      <section aria-label="사용자 정보" className="rounded-lg border border-line bg-card p-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-sunken text-label font-semibold">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-semibold">{user.name}</p>
            <p className="truncate text-small text-fg-3">{user.role}</p>
          </div>
          <IconButton label="로그아웃" icon={<SignOut />} onClick={onSignOut}
            className="size-8 hover:bg-danger-soft hover:text-danger [&>svg]:size-[18px]" />
        </div>
        <p className="mt-2 truncate text-small text-fg-3" title={user.email}>{user.email}</p>
      </section>

      {/* 메뉴 */}
      <nav aria-label="주 메뉴">
        <ul className="space-y-0.5">
          <NavItem icon={<House />} label="홈" active={route.name === 'home'} onClick={() => navigate({ name: 'home' })} />
        </ul>
      </nav>

      {/* 보고 있는 프로젝트의 버전 트리 (아래 기능 명세 → 가운데 ERD → 위 최종 산출물, 다시 만든 기능 명세는 갈라져 나온다) */}
      {current && project && (
        <VersionGraph project={project} version={current.version} navigate={navigate} onReloadProjects={onReloadProjects} />
      )}

      {/* 사용자 대시보드 */}
      <section aria-labelledby="my-dashboard">
        <h2 id="my-dashboard" className="eyebrow mb-2 px-1">My dashboard</h2>
        <dl className="grid grid-cols-3 gap-1.5">
          <MiniStat term="프로젝트" value={list.length} />
          <MiniStat term="편집 중" value={inProgress} />
          <MiniStat term="확정" value={finalized} />
        </dl>
      </section>

      {/* 프로젝트 목록 */}
      <section aria-labelledby="project-list" className="min-h-0">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <h2 id="project-list" className="eyebrow">Projects</h2>
          <IconButton label="프로젝트 목록 새로고침" icon={<ArrowsClockwise />} className="size-7 [&>svg]:size-4" onClick={onReloadProjects} />
        </div>
        {projects.state === 'loading' && <p role="status" className="px-2.5 text-small text-fg-3">불러오는 중…</p>}
        {projects.state === 'error' && <p role="alert" className="px-2.5 text-small text-danger">목록을 불러오지 못했습니다.</p>}
        <ul className="space-y-0.5">
          {shown.map((p) => {
            const active = current?.project === p.id
            const latest = p.versions[0]
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => navigate({ name: 'workspace', project: p.id, version: latest.design_version, page: current?.page ?? 'spec' })}
                  className={cx(
                    'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors duration-150',
                    active ? 'bg-card ring-1 ring-line' : 'hover:bg-card',
                  )}
                >
                  <FolderSimple size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-label', active ? 'font-semibold' : 'text-fg-2')}>{p.name}</span>
                    <span className="block text-micro text-fg-3 tabular-nums">v{latest.design_version} · 버전 {p.versions.length}개</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 flex min-h-8 w-full items-center gap-1.5 rounded-md px-2.5 text-small text-fg-3 transition-colors duration-150 hover:bg-card hover:text-fg"
          >
            <CaretDown size={14} aria-hidden="true" className={cx('transition-transform duration-200', expanded && 'rotate-180')} />
            {expanded ? '접기' : `더보기 (${fmt(hidden)}개)`}
          </button>
        )}
      </section>

    </div>
  )
}

function NavItem({ icon, label, active, disabled, onClick }: {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-label transition-colors duration-150 [&>svg]:size-[18px]',
          'disabled:cursor-not-allowed disabled:opacity-45',
          active ? 'bg-card font-semibold text-fg ring-1 ring-line' : 'text-fg-2 hover:bg-card hover:text-fg',
        )}
      >
        <span aria-hidden="true" className="inline-flex">{icon}</span>
        {label}
      </button>
    </li>
  )
}

function MiniStat({ term, value }: { term: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-card px-2.5 py-2">
      <dt className="text-micro text-fg-3">{term}</dt>
      <dd className="text-subtitle font-medium tabular-nums">{fmt(value)}</dd>
    </div>
  )
}
