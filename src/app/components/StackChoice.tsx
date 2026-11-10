import { PencilSimple, SealCheck, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getStackCatalog, getStackStatus, setTechStackParts, type StackCatalog, type StackLayer, type StackStatus } from '../../api'
import { Button, cx } from './ui'

const LAYERS: { id: StackLayer; label: string }[] = [
  { id: 'frontend', label: '화면(프론트)' }, { id: 'backend', label: '서버(백엔드)' }, { id: 'database', label: 'DB' },
]

// 선택지는 한 번만 읽는다 (모든 질문 카드가 같은 목록)
let catalogPromise: Promise<StackCatalog> | null = null
const loadCatalog = () => (catalogPromise ??= getStackCatalog().catch((e) => { catalogPromise = null; throw e }))

/** 고른 세 값 → 기술 스택 문장 (백엔드 tools/stacks.py compose와 같은 순서: 서버 · DB · 화면) */
export function composeStack(catalog: StackCatalog, parts: Record<StackLayer, string>): string {
  const label = (layer: StackLayer) => catalog[layer].find((o) => o.id === parts[layer])?.label
  const [b, d, f] = [label('backend'), label('database'), label('frontend')]
  return b && d && f ? `${b} · ${d} · ${f}` : ''
}

/** 스택 문장에서 세 값을 되찾는다 (같은 카탈로그의 이름으로 맞춘다) */
function partsOf(catalog: StackCatalog, stack: string): Record<StackLayer, string> {
  const pick = (layer: StackLayer) => catalog[layer].find((o) => stack.includes(o.label))?.id ?? ''
  return { frontend: pick('frontend'), backend: pick('backend'), database: pick('database') }
}

/** 업로드 문서 근거 한 줄: 'SFR-02-06 전자정부프레임워크 기반 개발' (앞의 몇 곳만, 나머지는 툴팁) */
function Evidence({ source, className }: { source: NonNullable<StackStatus['source']>; className?: string }) {
  if (!source.evidence.length) return null
  const shown = source.evidence.slice(0, 2)
  return (
    <span className={cx('mt-0.5 block text-micro text-fg-3', className)} title={source.evidence.map((e) => `${e.id} ${e.title}: ${e.text}`).join('\n')}>
      업로드 문서: {shown.map((e) => `${e.id} '${e.title}'`).join(', ')}{source.evidence.length > shown.length ? ` 외 ${source.evidence.length - shown.length}곳` : ''}
    </span>
  )
}

/**
 * 기능 명세의 기술 스택 질문(TQ-001) 답: 화면·서버·DB를 하나씩 고른다. 세 칸을 다 고르면 답(스택 문장)이 된다.
 * 개발 틀이 없는 값도 고를 수 있다 (고객 요구를 도구가 바꾸지 않는다). 대신 최종 개발 때 AI가 뼈대부터 만들어 비용이 더 든다고 알린다.
 * 업로드 문서에 적힌 층(화면·DB 등)은 답이 없을 때 그 값으로 미리 채우고, 다르게 고르면 문서에 어떻게 적혀 있는지 경고한다.
 * mode='change'는 개발 범위 확정의 '바꾸기' (답하기 버튼·기능 명세 안내 없이 칸과 경고만).
 */
