import { ArrowDown, ArrowUp, CheckCircle, FloppyDisk, PaperPlaneTilt, Plus, Sparkle, XCircle } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import {
  approveWork, assignMany, assignWork, getLayout, getWork, getWorkItem, rejectWork, saveLayout, submitWork, suggestLayout,
  type LayoutData, type LayoutSection, type WorkItem, type WorkOverview, type WorkStatus,
} from '../../api'
import { formatDate } from '../../labels'
import { repoChanged } from '../lib/repo'
import { can, NEEDS, type User } from '../lib/session'
import { Modal } from './DevelopActions'
import { Badge, Button, cx, ErrorNote, Loading, TextArea, TextInput } from './ui'

const TONE: Record<WorkStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'danger'> = {
  unassigned: 'neutral', assigned: 'warn', in_progress: 'info', review: 'info', done: 'ok', rejected: 'danger',
}
type Filter = 'all' | 'unassigned' | 'active' | 'done'
const FILTERS: { id: Filter; label: string; test: (i: WorkItem) => boolean }[] = [
  { id: 'all', label: '전체', test: () => true },
  { id: 'unassigned', label: '미배정', test: (i) => i.status === 'unassigned' },
  { id: 'active', label: '진행 중', test: (i) => ['assigned', 'in_progress', 'review', 'rejected'].includes(i.status) },
  { id: 'done', label: '완료', test: (i) => i.status === 'done' },
]

/**
 * 최종 개발물 1단계 '작업 묶음': 코드를 사람에게 나눠 맡기는 단위 (FR-050·051).
 * 업무 영역(화면 구성의 비슷한 메뉴 묶음)마다 한 줄에 화면 묶음·서버 묶음을 두고, 공통 화면 틀·공통 서버·DB는 맨 위 '공통' 줄.
 * 칸이나 줄을 골라 한 사람에게 한꺼번에 배정한다. 배정하면 작업 브랜치(task/<묶음>)가 생기고, 담당자가 VS Code 확장(또는 웹 코드 보기)에서
 * 고쳐 제출하면 다른 개발자가 승인(dev에 합침)·반려한다. 개발자 담당자가 한 명이면 본인 승인을 허용한다.
 */
