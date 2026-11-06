import { ArrowDown, CloudArrowUp, GitBranch, GitMerge, GitPullRequest, Plus, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  checkRemote, createBranch, deleteBranch, getBranchDiff, getGitSettings, getRepo, getRepoCommit, getRepoLog, mergeRequest, rejectRequest,
  requestMerge, updateBranch, ApiError, type CommitDetail, type DiffFile, type GitSettings, type MergeRequest, type RepoCommit, type RepoOverview,
} from '../../api'
import { formatDate } from '../../labels'
import { startGitJob } from '../lib/jobs'
import { repoChanged, useRepoBranch, useRepoVersion } from '../lib/repo'
import { can, NEEDS, type User } from '../lib/session'
import { Modal } from './DevelopActions'
import { Badge, Button, Card, CardHeader, cx, ErrorNote, Label, Loading, TextArea, TextInput } from './ui'

const ROW = 30            // 커밋 한 줄 높이 (그래프 칸과 같다)
const LANE = 12           // 그래프 칸 너비
const LANE_COLORS = ['var(--fg-3)', 'var(--info)', 'var(--warn)', 'var(--series-2)', 'var(--series-1)']

type GraphRow = { col: number; before: (string | null)[]; after: (string | null)[]; merges: number[]; joins: number[] }

/** 커밋 목록(최신이 먼저) → 줄마다 칸 배치. before/after = 그 줄 위·아래를 지나는 칸(기다리는 커밋 sha) */
function layout(commits: RepoCommit[]): { rows: GraphRow[]; width: number } {
  let lanes: (string | null)[] = []
  let width = 1
  const rows = commits.map((c) => {
    const before = [...lanes]
    let col = lanes.indexOf(c.sha)
    if (col < 0) { col = lanes.indexOf(null); if (col < 0) { col = lanes.length; lanes.push(null) } }
    // 같은 커밋을 기다리던 다른 칸은 여기서 만난다
    const joins = lanes.map((s, i) => (s === c.sha && i !== col ? i : -1)).filter((i) => i >= 0)
    joins.forEach((i) => { lanes[i] = null })
    lanes[col] = c.parents[0] ?? null
    const merges: number[] = []
    for (const p of c.parents.slice(1)) {
      let at = lanes.indexOf(p)
      if (at < 0) { at = lanes.indexOf(null); if (at < 0) { at = lanes.length; lanes.push(null) } lanes[at] = p }
      merges.push(at)
    }
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    width = Math.max(width, before.length, lanes.length, col + 1)
    const row = { col, before, after: [...lanes], merges, joins }
    lanes = [...lanes]
    return row
  })
  return { rows, width }
}

const x = (i: number) => LANE / 2 + i * LANE

function GraphCell({ row, width, ai, head }: { row: GraphRow; width: number; ai: boolean; head: boolean }) {
  const mid = ROW / 2
  const color = (i: number) => LANE_COLORS[i % LANE_COLORS.length]
  return (
    <svg width={width * LANE} height={ROW} aria-hidden="true" className="shrink-0">
      {row.before.map((s, i) => s && i !== row.col && !row.joins.includes(i) && row.after[i] === s
        ? <line key={`t${i}`} x1={x(i)} y1={0} x2={x(i)} y2={ROW} stroke={color(i)} strokeWidth={1.5} /> : null)}
      {row.before[row.col] && <line x1={x(row.col)} y1={0} x2={x(row.col)} y2={mid} stroke={color(row.col)} strokeWidth={1.5} />}
      {row.joins.map((i) => <path key={`j${i}`} d={`M${x(i)} 0 Q${x(i)} ${mid} ${x(row.col)} ${mid}`} fill="none" stroke={color(i)} strokeWidth={1.5} />)}
      {row.after[row.col] && <line x1={x(row.col)} y1={mid} x2={x(row.col)} y2={ROW} stroke={color(row.col)} strokeWidth={1.5} />}
      {row.merges.map((i) => <path key={`m${i}`} d={`M${x(row.col)} ${mid} Q${x(i)} ${mid} ${x(i)} ${ROW}`} fill="none" stroke={color(i)} strokeWidth={1.5} />)}
      <circle cx={x(row.col)} cy={mid} r={head ? 5 : 4} fill={ai ? 'var(--ai)' : 'var(--ok)'} stroke="var(--card)" strokeWidth={1.5} />
    </svg>
  )
}