export function StackAnswer({ project, version, value, onChange, mode = 'answer' }: {
  project?: string; version?: string; value: string; onChange: (stack: string) => void; mode?: 'answer' | 'change'
}) {
  const [catalog, setCatalog] = useState<StackCatalog | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<StackLayer, string>>({ frontend: '', backend: '', database: '' })
  const [source, setSource] = useState<StackStatus['source']>(null)
  useEffect(() => { loadCatalog().then(setCatalog).catch((e) => setError((e as Error).message)) }, [])
  useEffect(() => {
    if (project && version) getStackStatus(project, version).then((s) => setSource(s.source ?? null)).catch(() => setSource(null))
  }, [project, version])
  useEffect(() => {
    if (!catalog) return
    // 답이 없으면 업로드 문서에 적힌 층을 미리 채운다 (세 칸이 다 차야 답이 된다)
    setPicked(value ? partsOf(catalog, value) : { frontend: '', backend: '', database: '', ...source?.parts })
  }, [catalog, value, source])
  if (error) return <p className="mt-3 text-small text-danger">선택지를 읽지 못했습니다: {error}</p>
  if (!catalog) return <p className="mt-3 text-small text-fg-3">선택지를 불러오는 중…</p>
  const choose = (layer: StackLayer, id: string) => {
    const next = { ...picked, [layer]: id }
    setPicked(next)
    onChange(composeStack(catalog, next))   // 세 칸을 다 골라야 답이 생긴다 (아니면 빈 답 = 미해결)
  }
  const option = (l: StackLayer) => catalog[l].find((o) => o.id === picked[l])
  const blocked = LAYERS.filter((l) => picked[l.id] && option(l.id)?.develop === false)
  const missing = LAYERS.filter((l) => picked[l.id] && !option(l.id)?.supported && option(l.id)?.develop !== false)
  const written = source?.parts ?? {}
  const differs = LAYERS.filter((l) => written[l.id] && picked[l.id] && picked[l.id] !== written[l.id])
  const docLabel = (l: StackLayer) => catalog[l].find((o) => o.id === written[l])?.label ?? written[l]
  return (
    <fieldset className="mt-3 space-y-2">
      <legend className="sr-only">기술 스택 고르기</legend>
      {source && (
        <p className={cx('flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-small', differs.length ? 'bg-warn-soft text-warn' : 'bg-sunken text-fg-2')}>
          <Warning size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {differs.length
              ? `업로드 문서에는 ${differs.map((l) => `${l.label} ${docLabel(l.id)}`).join(', ')}(으)로 명시되어 있습니다. 지금 고른 값과 다릅니다.`
              : mode === 'change' ? `업로드 문서에는 ${source.stack}(으)로 적혀 있습니다.`
              : `업로드 문서에 ${source.stack}(으)로 적혀 있어 그 값으로 채웠습니다.${LAYERS.some((l) => !written[l.id]) ? ' 문서에 없는 칸만 고르면 됩니다.' : ''}`}
            <Evidence source={source} />
          </span>
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        {LAYERS.map((l) => (
          <label key={l.id} className="block">
            <span className="mb-1 block text-micro font-medium text-fg-2">{l.label}</span>
            <select className="min-h-9 w-full rounded-md border border-control bg-card px-2 text-label text-fg" value={picked[l.id]}
              onChange={(e) => choose(l.id, e.target.value)}>
              <option value="">선택</option>
              {catalog[l.id].map((o) => <option key={o.id} value={o.id}>{o.label}{o.develop === false ? ' (최종 개발 지원 안 함)' : o.supported ? '' : ' (개발 틀 없음)'}</option>)}
            </select>
          </label>
        ))}
      </div>
      {blocked.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-small text-warn">
          <Warning size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {blocked.map((l) => `${l.label} ${option(l.id)?.label}`).join(', ')}: 최종 개발하기는 지원하지 않습니다 (설계 산출물까지만).
        </p>
      )}
      {missing.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-small text-warn">
          <Warning size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {missing.map((l) => l.label).join(', ')}은(는) 개발 틀이 없습니다. 설계 산출물은 그대로 만들어지지만, 최종 개발하기 때 AI가 뼈대부터 만들어 토큰·비용이 더 들고 결과가 실행마다 다를 수 있습니다.
        </p>
      )}
      {mode === 'answer' && !value && composeStack(catalog, picked) && (
        <button type="button" className="min-h-8 rounded-md border border-control bg-card px-3 text-small font-medium text-fg hover:bg-sunken"
          onClick={() => onChange(composeStack(catalog, picked))}>이 값으로 답하기</button>
      )}
      {mode === 'answer' && <p className="text-micro text-fg-3">세 칸을 모두 골라야 해결됩니다. 기능 명세를 확정(내보내기)하면 스택도 확정되고, 개발 범위 확정에서 최종 승인 전까지 바꿀 수 있습니다.</p>}
    </fieldset>
  )
}

/**
 * 이 버전의 기술 스택 상태 (원문·확정·미정)와 개발 틀이 없는 층·업로드 문서와 다른 값 경고. 기능 명세 위·최종 산출물 개발 스펙에 보인다.
 * canChange: 개발 범위 확정(최종 승인 전, PM·개발자)에서 '바꾸기' → 세 칸을 골라 확정하면 개발 스펙 10개를 다시 쓴다(LLM 없음).
 * 원문이 정한 스택도 바꿀 수 있고, 개발 스펙(AI 개발 입력)에는 업로드 문서 내용이 근거·경고로 함께 들어간다.
 */
