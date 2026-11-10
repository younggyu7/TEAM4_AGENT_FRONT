import { BellSimple, Check } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { dismissNotice, getNotices, type Notice } from '../../api'
import { formatDate } from '../../labels'
import type { ShellBase } from './Shell'
import { Badge, cx, type Tone } from './ui'

/** 알림이 바뀌었다 (확인·작업 완료): 홈 카드와 사이드바가 같이 다시 읽는다 */
export const NOTICES_CHANGED = 'notices:changed'

export const NOTICE_KIND: Record<Notice['kind'], { tone: Tone; label: string }> = {
  directive: { tone: 'warn', label: '수정 지시' }, waiting: { tone: 'neutral', label: '대기' },
  request: { tone: 'info', label: '승인 요청' }, decide: { tone: 'info', label: '승인 대기' }, develop: { tone: 'ok', label: '개발 대기' },
  rejected: { tone: 'danger', label: '반려' },
  uploaded: { tone: 'neutral', label: '분석 완료' }, spec_redone: { tone: 'info', label: '다시 만듦' }, erd_draft: { tone: 'neutral', label: 'ERD 초안' }, developed: { tone: 'ok', label: '개발 초안' },
  merge_request: { tone: 'info', label: '합치기 요청' }, merged: { tone: 'ok', label: '합치기 완료' }, merge_rejected: { tone: 'danger', label: '합치기 반려' },
  task_assigned: { tone: 'warn', label: '작업 배정' }, released: { tone: 'ok', label: '릴리스' },
  develop_failed: { tone: 'danger', label: '개발 실패' },
}

/** 나에게 온 알림: 화면을 열 때, 30초마다, 알림이 바뀌었을 때 다시 읽는다. dismiss는 확인(나에게서만 지움) */
export function useNotices(reloadKey?: unknown) {
  const [list, setList] = useState<Notice[] | null>(null)
  const load = useCallback(() => { getNotices().then(setList).catch(() => setList((l) => l ?? [])) }, [])
  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30_000)
    window.addEventListener(NOTICES_CHANGED, load)
    return () => { window.clearInterval(timer); window.removeEventListener(NOTICES_CHANGED, load) }
  }, [load, reloadKey])
  const dismiss = useCallback((n: Notice) => {
    setList((l) => l?.filter((x) => !(x.id === n.id && x.project === n.project)) ?? null)
    dismissNotice(n.project, n.id).finally(() => window.dispatchEvent(new Event(NOTICES_CHANGED)))
  }, [])
  return { list, dismiss }
}

/** 알림 한 줄: 제목을 누르면 그 화면으로(알림은 남김), '확인'(✓)을 누르면 그 화면으로 가면서 알림을 지운다 */
export function NoticeItem({ n, navigate, onDismiss, compact, showProject }: {
  n: Notice; navigate: ShellBase['navigate']; onDismiss: (n: Notice) => void; compact?: boolean; showProject?: boolean
}) {
  const kind = NOTICE_KIND[n.kind] ?? { tone: 'neutral' as Tone, label: '알림' }
  const go = () => navigate({ name: 'workspace', project: n.project, version: n.version, page: n.page })
  return (
    <li className={cx('flex items-start gap-1', compact ? 'rounded-md hover:bg-sunken' : '')}>
      <button type="button" onClick={go} title={n.kind === 'develop_failed' ? n.detail : '이 화면으로 (알림은 남김)'}
        className={cx('flex min-w-0 flex-1 items-start gap-2 rounded-md text-left', compact ? 'px-2 py-1.5' : 'px-3 py-2.5 hover:bg-sunken')}>
        {compact ? <BellSimple size={13} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" /> : <Badge tone={kind.tone}>{kind.label}</Badge>}
        <span className="min-w-0 flex-1">
          <span className={cx('block font-medium', compact ? 'text-small leading-snug' : 'truncate text-label')}>{n.title}</span>
          <span className={cx('block text-fg-3', compact ? 'text-micro' : n.kind === 'develop_failed' ? 'line-clamp-6 whitespace-pre-line break-all text-small' : 'truncate text-small')}>
            {[showProject ? n.project : '', compact ? kind.label : n.detail, formatDate(n.at)].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      <button type="button" onClick={() => { onDismiss(n); go() }} aria-label={`확인하고 이동: ${n.title}`} title="확인: 이 화면으로 가고 알림을 지움"
        className={cx('shrink-0 rounded-md text-fg-3 hover:bg-sunken hover:text-fg', compact ? 'mt-1 p-1' : 'mt-2 inline-flex items-center gap-1 px-2 py-1 text-small')}>
        <Check size={compact ? 13 : 14} aria-hidden="true" />{!compact && '확인하고 이동'}
      </button>
    </li>
  )
}

/** 왼쪽 사이드바 '알림' (설계 버전 위): 보고 있는 프로젝트가 있으면 그 프로젝트, 없으면 내 알림 전체 */
export function SidebarNotices({ navigate, project }: { navigate: ShellBase['navigate']; project?: string }) {
  const { list, dismiss } = useNotices(project)
  const shown = (list ?? []).filter((n) => !project || n.project === project)
  return (
    <section aria-labelledby="side-notices">
      <h2 id="side-notices" className="eyebrow mb-1 flex items-center justify-between px-3">
        <span>알림</span>{shown.length > 0 && <span className="rounded-full bg-danger px-1.5 text-micro text-card tabular-nums">{shown.length}</span>}
      </h2>
      {list === null ? <p className="px-3 text-micro text-fg-3">불러오는 중…</p>
        : shown.length === 0 ? <p className="px-3 text-micro text-fg-3">새 알림이 없습니다.</p>
        : <ul className="max-h-64 space-y-0.5 overflow-y-auto">{shown.slice(0, 20).map((n) => (
            <NoticeItem key={`${n.project}:${n.id}`} n={n} navigate={navigate} onDismiss={dismiss} compact showProject={!project} />))}</ul>}
    </section>
  )
}
