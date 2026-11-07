import { CaretDown, CaretRight, File, FloppyDisk, Folder, GitCommit, PencilSimple } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { commitBranch, getAppFile, getAppFiles, saveAppFile, type AppFile, type AppFileContent, type AppFileTree } from '../../api'
import { repoChanged, useRepoVersion } from '../lib/repo'
import { NEEDS } from '../lib/session'
import { Modal } from './DevelopActions'
import { Badge, Button, Checkbox, cx, ErrorNote, Loading, TextArea } from './ui'

export const MAIN_READONLY = 'dev·main은 직접 고칠 수 없습니다 — 브랜치를 만들어 고치세요'
const CHANGE = { M: '변경', A: '새 파일', D: '지움' } as const

/** 다른 곳(오른쪽 '업무 로직 현황')에서 코드 보기로 파일을 연다: detail = 경로 */
export const OPEN_CODE_FILE = 'develop:open-file'

type Node = { name: string; path: string; file?: AppFile; children: Node[]; empty: number; edited: number; ai: number }

/** 경로 목록 → 폴더 나무 (폴더가 먼저, 이름 순). 폴더에는 안의 빈 로직·고친 파일 수를 더한다 */
function buildTree(files: AppFile[]): Node {
  const root: Node = { name: '', path: '', children: [], empty: 0, edited: 0, ai: 0 }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    parts.forEach((part, i) => {
      node.empty += f.empty_holes
      node.edited += f.edited ? 1 : 0
      node.ai += f.ai_holes + (f.ai_file ? 1 : 0)
      const path = parts.slice(0, i + 1).join('/')
      let child = node.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path, children: [], empty: 0, edited: 0, ai: 0, ...(i === parts.length - 1 ? { file: f } : {}) }
        node.children.push(child)
      }
      if (i === parts.length - 1) { child.empty += f.empty_holes; child.edited += f.edited ? 1 : 0; child.ai += f.ai_holes + (f.ai_file ? 1 : 0) }
      node = child
    })
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name))
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

/** 업무 로직 자리의 줄 범위 [시작, 끝] (1부터, 표시 줄 포함) */
function holeRanges(file: AppFileContent): { from: number; to: number; empty: boolean; ai: boolean }[] {
  const lines = file.content.split('\n')
  return file.hole_list.map((h) => {
    let to = h.line
    while (to < lines.length && !lines[to - 1].includes('// </hole>')) to++
    return { from: h.line, to, empty: h.empty, ai: h.ai }
  })
}

/**
 * 최종 개발물 1단계 코드 보기 (git·VS Code처럼 왼쪽 파일 구성, 가운데 코드).
 * 업무 로직 자리가 코드가 넣은 기본값 그대로면 '빈 로직'으로 표시한다 (AI로 채우지 않았거나 사람이 아직 안 짠 곳).
 * 보는 브랜치는 오른쪽 '코드 저장소'와 같다. main은 읽기만 하고, 브랜치에서 개발자가 고쳐 저장(작업 폴더)한 뒤
 * '저장하기'로 커밋한다. 커밋하지 않은 파일은 '변경'으로 표시한다. 고친 파일은 다시 개발해도 덮어쓰지 않는다.
 */
