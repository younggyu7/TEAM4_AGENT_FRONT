import { ArrowDown, ArrowUp, CheckCircle, FloppyDisk, PaperPlaneTilt, XCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import {
  approveWork, assignWork, getLayout, getWork, getWorkItem, rejectWork, saveLayout, submitWork,
  type LayoutData, type WorkItem, type WorkOverview, type WorkStatus,
} from '../../api'
import { formatDate } from '../../labels'
import { repoChanged } from '../lib/repo'
import { can, NEEDS, type User } from '../lib/session'
import { Modal } from './DevelopActions'
import { Badge, Button, cx, ErrorNote, Loading, TextArea, TextInput } from './ui'

const TONE: Record<WorkStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'danger'> = {
  unassigned: 'neutral', assigned: 'warn', in_progress: 'info', review: 'info', done: 'ok', rejected: 'danger',
}
const KINDS: { kind: WorkItem['kind']; label: string; note: string }[] = [
  { kind: 'common_ui', label: '공통 화면 틀', note: '앱 틀·홈·메뉴·부품·테마 (대시보드 모양 등 모든 메뉴에 걸친 화면)' },
  { kind: 'ui', label: '화면 (메뉴별)', note: '메뉴마다 화면 파일 menus/<메뉴>.tsx와 그 메뉴의 AI 화면' },
  { kind: 'common_server', label: '공통 서버·DB', note: '인증·공통 코드·schema·seed·Docker·배포' },
  { kind: 'function', label: '서버 (기능별)', note: '기능의 API·업무 로직·인수 테스트' },
]

/**
 * 최종 개발물 1단계 '작업 묶음': 코드를 사람에게 나눠 맡기는 단위 (FR-050·051).
 * 개발자가 담당자를 배정하면 작업 브랜치(task/<묶음>)가 생기고, 담당자가 VS Code 확장(또는 웹 코드 보기)에서 고쳐 제출하면
 * 다른 개발자가 승인(dev에 합침)·반려한다. 개발자 담당자가 한 명이면 본인 승인을 허용한다.
 */
export function WorkBundles({ project, user, refreshKey }: { project: string; user: User; refreshKey?: string }) {
  const [data, setData] = useState<WorkOverview | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { brief: WorkItem } | { reject: WorkItem } | { submit: WorkItem }>(null)
  const manage = can(user, 'develop')
  const load = useCallback(() => {
    getWork(project).then((d) => { setData(d); setError('') }).catch((e) => setError((e as Error).message))
  }, [project])
  useEffect(() => { load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t) }, [load, refreshKey])

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setBusy(key)
    setNote('')
    try {
      await run()
      setNote(done)
      repoChanged()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy('')
      load()
    }
  }

  if (error) return <ErrorNote message={error} onRetry={load} />
  if (!data) return <Loading label="작업 묶음을 읽는 중" lines={3} />
  const alone = data.developers.length <= 1
  const total = data.items.length
  return (
    <section aria-label="작업 묶음" className="space-y-3">
      <div className="rounded-lg border border-line bg-card p-3">
        <h3 className="mb-2 flex flex-wrap items-center gap-2 text-label font-semibold">진행 현황
          <span className="font-normal text-fg-3">묶음 {total}개 · 개발자 담당자 {data.developers.length}명{alone ? ' (한 명이라 본인 승인 가능)' : ''}</span></h3>
        <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          {(['done', 'review', 'in_progress', 'assigned', 'rejected'] as WorkStatus[]).map((s) => data.counts[s] ? (
            <span key={s} style={{ width: `${(data.counts[s] / total) * 100}%` }}
              className={cx(s === 'done' ? 'bg-ok' : s === 'rejected' ? 'bg-danger' : s === 'assigned' ? 'bg-warn' : 'bg-info')} />
          ) : null)}
        </div>
        <p className="mt-2 flex flex-wrap gap-2 text-small">
          {(Object.keys(data.labels) as WorkStatus[]).map((s) => <Badge key={s} tone={TONE[s]}>{data.labels[s]} {data.counts[s]}</Badge>)}
        </p>
        {data.people.length > 0 && (
          <ul className="mt-2 grid gap-1 text-small sm:grid-cols-2">
            {data.people.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-20 truncate">{p.name}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full bg-ok" style={{ width: `${(p.done / p.total) * 100}%` }} /></span>
                <span className="tabular-nums text-fg-3">{p.done}/{p.total}{p.review ? ` · 승인 대기 ${p.review}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {note && <p role="status" className="rounded-md bg-sunken px-3 py-1.5 text-small">{note}</p>}
      {KINDS.map(({ kind, label, note: hint }) => {
        const rows = data.items.filter((i) => i.kind === kind)
        if (!rows.length) return null
        return (
          <details key={kind} open={kind !== 'function'} className="rounded-lg border border-line bg-card">
            <summary className="cursor-pointer px-3 py-2 text-label font-semibold">{label} <span className="font-normal text-fg-3">{rows.length}개 · {hint}</span></summary>
            <ul className="divide-y divide-line">
              {rows.map((i) => {
                const mine = i.assignee?.id === user.id
                const canReview = manage && i.status === 'review' && (!mine || alone)
                return (
                  <li key={i.key} className="px-3 py-2 text-small">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => setOpen(open === i.key ? null : i.key)}
                        title="파일 목록 보기">{i.title}</button>
                      <span className="text-fg-3 tabular-nums">파일 {i.file_count}{i.empty_holes ? ` · 빈 로직 ${i.empty_holes}` : ''}{i.ai_files ? ` · AI ${i.ai_files}` : ''}</span>
                      <Badge tone={TONE[i.status]}>{i.status_label}{i.self_approved ? ' · 본인 승인' : ''}</Badge>
                      {manage && i.status !== 'review' ? (
                        <select aria-label={`${i.title} 담당자`} value={i.assignee?.id ?? ''} disabled={busy === i.key}
                          onChange={(e) => { const id = Number(e.target.value); if (id) void act(i.key, () => assignWork(project, i.key, id), `${i.title}: 배정했습니다 (브랜치 ${'task/' + i.key}).`) }}
                          className="min-h-8 rounded-md border border-control bg-card px-2">
                          <option value="">{i.assignee ? i.assignee.name : '담당자 배정…'}</option>
                          {data.developers.filter((d) => d.id !== i.assignee?.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : <span className="text-fg-2">{i.assignee?.name ?? '미배정'}</span>}
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ brief: i })}>무엇을 어떻게</Button>
                      {mine && ['assigned', 'in_progress', 'rejected'].includes(i.status) && (
                        <Button size="sm" variant="secondary" icon={<PaperPlaneTilt />} disabled={busy === i.key || !i.ahead}
                          title={i.ahead ? '다른 개발자에게 승인을 요청합니다 (묶음 밖 파일이 있으면 거부)' : '작업 브랜치에 저장한 커밋이 없습니다'}
                          onClick={() => setDialog({ submit: i })}>제출</Button>
                      )}
                      {canReview && <>
                        <Button size="sm" variant="ok" icon={<CheckCircle />} disabled={busy === i.key}
                          onClick={() => void act(i.key, () => approveWork(project, i.key), `${i.title}: 승인해 dev에 합쳤습니다.`)}>승인</Button>
                        <Button size="sm" variant="ghost" icon={<XCircle />} disabled={busy === i.key} onClick={() => setDialog({ reject: i })}>반려</Button>
                      </>}
                      {manage && i.status === 'review' && mine && !alone && <span className="text-micro text-fg-3">자기 작업은 다른 개발자가 승인</span>}
                    </div>
                    {i.reason && i.status === 'rejected' && <p className="mt-1 text-danger">반려 사유: {i.reason}</p>}
                    {i.branch && <p className="mt-1 text-micro text-fg-3">브랜치 {i.branch}{i.ahead ? ` · dev보다 커밋 ${i.ahead}개 앞섬` : ''}{i.behind ? ` · dev보다 ${i.behind}개 뒤처짐` : ''}</p>}
                    {open === i.key && (
                      <ul className="mt-2 max-h-48 overflow-auto rounded-md bg-sunken p-2 font-mono text-micro">
                        {i.files.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
      {!manage && <p className="text-micro text-fg-3">{NEEDS.develop} (배정·승인·반려)</p>}
      {dialog && 'brief' in dialog && <BriefDialog project={project} item={dialog.brief} onClose={() => setDialog(null)} />}
      {dialog && 'submit' in dialog && (
        <NoteDialog title={`제출 · ${dialog.submit.title}`} label="검토자에게 남길 말 (선택)" action="제출" onClose={() => setDialog(null)}
          onSend={(text) => act(dialog.submit.key, () => submitWork(project, dialog.submit.key, text), '제출했습니다. 다른 개발자가 승인·반려하면 알림이 옵니다.').then(() => setDialog(null))} />
      )}
      {dialog && 'reject' in dialog && (
        <NoteDialog title={`반려 · ${dialog.reject.title}`} label="반려 사유 (필수)" action="반려" required onClose={() => setDialog(null)}
          onSend={(text) => act(dialog.reject.key, () => rejectWork(project, dialog.reject.key, text), '반려했습니다.').then(() => setDialog(null))} />
      )}
    </section>
  )
}

function BriefDialog({ project, item, onClose }: { project: string; item: WorkItem; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getWorkItem(project, item.key).then((r) => setText(r.brief)).catch((e) => setError((e as Error).message)) }, [project, item.key])
  return (
    <Modal wide title={`무엇을 어떻게 · ${item.title}`} onClose={onClose}>
      {error ? <p className="text-danger">{error}</p> : text === null ? <Loading label="작업 설명을 읽는 중" lines={4} />
        : <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-sunken p-3 text-small">{text}</pre>}
      {item.history.length > 0 && (
        <ul className="text-micro text-fg-3">{item.history.map((h, n) => <li key={n}>{formatDate(h.at)} · {h.by.name} · {h.what}</li>)}</ul>
      )}
    </Modal>
  )
}

function NoteDialog({ title, label, action, required, onClose, onSend }: {
  title: string; label: string; action: string; required?: boolean; onClose: () => void; onSend: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  return (
    <Modal title={title} onClose={onClose}>
      <label className="block text-small">{label}
        <TextArea dense rows={3} value={text} onChange={(e) => setText(e.target.value)} className="mt-1" /></label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button variant="primary" disabled={sending || (required && !text.trim())} onClick={() => { setSending(true); void onSend(text.trim()).finally(() => setSending(false)) }}>{action}</Button>
      </div>
    </Modal>
  )
}

/**
 * 화면 구성 (FR-049): 생성 앱의 메뉴 이름·순서·숨김, 메뉴 안 업무 이름·숨김, 홈 칸. 저장하면 dev에 커밋하고 다음 실행 미리보기부터 보인다.
 * 화면 모양 자체(디자인·배치)는 '공통 화면 틀'·'화면 (메뉴별)' 작업으로 사람에게 맡긴다.
 */
export function LayoutEditor({ project, user }: { project: string; user: User }) {
  const [layout, setLayout] = useState<LayoutData | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const editable = can(user, 'develop')
  useEffect(() => { getLayout(project).then((r) => setLayout(r.layout)).catch((e) => setError((e as Error).message)) }, [project])
  if (error) return <p className="text-small text-danger">{error}</p>
  if (!layout) return <Loading label="화면 구성을 읽는 중" lines={2} />
  const home = { todo: true, notices: true, areas: true, ...layout.home }
  const setMenu = (n: number, patch: Partial<LayoutData['menu'][number]>) =>
    setLayout({ ...layout, menu: layout.menu.map((m, i) => (i === n ? { ...m, ...patch } : m)) })
  const move = (n: number, d: -1 | 1) => {
    const menu = [...layout.menu]
    const t = n + d
    if (t < 0 || t >= menu.length) return
    ;[menu[n], menu[t]] = [menu[t], menu[n]]
    setLayout({ ...layout, menu })
  }
  const save = async () => {
    setSaving(true)
    setNote('')
    try {
      const r = await saveLayout(project, layout)
      setLayout(r.layout)
      setNote(r.commit ? `저장해 dev에 커밋했습니다 (${r.commit.slice(0, 8)}). 다음 실행 미리보기부터 보입니다.` : '바뀐 것이 없습니다.')
      repoChanged()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2 text-small">
      <p className="flex flex-wrap gap-3">홈에 보일 칸:
        {(['todo', 'notices', 'areas'] as const).map((k) => (
          <label key={k} className="inline-flex items-center gap-1">
            <input type="checkbox" disabled={!editable} checked={home[k]} onChange={(e) => setLayout({ ...layout, home: { ...home, [k]: e.target.checked } })} />
            {k === 'todo' ? '처리할 일' : k === 'notices' ? '공지사항' : '업무 영역 목록'}
          </label>
        ))}
      </p>
      <ol className="space-y-1.5">
        {layout.menu.map((m, n) => (
          <li key={m.group} className={cx('rounded-md border border-line p-2', m.hidden && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-fg-3 tabular-nums">{n + 1}</span>
              <TextInput dense aria-label={`${m.group} 메뉴 이름`} value={m.name} disabled={!editable} onChange={(e) => setMenu(n, { name: e.target.value })} className="max-w-xs" />
              <span className="text-micro text-fg-3">{m.group} · 업무 {m.pages.length}</span>
              <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={m.hidden} onChange={(e) => setMenu(n, { hidden: e.target.checked })} />숨김</label>
              <Button size="sm" variant="ghost" icon={<ArrowUp />} disabled={!editable || n === 0} onClick={() => move(n, -1)} aria-label="위로" />
              <Button size="sm" variant="ghost" icon={<ArrowDown />} disabled={!editable || n === layout.menu.length - 1} onClick={() => move(n, 1)} aria-label="아래로" />
            </div>
            <ul className="ml-8 mt-1 grid gap-1 sm:grid-cols-2">
              {m.pages.map((p, k) => (
                <li key={p.screens.join(',')} className="flex items-center gap-1">
                  <TextInput dense aria-label="업무 이름" value={p.name} disabled={!editable}
                    onChange={(e) => setMenu(n, { pages: m.pages.map((q, j) => (j === k ? { ...q, name: e.target.value } : q)) })} />
                  <label className="inline-flex shrink-0 items-center gap-1 text-micro"><input type="checkbox" disabled={!editable} checked={p.hidden}
                    onChange={(e) => setMenu(n, { pages: m.pages.map((q, j) => (j === k ? { ...q, hidden: e.target.checked } : q)) })} />숨김</label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" icon={<FloppyDisk />} disabled={!editable || saving} title={editable ? 'dev에 커밋합니다' : NEEDS.develop} onClick={() => void save()}>화면 구성 저장</Button>
        {note && <span role="status" className="text-fg-2">{note}</span>}
      </div>
    </div>
  )
}