export function StackNote({ project, version, hideWhenPending, canChange, className }: {
  project: string; version: string; hideWhenPending?: boolean; canChange?: boolean; className?: string
}) {
  const [status, setStatus] = useState<StackStatus | null>(null)
  const [catalog, setCatalog] = useState<StackCatalog | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = () => getStackStatus(project, version).then(setStatus).catch(() => setStatus(null))
  useEffect(() => { void load() }, [project, version])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadCatalog().then(setCatalog).catch(() => setCatalog(null)) }, [])
  if (!status || status.basis === '없음' || (hideWhenPending && status.basis === '미정')) return null
  const label = (l: StackLayer, id?: string) => (id && catalog?.[l].find((o) => o.id === id)?.label) || id || ''
  const current = catalog ? composeStack(catalog, { frontend: '', backend: '', database: '', ...status.parts } as Record<StackLayer, string>) : ''
  const open = () => { setDraft(status.basis === '미정' ? '' : current); setError(''); setEditing(true) }
  const save = async () => {
    if (!catalog) return
    setBusy(true)
    setError('')
    try {
      await setTechStackParts(project, version, partsOf(catalog, draft))
      setEditing(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const change = canChange && !editing && (
    <Button size="sm" variant="secondary" icon={<PencilSimple />} className="ml-auto shrink-0" onClick={open}>바꾸기</Button>
  )
  const editor = editing && (
    <div className="mt-2 rounded-md border border-line bg-card px-3 pb-3 text-fg">
      <StackAnswer project={project} version={version} value={draft} onChange={setDraft} mode="change" />
      <p className="mt-2 text-micro text-fg-3">확정하면 개발 스펙 10개(AGENTS·ARCHITECTURE 등)를 다시 씁니다(LLM 없음). 업로드 문서와 다르면 문서 내용도 근거로 함께 적혀 AI 개발에 넘어갑니다.</p>
      {error && <p role="alert" className="mt-1 text-small text-danger">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>취소</Button>
        <Button size="sm" variant="primary" disabled={busy || !draft} onClick={() => void save()}>{busy ? '다시 쓰는 중…' : '이 스택으로 확정'}</Button>
      </div>
    </div>
  )
  if (status.basis === '미정') {
    return (
      <div className={cx('rounded-md px-3 py-2 text-small', status.source ? 'bg-warn-soft text-warn' : 'bg-sunken text-fg-2', className)}>
        <div className="flex items-start gap-2">
          <span className="min-w-0">
            기술 스택: 아직 정하지 않음 (기능 명세의 확인 질문 TQ-001에서 화면·서버·DB를 고릅니다)
            {status.source && <span className="mt-0.5 block">업로드 문서에는 {status.source.stack}(으)로 적혀 있습니다.</span>}
            {status.source && <Evidence source={status.source} />}
          </span>
          {change}
        </div>
        {editor}
      </div>
    )
  }
  const warn = Boolean(status.warning || status.conflict)
  const written = status.source?.parts ?? {}
  // 원문 스택 문장이 없으면(최종 확정 전) 층마다 이름으로, 문서에 없는 층은 기본값이라고 나눠 보인다
  const shown = status.stack || LAYERS.filter((l) => status.parts[l.id])
    .map((l) => `${l.label} ${label(l.id, status.parts[l.id])}${status.basis === '원문' && !written[l.id] ? ' (문서에 없어 기본값)' : ''}`).join(' · ')
  return (
    <div className={cx('rounded-md px-3 py-2 text-small', warn ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-fg-2', className)}>
      <div className="flex items-start gap-2">
        {warn ? <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <SealCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />}
        <span className="min-w-0">
          기술 스택: <strong>{shown}</strong>{' '}
          ({status.basis === '원문' ? '원문에 정해짐 — 그대로 따름' : status.changed ? '확정 — 개발 범위 확정에서 바꿈' : '확정 — 기능 명세에서 고름'})
          {status.conflict && <span className="mt-0.5 block">{status.conflict}</span>}
          {status.warning && <span className="mt-0.5 block">{status.warning}</span>}
          {status.source && <Evidence source={status.source} />}
        </span>
        {change}
      </div>
      {editor}
    </div>
  )
}