export function WorkBundles({ project, user, refreshKey }: { project: string; user: User; refreshKey?: string }) {
  const [data, setData] = useState<WorkOverview | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState(0)
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
  const byKey = new Map(data.items.map((i) => [i.key, i]))
  const pick = (k: string) => byKey.get(k)
  const selectable = (i?: WorkItem) => Boolean(i && manage && i.status !== 'review')
  const toggle = (keys: string[], on: boolean) => setPicked((p) => {
    const n = new Set(p)
    keys.forEach((k) => (on ? n.add(k) : n.delete(k)))
    return n
  })
  const test = FILTERS.find((f) => f.id === filter)!.test
  type Row = { id: string; name: string; note: string; cells: [WorkItem | undefined, WorkItem | undefined] }
  const rows = ([
    { id: '_common', name: '공통', note: '앱 틀·홈·부품·테마 / 인증·공통 코드·DB·Docker', cells: [pick('common-ui'), pick('common-server')] },
    ...data.areas.map((a) => ({ id: a.id, name: a.name, note: a.menus.map((m) => m.name).join(', '), cells: [a.screen ? pick(a.screen) : undefined, a.server ? pick(a.server) : undefined] })),
  ] as Row[]).filter((r) => r.cells.some((c) => c && test(c)))
  const pickedItems = [...picked].map(pick).filter((i): i is WorkItem => selectable(i))
  const assignPicked = () => {
    const keys = pickedItems.map((i) => i.key)
    void act('_bulk', async () => {
      const r = await assignMany(project, keys, target)
      setPicked(new Set())
      const failed = r.results.filter((x) => !x.ok)
      if (failed.length) throw new Error(`${r.assigned}개 배정, ${failed.length}개 실패: ${failed.map((x) => `${pick(x.key)?.title ?? x.key} — ${x.error}`).join(' / ')}`)
    }, `${keys.length}개를 ${data.developers.find((d) => d.id === target)?.name}님에게 배정했습니다 (묶음마다 작업 브랜치 task/<묶음>).`)
  }

  const cell = (i: WorkItem | undefined, label: string) => {
    if (!i) return <div className="rounded-md border border-dashed border-line p-2 text-micro text-fg-3">{label} 파일 없음</div>
    const mine = i.assignee?.id === user.id
    const canReview = manage && i.status === 'review' && (!mine || alone)
    return (
      <div className={cx('min-w-0 rounded-md border p-2', picked.has(i.key) ? 'border-primary bg-primary/5' : 'border-line', !test(i) && 'opacity-50')}>
        <div className="flex flex-wrap items-center gap-1.5">
          {manage && <input type="checkbox" aria-label={`${i.title} 고르기`} disabled={!selectable(i)} checked={picked.has(i.key)} onChange={(e) => toggle([i.key], e.target.checked)} />}
          <span className="text-micro font-medium text-fg-3">{label}</span>
          <Badge tone={TONE[i.status]}>{i.status_label}{i.self_approved ? ' · 본인 승인' : ''}</Badge>
          <button type="button" className="text-micro text-fg-3 tabular-nums hover:underline" onClick={() => setOpen(open === i.key ? null : i.key)} title="파일 목록 보기">
            파일 {i.file_count}{i.empty_holes ? ` · 빈 로직 ${i.empty_holes}` : ''}{i.ai_files ? ` · AI ${i.ai_files}` : ''}</button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {manage && i.status !== 'review' ? (
            <select aria-label={`${i.title} 담당자`} value={i.assignee?.id ?? ''} disabled={busy === i.key}
              onChange={(e) => { const id = Number(e.target.value); if (id) void act(i.key, () => assignWork(project, i.key, id), `${i.title}: 배정했습니다 (브랜치 ${'task/' + i.key}).`) }}
              className="min-h-8 max-w-[10rem] rounded-md border border-control bg-card px-2 text-small">
              <option value="">{i.assignee ? i.assignee.name : '담당자 배정…'}</option>
              {data.developers.filter((d) => d.id !== i.assignee?.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : <span className="text-small text-fg-2">{i.assignee?.name ?? '미배정'}</span>}
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
        {i.reason && i.status === 'rejected' && <p className="mt-1 text-small text-danger">반려 사유: {i.reason}</p>}
        {i.branch && <p className="mt-1 truncate text-micro text-fg-3" title={i.branch}>{i.branch}{i.ahead ? ` · 커밋 ${i.ahead}개 앞섬` : ''}{i.behind ? ` · dev보다 ${i.behind}개 뒤처짐` : ''}</p>}
        {open === i.key && (
          <ul className="mt-2 max-h-48 overflow-auto rounded-md bg-sunken p-2 font-mono text-micro">
            {i.files.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
      </div>
    )
  }

  return (
    <section aria-label="작업 묶음" className="space-y-3">
      <div className="rounded-lg border border-line bg-card p-3">
        <h3 className="mb-2 flex flex-wrap items-center gap-2 text-label font-semibold">진행 현황
          <span className="font-normal text-fg-3">업무 영역 {data.areas.length}개 · 묶음 {total}개 · 개발자 담당자 {data.developers.length}명{alone ? ' (한 명이라 본인 승인 가능)' : ''}</span></h3>
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

      <div className="flex flex-wrap items-center gap-2 text-small">
        <span role="group" aria-label="보기" className="inline-flex overflow-hidden rounded-md border border-line">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={cx('px-2.5 py-1', filter === f.id ? 'bg-primary text-on-primary' : 'hover:bg-sunken')}>{f.label}</button>
          ))}
        </span>
        {manage && (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" title="보이는 줄의 화면 묶음을 모두 고릅니다 (프론트 담당)"
              onClick={() => toggle(rows.map((r) => r.cells[0]).filter((c): c is WorkItem => selectable(c) && c!.kind === 'ui').map((c) => c.key), true)}>화면 전체 고르기</Button>
            <Button size="sm" variant="ghost" title="보이는 줄의 서버 묶음을 모두 고릅니다 (백엔드 담당)"
              onClick={() => toggle(rows.map((r) => r.cells[1]).filter((c): c is WorkItem => selectable(c) && c!.kind === 'server').map((c) => c.key), true)}>서버 전체 고르기</Button>
          </span>
        )}
        {manage && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="text-fg-3">고른 묶음 {pickedItems.length}개를</span>
            <select aria-label="한꺼번에 배정할 담당자" value={target || ''} onChange={(e) => setTarget(Number(e.target.value))}
              className="min-h-8 rounded-md border border-control bg-card px-2">
              <option value="">담당자…</option>
              {data.developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <Button size="sm" variant="primary" disabled={!pickedItems.length || !target || busy === '_bulk'} onClick={assignPicked}>한꺼번에 배정</Button>
            {picked.size > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>선택 해제</Button>}
          </span>
        )}
      </div>
      {note && <p role="status" className="rounded-md bg-sunken px-3 py-1.5 text-small">{note}</p>}

      <div className="rounded-lg border border-line bg-card">
        <div className="hidden grid-cols-[minmax(9rem,1fr)_2fr_2fr] gap-2 border-b border-line px-3 py-1.5 text-micro font-medium text-fg-3 md:grid">
          <span>업무 영역</span><span>화면 (메뉴 화면 설계·구현)</span><span>서버 (API·업무 로직·테스트)</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            // 화면 / 서버 / 모두 선택: 누르면 이 줄은 그것만 고른 상태가 되고, 켜진 것을 다시 누르면 해제
            const [front, back] = r.cells.map((c) => (selectable(c) ? c!.key : null))
            const f = Boolean(front && picked.has(front))
            const b = Boolean(back && picked.has(back))
            const choices: { label: string; keys: string[]; on: boolean }[] = [
              { label: '화면', keys: front ? [front] : [], on: f && !b },
              { label: '서버', keys: back ? [back] : [], on: b && !f },
              { label: '모두 선택', keys: front && back ? [front, back] : [], on: f && b },
            ]
            const on = (keys: string[]) => choices.find((c) => c.keys === keys)!.on
            return (
              <li key={r.id} className="grid gap-2 px-3 py-2 md:grid-cols-[minmax(9rem,1fr)_2fr_2fr]">
                <div className="min-w-0">
                  <p className="text-label font-semibold break-keep">{r.name}</p>
                  <p className="mt-0.5 line-clamp-3 text-micro text-fg-3" title={r.note}>{r.note}</p>
                  {manage && (
                    <span role="group" aria-label={`${r.name} 고르기`} className="mt-1.5 inline-flex overflow-hidden rounded-md border border-line text-micro">
                      {choices.map((c) => (
                        <button key={c.label} type="button" aria-pressed={on(c.keys)} disabled={!c.keys.length}
                          title={c.keys.length ? `${r.name}의 ${c.label === '모두 선택' ? '화면·서버' : c.label} 묶음을 고릅니다 (다시 누르면 해제)` : '고를 수 있는 묶음이 없습니다 (승인 대기 중이거나 파일 없음)'}
                          onClick={() => {
                            const all = [front, back].filter((k): k is string => Boolean(k))
                            if (on(c.keys)) toggle(c.keys, false)
                            else { toggle(all, false); toggle(c.keys, true) }
                          }}
                          className={cx('px-2 py-0.5 disabled:opacity-40', on(c.keys) ? 'bg-primary text-on-primary' : 'hover:bg-sunken')}>{c.label}</button>
                      ))}
                    </span>
                  )}
                </div>
                {cell(r.cells[0], r.id === '_common' ? '공통 화면 틀' : '화면')}
                {cell(r.cells[1], r.id === '_common' ? '공통 서버·DB' : '서버')}
              </li>
            )
          })}
          {rows.length === 0 && <li className="px-3 py-4 text-small text-fg-3">이 보기에 해당하는 묶음이 없습니다.</li>}
        </ul>
      </div>
      <p className="text-micro text-fg-3">업무 영역은 위 '화면 구성 · 업무 영역'에서 묶습니다 (비슷한 메뉴끼리 · AI 제안 가능). 영역마다 화면·서버·모두 선택 중에 고르거나 칸의 체크로 하나씩 고릅니다. '화면 전체'·'서버 전체'로 프론트·백엔드 담당에게 나눠 맡길 수 있습니다.</p>
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
 * 화면 구성 (FR-049): 생성 앱의 업무 영역(비슷한 메뉴 묶음)·메뉴 이름·숨김, 메뉴 안 업무 이름·숨김, 홈 칸.
 * 영역은 앱의 왼쪽 메뉴(영역 → 메뉴)·홈 영역 카드와 작업 묶음(화면 · / 서버 · <영역>)이 같이 쓴다. 저장하면 dev에 커밋한다.
 * '규칙으로 다시 묶기'·'AI로 묶기 제안'은 저장하지 않고 화면에만 불러온다. 진행 중인 작업이 있는 영역은 메뉴를 넣거나 빼지 못한다.
 * 화면 모양 자체(디자인·배치)는 '공통 화면 틀'·'화면 · <영역>' 작업으로 사람에게 맡긴다.
 */
export function LayoutEditor({ project, user, onSaved }: { project: string; user: User; onSaved?: () => void }) {
  const [layout, setLayout] = useState<LayoutData | null>(null)
  const [locked, setLocked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [dirty, setDirty] = useState(false)
  const editable = can(user, 'develop')
  useEffect(() => {
    getLayout(project).then((r) => { setLayout(r.layout); setLocked(r.locked) }).catch((e) => setError((e as Error).message))
  }, [project])
  if (error) return <p className="text-small text-danger">{error}</p>
  if (!layout) return <Loading label="화면 구성을 읽는 중" lines={2} />
  const home = { todo: true, notices: true, areas: true, ...layout.home }
  const menuOf = new Map(layout.menu.map((m) => [m.group, m]))
  const change = (next: LayoutData) => { setLayout(next); setDirty(true) }
  const setSection = (id: string, patch: Partial<LayoutSection>) =>
    change({ ...layout, sections: layout.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const setMenu = (group: string, patch: Partial<LayoutData['menu'][number]>) =>
    change({ ...layout, menu: layout.menu.map((m) => (m.group === group ? { ...m, ...patch } : m)) })
  const swap = <T,>(list: T[], n: number, d: -1 | 1): T[] => {
    const out = [...list]
    const t = n + d
    if (t < 0 || t >= out.length) return list
    ;[out[n], out[t]] = [out[t], out[n]]
    return out
  }
  const moveMenu = (group: string, from: string, to: string) => {
    let sections = layout.sections.map((s) => (s.id === from ? { ...s, menus: s.menus.filter((g) => g !== group) } : s))
    if (to === '_new') sections = [...sections, { id: `new-${Date.now().toString(36)}`, name: menuOf.get(group)?.name ?? '새 영역', menus: [group] }]
    else sections = sections.map((s) => (s.id === to ? { ...s, menus: [...s.menus, group] } : s))
    change({ ...layout, sections: sections.filter((s) => s.menus.length > 0) })
  }
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    setNote('')
    try { await task() } catch (e) { setNote((e as Error).message) } finally { setBusy('') }
  }
  const suggest = (mode: 'rules' | 'ai') => run(mode, async () => {
    const r = await suggestLayout(project, mode, layout)
    change(r.layout)
    setNote(`${mode === 'ai' ? `AI 제안${r.usage ? ` (입력 ${r.usage.input_tokens.toLocaleString()} · 출력 ${r.usage.output_tokens.toLocaleString()} 토큰)` : ''}` : '규칙으로 다시 묶은 결과'}을 불러왔습니다: 영역 ${r.layout.sections.length}개. 확인하고 고친 뒤 '화면 구성 저장'을 누르세요 (아직 저장 안 됨).`)
  })
  const save = () => run('save', async () => {
    const r = await saveLayout(project, layout)
    setLayout(r.layout)
    setLocked(r.locked)
    setDirty(false)
    if (r.commit) onSaved?.()
    setNote(r.commit ? `저장해 dev에 커밋했습니다 (${r.commit.slice(0, 8)}). 작업 묶음이 새 영역으로 바뀌고, 앱은 다음 실행 미리보기부터 보입니다.` : '바뀐 것이 없습니다.')
    repoChanged()
  })
  return (
    <div className="space-y-3 text-small">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!editable || Boolean(busy)} onClick={() => void suggest('rules')}
          title="같은 테이블을 쓰거나 이름이 비슷한 메뉴끼리 묶습니다 (AI 없음, 비용 없음)">규칙으로 다시 묶기</Button>
        <Button size="sm" variant="secondary" icon={<Sparkle />} disabled={!editable || Boolean(busy)} onClick={() => void suggest('ai')}
          title="AI가 업무가 비슷한 메뉴끼리 묶고 영역 이름을 짓습니다 (메뉴·업무 이름만 보냄, 토큰 사용)">{busy === 'ai' ? 'AI가 묶는 중…' : 'AI로 묶기 제안'}</Button>
        <Button size="sm" variant="ghost" icon={<Plus />} disabled={!editable}
          onClick={() => change({ ...layout, sections: [...layout.sections, { id: `new-${Date.now().toString(36)}`, name: '새 영역', menus: [] }] })}>새 영역</Button>
        <span className="text-fg-3">영역 {layout.sections.length}개 · 메뉴 {layout.menu.length}개</span>
      </div>
      <p className="flex flex-wrap gap-3">홈에 보일 칸:
        {(['todo', 'notices', 'areas'] as const).map((k) => (
          <label key={k} className="inline-flex items-center gap-1">
            <input type="checkbox" disabled={!editable} checked={home[k]} onChange={(e) => change({ ...layout, home: { ...home, [k]: e.target.checked } })} />
            {k === 'todo' ? '처리할 일' : k === 'notices' ? '공지사항' : '업무 영역 카드'}
          </label>
        ))}
      </p>
      <ol className="space-y-2">
        {layout.sections.map((s, n) => {
          const isLocked = locked.includes(s.id)
          return (
            <li key={s.id}>
              <details className="rounded-lg border border-line bg-card">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-5 text-fg-3 tabular-nums">{n + 1}</span>
                  <span className="font-semibold">{s.name || '(이름 없음)'}</span>
                  <span className="text-micro text-fg-3">메뉴 {s.menus.length}개{s.menus.length ? ` · ${s.menus.map((g) => menuOf.get(g)?.name ?? g).slice(0, 4).join(', ')}${s.menus.length > 4 ? ' …' : ''}` : ' · 비어 있어 저장할 때 지워짐'}</span>
                  {isLocked && <Badge tone="warn">진행 중 작업 · 메뉴 이동 불가</Badge>}
                </summary>
                <div className="space-y-2 border-t border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <TextInput dense aria-label="영역 이름" value={s.name} disabled={!editable} onChange={(e) => setSection(s.id, { name: e.target.value })} className="max-w-xs" />
                    <Button size="sm" variant="ghost" icon={<ArrowUp />} disabled={!editable || n === 0} aria-label="영역 위로"
                      onClick={() => change({ ...layout, sections: swap(layout.sections, n, -1) })} />
                    <Button size="sm" variant="ghost" icon={<ArrowDown />} disabled={!editable || n === layout.sections.length - 1} aria-label="영역 아래로"
                      onClick={() => change({ ...layout, sections: swap(layout.sections, n, 1) })} />
                  </div>
                  <ul className="space-y-1.5">
                    {s.menus.map((g, k) => {
                      const m = menuOf.get(g)
                      if (!m) return null
                      return (
                        <li key={g} className={cx('rounded-md border border-line p-2', m.hidden && 'opacity-60')}>
                          <div className="flex flex-wrap items-center gap-2">
                            <TextInput dense aria-label={`${g} 메뉴 이름`} value={m.name} disabled={!editable} onChange={(e) => setMenu(g, { name: e.target.value })} className="max-w-xs" />
                            <span className="text-micro text-fg-3">{g} · 업무 {m.pages.length}</span>
                            <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={m.hidden} onChange={(e) => setMenu(g, { hidden: e.target.checked })} />숨김</label>
                            <Button size="sm" variant="ghost" icon={<ArrowUp />} disabled={!editable || k === 0} aria-label="메뉴 위로" onClick={() => setSection(s.id, { menus: swap(s.menus, k, -1) })} />
                            <Button size="sm" variant="ghost" icon={<ArrowDown />} disabled={!editable || k === s.menus.length - 1} aria-label="메뉴 아래로" onClick={() => setSection(s.id, { menus: swap(s.menus, k, 1) })} />
                            <select aria-label={`${m.name} 영역 옮기기`} value="" disabled={!editable || isLocked}
                              title={isLocked ? '진행 중인 작업이 있는 영역입니다' : '다른 영역으로 옮깁니다'}
                              onChange={(e) => { if (e.target.value) moveMenu(g, s.id, e.target.value) }}
                              className="min-h-8 rounded-md border border-control bg-card px-2">
                              <option value="">영역 옮기기…</option>
                              {layout.sections.filter((o) => o.id !== s.id && !locked.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                              <option value="_new">새 영역으로</option>
                            </select>
                          </div>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-micro text-fg-3">업무 {m.pages.length}개 이름·숨김</summary>
                            <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                              {m.pages.map((p, j) => (
                                <li key={p.screens.join(',')} className="flex items-center gap-1">
                                  <TextInput dense aria-label="업무 이름" value={p.name} disabled={!editable}
                                    onChange={(e) => setMenu(g, { pages: m.pages.map((q, i) => (i === j ? { ...q, name: e.target.value } : q)) })} />
                                  <label className="inline-flex shrink-0 items-center gap-1 text-micro"><input type="checkbox" disabled={!editable} checked={p.hidden}
                                    onChange={(e) => setMenu(g, { pages: m.pages.map((q, i) => (i === j ? { ...q, hidden: e.target.checked } : q)) })} />숨김</label>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </details>
            </li>
          )
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={<FloppyDisk />} disabled={!editable || busy === 'save'} title={editable ? 'dev에 커밋합니다' : NEEDS.develop} onClick={() => void save()}>화면 구성 저장</Button>
        {dirty && <span className="text-warn">저장하지 않은 변경이 있습니다</span>}
        {note && <span role="status" className="text-fg-2">{note}</span>}
      </div>
    </div>
  )
}