const errorText = (e: unknown) => {
  const message = (e as Error).message
  return e instanceof ApiError && e.status === 409 ? `충돌: ${message}` : message
}

/**
 * 최종 개발물 오른쪽 '코드 저장소' (GitKraken처럼): 모든 브랜치의 커밋을 칸 그래프로 보여 준다.
 * 보라 점 = AI(최종 개발하기, req-agent) 커밋, 초록 점 = 사람 커밋. main은 개발자의 합치기와 최종 개발하기로만 바뀐다.
 * 개발자: 새 브랜치 · 합치기 요청 · 메인 가져오기 · 합치기 요청 차이 보기·합치기·반려 · 원격 올리기 (PM은 보기만).
 */
export function RepoCard({ project, version, user }: { project: string; version: string; user: User }) {
  const [repo, setRepo] = useState<RepoOverview | null>(null)
  const [commits, setCommits] = useState<RepoCommit[] | null>(null)
  const [remote, setRemote] = useState<GitSettings | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [branch, setBranch] = useRepoBranch(project)
  const changed = useRepoVersion()
  const [dialog, setDialog] = useState<null | 'branch' | 'request' | { commit: string } | { diff: MergeRequest } | { reject: MergeRequest }>(null)
  const write = can(user, 'repo_write')
  const head = can(user, 'develop')

  const load = useCallback(() => {
    Promise.all([getRepo(project), getRepoLog(project), getGitSettings(project)])
      .then(([r, l, g]) => { setRepo(r); setCommits(l); setRemote(g); setError('') })
      .catch((e) => setError((e as Error).message))
  }, [project])
  useEffect(() => { load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t) }, [load, changed])
  // 지운 브랜치를 보고 있었으면 main으로
  useEffect(() => { if (repo && !repo.branches.some((b) => b.name === branch)) setBranch('main') }, [repo, branch, setBranch])

  const graph = useMemo(() => (commits ? layout(commits) : null), [commits])
  if (error) return <Card aria-labelledby="repo-card"><CardHeader eyebrow="Repository" title="코드 저장소" titleId="repo-card" /><ErrorNote message={error} onRetry={load} /></Card>
  if (!repo || !commits || !graph) return <Card aria-labelledby="repo-card"><CardHeader eyebrow="Repository" title="코드 저장소" titleId="repo-card" /><Loading label="저장소를 읽는 중" lines={4} /></Card>

  const current = repo.branches.find((b) => b.name === branch) ?? repo.branches[0]
  const mine = current && !current.protected && (current.owner?.id === user.id || head)
  const open = repo.requests.filter((r) => r.status === 'open')
  const act = async (run: () => Promise<string | void>) => {
    setBusy(true)
    setNote('')
    try {
      const msg = await run()
      if (msg) setNote(msg)
      repoChanged()
    } catch (e) {
      setNote(errorText(e))
    } finally {
      setBusy(false)
      load()
    }
  }
  const headSha = repo.branches.find((b) => b.name === 'main')?.head

  return (
    <Card aria-labelledby="repo-card">
      <CardHeader eyebrow="Repository" title="코드 저장소" titleId="repo-card" />
      <div className="space-y-3 text-small">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="shrink-0 text-fg-3" aria-hidden="true" />
          <select aria-label="브랜치" value={current?.name} onChange={(e) => setBranch(e.target.value)}
            className="min-h-8 min-w-0 flex-1 rounded-md border border-control bg-card px-2 text-small text-fg">
            {repo.branches.map((b) => <option key={b.name} value={b.name}>{b.name}{b.protected ? ' (보호)' : b.owner ? ` · ${b.owner.name}` : ''}</option>)}
          </select>
        </div>
        {current && (
          <p className="flex flex-wrap gap-1.5">
            {current.protected
              ? <Badge tone="neutral">main · 직접 고치지 않음</Badge>
              : <>
                  <Badge tone={current.ahead ? 'info' : 'neutral'}>main보다 {current.ahead}개 앞섬</Badge>
                  {current.behind > 0 && <Badge tone="warn">{current.behind}개 뒤처짐</Badge>}
                </>}
            {current.changes > 0 && <Badge tone="info">저장 안 한 변경 {current.changes}</Badge>}
            {current.request && <Badge tone="info">합치기 요청 중</Badge>}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" icon={<Plus />} disabled={!write || busy} title={write ? 'main에서 새 브랜치(작업 폴더)를 만듭니다' : NEEDS.repo_write}
            onClick={() => setDialog('branch')}>새 브랜치</Button>
          {current && !current.protected && <>
            <Button size="sm" variant="secondary" icon={<GitPullRequest />}
              disabled={!write || busy || !current.ahead || current.changes > 0 || Boolean(current.request)}
              title={!write ? NEEDS.repo_write : current.request ? '이미 합치기 요청 중입니다' : current.changes > 0 ? '먼저 코드 보기에서 저장하기를 하세요'
                : !current.ahead ? 'main에 없는 커밋이 없습니다' : '개발자에게 main에 합쳐 달라고 요청합니다'}
              onClick={() => setDialog('request')}>합치기 요청</Button>
            <Button size="sm" variant="ghost" icon={<ArrowDown />} disabled={!write || busy || !current.behind || current.changes > 0}
              title={!write ? NEEDS.repo_write : current.changes > 0 ? '먼저 저장하기를 하세요' : current.behind ? 'main의 새 커밋을 이 브랜치에 합칩니다' : 'main의 최신 내용이 이미 있습니다'}
              onClick={() => void act(async () => (await updateBranch(project, current.name)).message)}>메인 가져오기</Button>
            {mine && write && (
              <Button size="sm" variant="ghost" icon={<Trash />} disabled={busy || Boolean(current.request)} title={current.request ? '열린 합치기 요청이 있어 지우지 않습니다' : '브랜치와 작업 폴더를 지웁니다'}
                onClick={() => { if (window.confirm(`${current.name} 브랜치를 지울까요? 저장하지 않은 변경도 사라집니다.`)) void act(async () => { await deleteBranch(project, current.name); setBranch('main'); return '브랜치를 지웠습니다.' }) }}>지우기</Button>
            )}
          </>}
        </div>
        {note && <p role="status" className="rounded-md bg-sunken px-2.5 py-1.5 text-fg-2">{note}</p>}

        {open.length > 0 && (
          <section aria-label="합치기 요청" className="space-y-1.5">
            <h3 className="text-micro font-medium text-fg-3">합치기 요청 {open.length}건</h3>
            <ul className="space-y-1.5">
              {open.map((r) => (
                <li key={r.id} className="rounded-md border border-line px-2.5 py-2">
                  <p className="flex flex-wrap items-center gap-1.5"><GitMerge size={13} className="text-info" aria-hidden="true" />
                    <code className="text-micro">{r.branch}</code><span className="text-fg-3">{r.by.name} · {formatDate(r.at)}</span></p>
                  {r.note && <p className="mt-0.5 text-fg-2">{r.note}</p>}
                  {r.conflicts.length > 0 && <p className="mt-0.5 text-micro text-danger">충돌: {r.conflicts.join(', ')} — 요청한 사람이 메인 가져오기로 풀어야 합니다</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ diff: r })}>차이 보기</Button>
                    {head && <>
                      <Button size="sm" variant="ok" icon={<GitMerge />} disabled={busy}
                        onClick={() => void act(async () => { const m = await mergeRequest(project, r.id); return `합쳤습니다 (${m.commit?.slice(0, 8)}). 실행 미리보기는 다음에 열 때 새로 빌드합니다.` })}>합치기</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDialog({ reject: r })}>반려</Button>
                    </>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {head && remote && (
          <section aria-label="원격" className="flex flex-wrap items-center gap-1.5 rounded-md bg-sunken px-2.5 py-2">
            <CloudArrowUp size={14} className="text-fg-3" aria-hidden="true" />
            {!remote.url ? <span className="text-fg-3">원격 저장소 없음 (3단계 Git에서 설정)</span>
              : <span className="min-w-0 flex-1 text-fg-2">
                  원격 {remote.branch}: {remote.ahead === null ? '확인 전' : remote.ahead || remote.behind
                    ? <>{remote.ahead}개 앞섬{remote.behind ? <span className="text-danger"> · {remote.behind}개 뒤처짐</span> : ''}</> : '같음'}
                  {remote.error && <span className="block text-micro text-danger">{remote.error}</span>}
                </span>}
            {remote.url && <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(async () => { setRemote(await checkRemote(project)); return '원격을 확인했습니다.' })}>원격 확인</Button>
              <Button size="sm" variant="ok" disabled={busy || Boolean(remote.behind)} title={remote.behind ? '원격에 서버에 없는 커밋이 있어 올리지 않습니다' : 'main과 최종본 태그를 원격에 올립니다'}
                onClick={() => void act(async () => { await startGitJob(project, version, () => { repoChanged() }); return '올리는 중입니다 (3단계 Git에서 진행 확인).' })}>올리기</Button>
            </>}
          </section>
        )}

        <section aria-label="커밋 이력">
          <h3 className="mb-1 flex items-center gap-2 text-micro font-medium text-fg-3">이력
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-ai" />AI</span>
            <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-ok" />사람</span>
          </h3>
          <ol className="max-h-[420px] overflow-auto">
            {commits.map((c, i) => (
              <li key={c.sha}>
                <button type="button" onClick={() => setDialog({ commit: c.sha })} title={`${c.subject}\n${c.author} · ${formatDate(c.date)} · ${c.sha.slice(0, 8)}`}
                  className="flex w-full items-center gap-1.5 rounded-sm text-left hover:bg-sunken" style={{ height: ROW }}>
                  <GraphCell row={graph.rows[i]} width={graph.width} ai={c.ai} head={c.sha === headSha} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1">
                      {c.refs.filter((r) => r.type !== 'head').map((r) => (
                        <span key={r.type + r.name} className={cx('shrink-0 rounded-sm px-1 text-micro',
                          r.type === 'tag' ? 'bg-warn-soft text-warn' : r.type === 'remote' ? 'bg-info-soft text-info'
                            : r.name === 'main' ? 'bg-sunken font-medium text-fg' : 'bg-ok-soft text-ok')}>{r.type === 'tag' ? r.name.replace('final-', '') : r.name}</span>
                      ))}
                      <span className={cx('min-w-0 truncate text-small', c.ai ? 'text-ai' : 'text-fg')}>{c.subject}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {dialog === 'branch' && <NewBranchDialog project={project} user={user} onClose={() => setDialog(null)} onMade={(b) => { setBranch(b); repoChanged(); load() }} />}
      {dialog === 'request' && current && <RequestDialog project={project} branch={current.name} ahead={current.ahead} onClose={() => setDialog(null)} onDone={() => { repoChanged(); load() }} />}
      {dialog && typeof dialog === 'object' && 'commit' in dialog && <CommitDialog project={project} sha={dialog.commit} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'diff' in dialog && <BranchDiffDialog project={project} request={dialog.diff} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && 'reject' in dialog && (
        <RejectDialog request={dialog.reject} onClose={() => setDialog(null)}
          onReject={(reason) => act(async () => { await rejectRequest(project, dialog.reject.id, reason); return '반려했습니다. 요청한 사람에게 알립니다.' })} />
      )}
    </Card>
  )
}

function NewBranchDialog({ project, user, onClose, onMade }: { project: string; user: User; onClose: () => void; onMade: (branch: string) => void }) {
  const [name, setName] = useState(`feature/${user.name.replace(/\s+/g, '')}-`)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()
  const make = async () => {
    setBusy(true)
    try { onMade((await createBranch(project, name)).name); onClose() } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return (
    <Modal title="새 브랜치" onClose={onClose}>
      <p className="text-small text-fg-3">main에서 갈라 서버에 이 브랜치의 작업 폴더를 만듭니다. 코드 보기에서 고치고 '저장하기'로 커밋한 뒤 합치기 요청을 합니다.</p>
      <div><Label htmlFor={id} hint="예: feature/홍길동-로그인">브랜치 이름</Label>
        <TextInput dense id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button variant="primary" icon={<GitBranch />} disabled={busy || !name.trim() || name.trim().endsWith('-')} onClick={() => void make()}>만들기</Button>
      </div>
    </Modal>
  )
}

function RequestDialog({ project, branch, ahead, onClose, onDone }: { project: string; branch: string; ahead: number; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    try { await requestMerge(project, branch, text); onDone(); onClose() } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return (
    <Modal title={`합치기 요청 · ${branch}`} onClose={onClose}>
      <p className="text-small text-fg-3">커밋 {ahead}개를 main에 합쳐 달라고 개발자에게 알립니다. 합치거나 반려하면 알림으로 돌아옵니다.</p>
      <TextArea dense rows={3} aria-label="요청 메모" placeholder="무엇을 고쳤는지 (선택)" value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button variant="primary" icon={<GitPullRequest />} disabled={busy} onClick={() => void send()}>요청</Button>
      </div>
    </Modal>
  )
}

function RejectDialog({ request, onClose, onReject }: { request: MergeRequest; onClose: () => void; onReject: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  return (
    <Modal title={`합치기 요청 반려 · ${request.branch}`} onClose={onClose}>
      <TextArea dense rows={3} aria-label="반려 사유" placeholder="반려 사유 (요청한 사람에게 알림으로 갑니다)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button variant="primary" disabled={!reason.trim()} onClick={() => { void onReject(reason); onClose() }}>반려</Button>
      </div>
    </Modal>
  )
}

function CommitDialog({ project, sha, onClose }: { project: string; sha: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getRepoCommit(project, sha).then(setDetail).catch((e) => setError((e as Error).message)) }, [project, sha])
  return (
    <Modal wide title={detail ? <span className={detail.ai ? 'text-ai' : undefined}>{detail.subject}</span> : '커밋'} onClose={onClose}>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!detail && !error && <Loading label="커밋을 읽는 중" lines={4} />}
      {detail && <>
        <p className="text-small text-fg-3">
          <Badge tone={detail.ai ? 'neutral' : 'ok'} className={detail.ai ? 'bg-ai-soft text-ai' : undefined}>{detail.ai ? 'AI' : '사람'}</Badge>{' '}
          {detail.author} · {formatDate(detail.date)} · <code>{detail.sha.slice(0, 10)}</code>{detail.parents.length > 1 ? ' · 합친 커밋 (첫 부모와 비교)' : ''}
        </p>
        {detail.body && <pre className="whitespace-pre-wrap text-small text-fg-2">{detail.body}</pre>}
        <DiffView files={detail.files} />
      </>}
    </Modal>
  )
}

function BranchDiffDialog({ project, request, onClose }: { project: string; request: MergeRequest; onClose: () => void }) {
  const [diff, setDiff] = useState<{ ahead: number; behind: number; files: DiffFile[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { getBranchDiff(project, request.branch).then(setDiff).catch((e) => setError((e as Error).message)) }, [project, request.branch])
  return (
    <Modal wide title={`차이 보기 · main ← ${request.branch}`} onClose={onClose}>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {!diff && !error && <Loading label="차이를 읽는 중" lines={4} />}
      {diff && <>
        <p className="text-small text-fg-3">{request.by.name} · 커밋 {diff.ahead}개{diff.behind ? ` · main보다 ${diff.behind}개 뒤처짐 (합칠 때 충돌할 수 있음)` : ''}{request.note ? ` · ${request.note}` : ''}</p>
        <DiffView files={diff.files} />
      </>}
    </Modal>
  )
}

const STATUS: Record<string, { label: string; cls: string }> = {
  A: { label: '추가', cls: 'bg-ok-soft text-ok' }, M: { label: '수정', cls: 'bg-info-soft text-info' }, D: { label: '삭제', cls: 'bg-danger-soft text-danger' },
}

/** 바뀐 파일과 diff (+ 초록 / - 빨강, 고정폭). 파일이 많으면 앞의 몇 개만 펼친다 */
export function DiffView({ files }: { files: DiffFile[] }) {
  if (!files.length) return <p className="text-small text-fg-3">바뀐 파일이 없습니다.</p>
  return (
    <div className="max-h-[70vh] space-y-2 overflow-auto">
      <p className="text-small text-fg-2">바뀐 파일 {files.length}개</p>
      {files.map((f, i) => {
        const st = STATUS[f.status] ?? { label: f.status, cls: 'bg-sunken text-fg-2' }
        return (
          <details key={f.path} open={i < 5 && files.length <= 20} className="rounded-md border border-line">
            <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-small">
              <span className={cx('rounded-sm px-1 text-micro', st.cls)}>{st.label}</span>
              <code className="min-w-0 flex-1 truncate">{f.path}</code>
              {f.truncated && <span className="text-micro text-warn">{f.diff ? '일부만' : '너무 커서 생략'}</span>}
            </summary>
            {f.diff && (
              <pre className="overflow-auto border-t border-line bg-card py-1 font-mono text-[12px] leading-5">
                {f.diff.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).map((l, j) => (
                  <div key={j} className={cx('px-2.5 whitespace-pre', l.startsWith('+') ? 'bg-ok-soft text-ok' : l.startsWith('-') ? 'bg-danger-soft text-danger'
                    : l.startsWith('@@') ? 'text-info' : 'text-fg-2')}>{l || ' '}</div>
                ))}
              </pre>
            )}
          </details>
        )
      })}
    </div>
  )
}