export function CodeBrowser({ project, branch, canEdit, refreshKey, openPath }: { project: string; branch: string; canEdit: boolean; refreshKey?: string; openPath?: string }) {
  const [tree, setTree] = useState<AppFileTree | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [file, setFile] = useState<AppFileContent | null>(null)
  const [fileError, setFileError] = useState('')
  const [draft, setDraft] = useState<string | null>(null)   // 고치는 중이면 내용
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [closed, setClosed] = useState<Set<string>>(new Set(['frontend/src/generated']))
  const [committing, setCommitting] = useState(false)
  const repoVersion = useRepoVersion()
  const onMain = branch === 'dev' || branch === 'main' || branch === 'gen'
  const editable = canEdit && !onMain

  const loadTree = () => getAppFiles(project, branch).then((t) => { setTree(t); setError('') }).catch((e) => setError((e as Error).message))
  useEffect(() => {
    getAppFiles(project, branch).then((t) => {
      setTree(t)
      setError('')
      // 처음엔 빈 로직이 있는 첫 파일, 없으면 README
      setSelected((cur) => cur || (t.files.find((f) => f.empty_holes > 0) ?? t.files.find((f) => f.path === 'README.md') ?? t.files[0])?.path || '')
    }).catch((e) => setError((e as Error).message))
  }, [project, branch, refreshKey, repoVersion])
  useEffect(() => {
    if (!selected) return
    setFile(null)
    setFileError('')
    setDraft(null)
    setNote('')
    getAppFile(project, selected, branch).then(setFile).catch((e) => setFileError((e as Error).message))
  }, [project, branch, selected, refreshKey, repoVersion])

  // 오른쪽 '업무 로직 현황'에서 고른 파일을 연다 (이 화면이 막 열렸으면 openPath로)
  useEffect(() => { if (openPath) setSelected(openPath) }, [openPath])
  useEffect(() => {
    const open = (e: Event) => setSelected((e as CustomEvent<string>).detail)
    window.addEventListener(OPEN_CODE_FILE, open)
    return () => window.removeEventListener(OPEN_CODE_FILE, open)
  }, [])
  const root = useMemo(() => tree ? buildTree(onlyEmpty ? tree.files.filter((f) => f.empty_holes > 0) : tree.files) : null, [tree, onlyEmpty])
  const ranges = useMemo(() => file ? holeRanges(file) : [], [file])

  const choose = (path: string) => {
    if (draft !== null && draft !== file?.content && !window.confirm('저장하지 않은 수정이 있습니다. 버리고 다른 파일을 열까요?')) return
    setSelected(path)
  }
  const save = async () => {
    if (!file || draft === null) return
    setSaving(true)
    try {
      const saved = await saveAppFile(project, file.path, draft, branch)
      setFile(saved)
      setDraft(null)
      setNote(`${branch} 작업 폴더에 고쳤습니다. '저장하기'로 커밋해야 기록에 남고 합치기 요청을 할 수 있습니다.`)
      void loadTree()
    } catch (e) {
      setNote(`저장하지 못했습니다: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (error) return <ErrorNote message={error} />
  if (!tree || !root) return <Loading label="파일 구성을 읽는 중" lines={6} />

  const renderNode = (n: Node, depth: number) => {
    if (n.file) {
      const f = n.file
      return (
        <li key={n.path}>
          <button type="button" onClick={() => choose(f.path)} title={f.path}
            className={cx('flex w-full items-center gap-1.5 rounded-sm py-0.5 pr-2 text-left text-small hover:bg-sunken',
              selected === f.path ? 'bg-sunken font-medium text-fg' : 'text-fg-2')}
            style={{ paddingLeft: 8 + depth * 12 }}>
            <File size={13} className="shrink-0 text-fg-3" aria-hidden="true" />
            <span className={cx('min-w-0 flex-1 truncate', f.ai_file && 'text-ai')}>{n.name}</span>
            {f.ai_file && <span className="shrink-0 rounded-sm bg-ai-soft px-1 text-micro text-ai" title="AI가 작성한 파일 (기능 전체 AI)">AI</span>}
            {f.ai_holes > 0 && <span className="shrink-0 rounded-sm bg-ai-soft px-1 text-micro text-ai tabular-nums" title={`AI가 채운 업무 로직 ${f.ai_holes}곳`}>AI {f.ai_holes}</span>}
            {f.empty_holes > 0 && <span className="shrink-0 rounded-sm bg-warn-soft px-1 text-micro text-warn tabular-nums" title={`빈 업무 로직 ${f.empty_holes}곳`}>빈 {f.empty_holes}</span>}
            {f.changed && <span className="shrink-0 rounded-sm bg-info-soft px-1 text-micro text-info" title="이 브랜치에서 커밋하지 않은 변경 ('저장하기'로 커밋)">{CHANGE[f.changed]}</span>}
            {f.edited && !f.changed && <span className="shrink-0 text-micro text-info" title="사람이 고친 파일 (다시 개발해도 그대로)">M</span>}
          </button>
        </li>
      )
    }
    const open = !closed.has(n.path)
    return (
      <li key={n.path}>
        <button type="button" onClick={() => setClosed((s) => { const x = new Set(s); if (open) x.add(n.path); else x.delete(n.path); return x })}
          className="flex w-full items-center gap-1 rounded-sm py-0.5 pr-2 text-left text-small text-fg-2 hover:bg-sunken" style={{ paddingLeft: 4 + depth * 12 }}>
          {open ? <CaretDown size={11} aria-hidden="true" /> : <CaretRight size={11} aria-hidden="true" />}
          <Folder size={13} className="shrink-0 text-fg-3" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{n.name}</span>
          {n.ai > 0 && <span className="shrink-0 text-micro text-ai tabular-nums" title="AI가 쓴 파일·자리">{n.ai}</span>}
          {n.empty > 0 && <span className="shrink-0 text-micro text-warn tabular-nums">{n.empty}</span>}
        </button>
        {open && <ul>{n.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  const lines = file ? file.content.split('\n') : []
  const inHole = (line: number) => ranges.find((r) => line >= r.from && line <= r.to)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-2">
        <span>파일 {tree.files.length}개</span>
        <span>업무 로직 자리 {tree.holes}곳 중 <strong className={tree.empty_holes ? 'text-warn' : 'text-ok'}>빈 로직 {tree.empty_holes}곳</strong></span>
        {tree.ai_files > 0 && <span className="text-ai">AI가 쓴 파일 {tree.ai_files}개</span>}
        {tree.ai_holes > 0 && <span className="text-ai">AI가 채운 업무 로직 {tree.ai_holes}곳</span>}
        {tree.edited > 0 && <span className="text-info">사람이 고친 파일 {tree.edited}개</span>}
        <span className="flex items-center gap-2 text-micro text-fg-3" aria-label="색 설명">
          <span className="rounded-sm bg-warn-soft px-1 text-warn">빈 로직</span>
          <span className="rounded-sm bg-ai-soft px-1 text-ai">AI가 씀</span>
          <span className="rounded-sm bg-ok-soft px-1 text-ok">사람이 채움</span>
        </span>
        <span className="ml-auto flex flex-col items-end gap-1">
          {!onMain && (
            <Button size="sm" variant={tree.changes ? 'primary' : 'secondary'} icon={<GitCommit />} disabled={!canEdit || !tree.changes || draft !== null}
              title={!canEdit ? NEEDS.repo_write : draft !== null ? '고치는 중인 파일을 먼저 저장하거나 취소하세요' : tree.changes ? `${branch}에 커밋합니다` : '커밋할 변경이 없습니다'}
              onClick={() => setCommitting(true)}>저장하기 (변경 {tree.changes}개)</Button>
          )}
          <Checkbox checked={onlyEmpty} onChange={setOnlyEmpty} label="빈 로직 있는 파일만" />
        </span>
      </div>
      {onMain && <p className="rounded-md bg-sunken px-3 py-1.5 text-small text-fg-3">{MAIN_READONLY}. dev는 최종 개발하기·합치기·화면 구성 저장으로, main은 릴리스로만 바뀝니다.</p>}
      <div className="grid min-h-[480px] overflow-hidden rounded-md border border-line lg:grid-cols-[280px_1fr]">
        <nav aria-label="파일 구성" className="max-h-[70vh] overflow-auto border-b border-line bg-card/60 py-2 lg:border-b-0 lg:border-r">
          <ul>{root.children.map((c) => renderNode(c, 0))}</ul>
        </nav>
        <section aria-label="코드" className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-small">{selected || '파일을 고르세요'}</code>
            {file?.ai_file && <span className="rounded-sm bg-ai-soft px-1.5 py-0.5 text-micro font-medium text-ai">AI가 작성한 파일</span>}
            {file && file.ai_holes > 0 && <span className="rounded-sm bg-ai-soft px-1.5 py-0.5 text-micro font-medium text-ai">AI가 채운 업무 로직 {file.ai_holes}곳</span>}
            {file && file.empty_holes > 0 && <Badge tone="warn">빈 업무 로직 {file.empty_holes}곳</Badge>}
            {file?.edited && <Badge tone="info">사람이 고침</Badge>}
            {file?.changed && <Badge tone="info">커밋 안 함</Badge>}
            {file && draft === null && (
              <Button size="sm" variant="secondary" icon={<PencilSimple />} disabled={!editable} title={onMain ? MAIN_READONLY : canEdit ? undefined : NEEDS.repo_write}
                onClick={() => { setDraft(file.content); setNote('') }}>수정</Button>
            )}
            {draft !== null && <>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>취소</Button>
              <Button size="sm" variant="primary" icon={<FloppyDisk />} disabled={saving || draft === file?.content} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</Button>
            </>}
          </div>
          {note && <p role="status" className="border-b border-line bg-sunken px-3 py-1.5 text-small text-fg-2">{note}</p>}
          {file && file.generated && !file.edited && draft !== null && (
            <p className="border-b border-line bg-info-soft px-3 py-1.5 text-small text-info">고치면 '사람이 고침'이 되고, dev에 합친 뒤에는 다시 개발해도 이 파일은 바뀌지 않습니다 (스펙이 바뀌어도).</p>
          )}
          <div className="min-h-0 flex-1 overflow-auto bg-card">
            {fileError ? <div className="p-3"><ErrorNote message={fileError} /></div>
              : !file ? <div className="p-3"><Loading label="코드를 여는 중" lines={8} /></div>
              : draft !== null ? (
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label={`${file.path} 고치기`}
                  className="block h-[64vh] w-full resize-none bg-card p-3 font-mono text-[12.5px] leading-5 text-fg outline-none" />
              ) : (
                <pre className="min-w-max py-2 font-mono text-[12.5px] leading-5">
                  {lines.map((text, i) => {
                    const h = inHole(i + 1)
                    const start = ranges.find((r) => r.from === i + 1)
                    return (
                      <div key={i} className={cx('flex', h ? (h.empty ? 'bg-warn-soft' : h.ai ? 'bg-ai-soft' : 'bg-ok-soft') : file.ai_file && 'bg-ai-soft/40')}>
                        <span className="w-12 shrink-0 select-none pr-3 text-right text-fg-3 tabular-nums">{i + 1}</span>
                        <span className="pr-4 whitespace-pre">{text || ' '}</span>
                        {start && <span className={cx('select-none pr-3 text-micro', start.empty ? 'text-warn' : start.ai ? 'text-ai' : 'text-ok')}>
                          {start.empty ? '← 빈 업무 로직 (기본 동작만)' : start.ai ? '← AI가 채운 업무 로직' : '← 채운 업무 로직 (사람)'}</span>}
                      </div>
                    )
                  })}
                </pre>
              )}
          </div>
        </section>
      </div>
      {committing && <CommitDialog project={project} branch={branch} tree={tree} onClose={() => setCommitting(false)}
        onDone={(msg) => { setNote(msg); repoChanged(); void loadTree() }} />}
    </div>
  )
}

/** 저장하기: 이 브랜치에서 커밋하지 않은 파일과 메시지 → 커밋 (작성자 = 로그인한 회원) */
function CommitDialog({ project, branch, tree, onClose, onDone }: { project: string; branch: string; tree: AppFileTree; onClose: () => void; onDone: (msg: string) => void }) {
  const files = [...tree.files.filter((f) => f.changed).map((f) => ({ path: f.path, changed: f.changed! })), ...tree.deleted.map((path) => ({ path, changed: 'D' as const }))]
  const names = files.map((f) => f.path.split('/').pop())
  const [message, setMessage] = useState(`고침: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` 외 ${names.length - 3}개` : ''}`)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const done = await commitBranch(project, branch, message)
      onDone(`${branch}에 저장했습니다 (${done.commit.slice(0, 8)} · 파일 ${done.files.length}개).`)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <Modal title={`저장하기 · ${branch}`} onClose={onClose}>
      <ul className="max-h-48 space-y-0.5 overflow-auto rounded-md bg-sunken p-2 text-small">
        {files.map((f) => <li key={f.path} className="flex gap-2"><span className="w-12 shrink-0 text-micro text-info">{CHANGE[f.changed]}</span><code className="min-w-0 truncate">{f.path}</code></li>)}
      </ul>
      <TextArea dense rows={3} aria-label="저장 메시지" placeholder="무엇을 고쳤는지" value={message} onChange={(e) => setMessage(e.target.value)} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button variant="primary" icon={<GitCommit />} disabled={busy || !message.trim()} onClick={() => void save()}>{busy ? '저장 중…' : '저장하기'}</Button>
      </div>
    </Modal>
  )
}
