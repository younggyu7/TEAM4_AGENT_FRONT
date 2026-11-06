import { ArrowsClockwise, CaretDoubleLeft, CaretDoubleRight, CaretDown, Check, FolderSimple, House, List, PencilSimple, PushPin, PushPinSlash, SignOut, Trash, TreeStructure, UsersThree, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { renameProject } from '../../api'
import type { Project } from '../../types'
import type { Load } from '../lib/data'
import type { Route } from '../lib/route'
import { can, initials, NEEDS, type User } from '../lib/session'
import { readStore, writeStore } from '../lib/storage'
import { SidebarNotices } from './Notices'
import { ProjectDeleteDialog } from './ProjectDeleteDialog'
import { VersionGraph } from './VersionGraph'
import { cx, fmt, IconButton, TextInput } from './ui'

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

  // 사이드바 크기·접기·고정 (이 브라우저에 기억). 왼쪽: 끌어서 너비 조절·접기 / 오른쪽: 고정하면 끌어서 너비 조절, 풀면 숨겼다가 오른쪽 끝에 마우스를 대면 나타남
  const [layout, setLayout] = useState<Layout>(() => ({ ...DEFAULT_LAYOUT, ...(readStore<Partial<Layout>>('layout') ?? {}) }))
  const [peek, setPeek] = useState(false)
  // 고정을 풀었을 때: 오른쪽 끝에 잠깐 머물러야 열고(실수로 스치면 안 열림), 패널에서 벗어나도 잠깐 뒤에 닫는다
  const peekTimer = useRef(0)
  const peekLater = (open: boolean, ms: number) => { window.clearTimeout(peekTimer.current); peekTimer.current = window.setTimeout(() => setPeek(open), ms) }
  useEffect(() => () => window.clearTimeout(peekTimer.current), [])
  const save = (next: Partial<Layout>) => setLayout((l) => { const v = { ...l, ...next }; writeStore('layout', v); return v })
  const leftW = layout.leftOpen ? layout.left : 44
  const pinned = layout.rightPinned

  return (
    <div className="min-h-dvh bg-canvas text-fg lg:grid lg:grid-cols-[var(--left-w)_minmax(0,1fr)]"
      style={{ '--left-w': `${leftW}px`, '--right-w': `${layout.right}px` } as CSSProperties}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        본문으로 건너뛰기
      </a>

      {/* 넓은 화면: 고정 사이드바 */}
      <aside className="relative hidden border-r border-line lg:sticky lg:top-0 lg:block lg:h-dvh">
        {layout.leftOpen ? (
          <>
            <div className="h-full overflow-y-auto">{sidebar(false)}</div>
            <button type="button" onClick={() => save({ leftOpen: false })} aria-label="왼쪽 메뉴 접기" title="메뉴 접기"
              className="absolute top-3 right-2 z-10 rounded-md p-1 text-fg-3 hover:bg-sunken hover:text-fg">
              <CaretDoubleLeft size={14} aria-hidden="true" />
            </button>
            <ResizeHandle side="right" label="왼쪽 메뉴 너비" value={layout.left} min={200} max={440} onChange={(left) => save({ left })} />
          </>
        ) : (
          <div className="flex h-full flex-col items-center gap-2 pt-3">
            <button type="button" onClick={() => save({ leftOpen: true })} aria-label="왼쪽 메뉴 펼치기" title="메뉴 펼치기"
              className="rounded-md p-1.5 text-fg-3 hover:bg-sunken hover:text-fg">
              <CaretDoubleRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
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
        <div className={cx('mt-4 grid gap-4 xl:items-start',
          Boolean(insights) && (pinned ? 'xl:grid-cols-[minmax(0,1fr)_var(--right-w)]' : 'xl:flex xl:gap-0'))}>
          <main id="main" ref={main} tabIndex={-1} className="min-w-0 focus:outline-none xl:flex-1">
            {children}
          </main>
          {insights && (
            // 고정: 늘 보이는 칸 (왼쪽 선으로 너비 조절) / 고정 풀림: 너비 0에서 천천히 늘어나며 본문을 밀어 나온다.
            // 고정일 때 칸은 화면 높이로 두고 안쪽 div만 스크롤한다: 너비 조절 선이 스크롤과 같이 밀려 올라가지 않고 칸 끝까지 이어지게
            <aside aria-label="진행 상황"
              onMouseEnter={() => { if (!pinned) peekLater(true, 0) }} onMouseLeave={() => { if (!pinned) peekLater(false, 400) }}
              className={cx('min-w-0',
                pinned ? 'xl:sticky xl:top-5 xl:h-[calc(100dvh-2.5rem)] xl:pl-2'
                  : 'space-y-4 xl:sticky xl:top-5 xl:w-[var(--peek-w)] xl:shrink-0 xl:overflow-hidden xl:transition-[width] xl:duration-500 xl:ease-in-out')}
              style={pinned ? undefined : { '--peek-w': peek ? `${layout.right + 16}px` : '0px' } as CSSProperties}>
              <div className={cx('space-y-4', pinned ? 'xl:h-full xl:overflow-y-auto'
                : 'xl:max-h-[calc(100dvh-2.5rem)] xl:w-[var(--right-w)] xl:overflow-y-auto xl:ml-4')}>
                <div className="hidden justify-end xl:flex">
                  <button type="button" onClick={() => { save({ rightPinned: !pinned }); setPeek(false) }}
                    aria-pressed={pinned} title={pinned ? '고정 풀기: 숨겼다가 오른쪽 끝에 마우스를 잠깐 대면 나타남' : '고정: 늘 보이고 너비를 조절'}
                    className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-micro hover:bg-sunken', pinned ? 'text-fg-2' : 'text-fg-3')}>
                    {pinned ? <PushPin size={13} weight="fill" aria-hidden="true" /> : <PushPinSlash size={13} aria-hidden="true" />}{pinned ? '고정됨' : '고정'}
                  </button>
                </div>
                {insights}
              </div>
              {pinned && <ResizeHandle side="left" label="오른쪽 패널 너비" value={layout.right} min={260} max={560} onChange={(right) => save({ right })} />}
            </aside>
          )}
          {/* 고정을 풀었을 때: 오른쪽 끝에 마우스를 잠깐(0.3초) 대면 패널이 나온다 */}
          {insights && !pinned && !peek && (
            // 오른쪽(스크롤 막대·창 밖)으로 벗어나는 것은 취소하지 않는다: 그쪽은 화면이 마우스를 못 보지만 '끝으로 민' 것이다.
            // 왼쪽(본문 쪽)으로 돌아올 때만 취소한다
            <div aria-hidden="true" onMouseEnter={() => peekLater(true, 300)}
              onMouseLeave={(e) => { if (e.clientX < e.currentTarget.getBoundingClientRect().left) window.clearTimeout(peekTimer.current) }}
              className="fixed top-0 right-0 z-30 hidden h-dvh w-6 xl:block" />
          )}
        </div>
      </div>
    </div>
  )
}

type Layout = { left: number; leftOpen: boolean; right: number; rightPinned: boolean }
const DEFAULT_LAYOUT: Layout = { left: 256, leftOpen: true, right: 340, rightPinned: true }

/** 사이드바 경계선: 마우스로 끌어 너비를 바꾼다 (키보드: ←·→). side = 사이드바의 어느 쪽 가장자리인지 */
function ResizeHandle({ side, label, value, min, max, onChange }: {
  side: 'left' | 'right'; label: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)))
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = value
    const move = (ev: PointerEvent) => onChange(clamp(w0 + (side === 'right' ? ev.clientX - x0 : x0 - ev.clientX)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = '' }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      onPointerDown={start}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onChange(clamp(value + ((e.key === 'ArrowRight') === (side === 'right') ? 16 : -16))) }}
      className={cx('absolute top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none',
        side === 'right' ? '-right-[3px]' : 'left-0')} />
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
  // 서버의 버전 기록으로 센다 (어느 PC에서 보든 같다): 팀장이 최종본을 승인한 프로젝트 / 아직인 프로젝트
  const approved = list.filter((p) => p.versions.some((v) => v.stage === 'final' && v.approval?.decision === 'approve')).length

  // 프로젝트 이름 오른쪽 클릭 → 작은 메뉴 ('프로젝트 삭제', 팀장만) → 이름을 적는 확인 창
  const [menu, setMenu] = useState<{ project: Project; x: number; y: number } | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const canDelete = can(user, 'project_delete')
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])
  // 프로젝트 이름 옆 연필 (팀장만, 설계 버전 제목처럼): 화면·Slack에 보이는 이름만 바꾸고 프로젝트 ID·주소는 그대로
  const canRename = can(user, 'project_rename')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState('')
  const startRename = (p: Project) => { setRenaming(p.id); setDraftName(p.name); setRenameError('') }
  const saveName = async (id: string) => {
    setRenameBusy(true)
    setRenameError('')
    try {
      await renameProject(id, draftName)
      setRenaming(null)
      onReloadProjects()
    } catch (e) {
      setRenameError((e as Error).message)
    } finally {
      setRenameBusy(false)
    }
  }
  const onDeleted = (id: string) => {
    setDeleting(null)
    if (current?.project === id) navigate({ name: 'home' })
    onReloadProjects()
  }

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
            <p className="truncate text-small text-fg-3">{user.role_label}{user.is_admin ? ' · 관리자' : ''}</p>
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
          {user.is_admin && <NavItem icon={<UsersThree />} label="관리자 페이지" active={route.name === 'members'} onClick={() => navigate({ name: 'members' })} />}
        </ul>
      </nav>

      {/* 나에게 온 알림 (설계 버전 위): 보고 있는 프로젝트가 있으면 그 프로젝트, 없으면 전체. '확인'을 누르면 사라진다 */}
      <SidebarNotices navigate={navigate} project={current && project ? current.project : undefined} />

      {/* 보고 있는 프로젝트의 버전 트리 (아래 기능 명세 → 가운데 ERD → 위 최종 산출물, 다시 만든 기능 명세는 갈라져 나온다) */}
      {current && project && (
        <VersionGraph project={project} version={current.version} navigate={navigate} onReloadProjects={onReloadProjects} />
      )}

      {/* 사용자 대시보드 */}
      <section aria-labelledby="my-dashboard">
        <h2 id="my-dashboard" className="eyebrow mb-2 px-1">My dashboard</h2>
        <dl className="grid grid-cols-3 gap-1.5">
          <MiniStat term="프로젝트" value={list.length} />
          <MiniStat term="진행 중" value={list.length - approved} />
          <MiniStat term="최종 승인" value={approved} />
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
                {renaming === p.id ? (
                  <form className="flex min-h-10 items-center gap-1 rounded-md bg-card px-1.5 py-1 ring-1 ring-line"
                    onSubmit={(e) => { e.preventDefault(); void saveName(p.id) }}>
                    <TextInput dense autoFocus aria-label={`${p.name} 프로젝트 이름`} value={draftName} maxLength={80} disabled={renameBusy}
                      placeholder={p.id.split('/').pop()}
                      onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null) }} />
                    <IconButton type="submit" label="이름 저장" icon={<Check />} disabled={renameBusy} className="size-7" />
                    <IconButton label="취소" icon={<X />} onClick={() => setRenaming(null)} disabled={renameBusy} className="size-7" />
                  </form>
                ) : (
                  <div className={cx('group flex items-center rounded-md transition-colors duration-150', active ? 'bg-card ring-1 ring-line' : 'hover:bg-card')}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => navigate({ name: 'workspace', project: p.id, version: latest.design_version, page: current?.page ?? 'spec' })}
                      onContextMenu={(e) => { e.preventDefault(); setMenu({ project: p, x: e.clientX, y: e.clientY }) }}
                      className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left"
                    >
                      <FolderSimple size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cx('block truncate text-label', active ? 'font-semibold' : 'text-fg-2')}>{p.name}</span>
                        <span className="block text-micro text-fg-3 tabular-nums">
                          v{latest.design_version} · 버전 {p.versions.length}개
                          {p.versions.some((v) => v.stage === 'final' && v.approval?.decision === 'approve') && <span className="ml-1 font-medium text-ok">· 승인</span>}
                        </span>
                      </span>
                    </button>
                    {canRename && (
                      <IconButton label={`${p.name} 이름 바꾸기`} icon={<PencilSimple />}
                        className="mr-1 size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => startRename(p)} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {renameError && <p role="alert" className="px-2.5 pt-1 text-small text-danger">이름을 바꾸지 못했습니다: {renameError}</p>}
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

      {menu && (
        <div role="menu" aria-label={`${menu.project.name} 메뉴`} onPointerDown={(e) => e.stopPropagation()}
          style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 60) }}
          className="fixed z-50 w-48 rounded-md border border-line bg-card p-1 shadow-lg">
          <button type="button" role="menuitem" autoFocus disabled={!canDelete} title={canDelete ? undefined : NEEDS.project_delete}
            onClick={() => { setDeleting(menu.project); setMenu(null) }}
            className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-small text-danger transition-colors duration-150 hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent">
            <Trash size={14} aria-hidden="true" /> 프로젝트 삭제
          </button>
          {!canDelete && <p className="px-2.5 pb-1 text-micro text-fg-3">팀장만 지울 수 있습니다</p>}
        </div>
      )}
      <ProjectDeleteDialog project={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
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
