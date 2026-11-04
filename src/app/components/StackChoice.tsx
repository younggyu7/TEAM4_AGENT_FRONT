import { SealCheck, Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getStackCatalog, getStackStatus, type StackCatalog, type StackLayer, type StackStatus } from '../../api'
import { cx } from './ui'

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

/**
 * 기능 명세의 기술 스택 질문(TQ-001) 답: 화면·서버·DB를 하나씩 고른다. 세 칸을 다 고르면 답(스택 문장)이 된다.
 * 개발 틀이 없는 값도 고를 수 있다 (고객 요구를 도구가 바꾸지 않는다). 대신 최종 개발 때 AI가 뼈대부터 만들어 비용이 더 든다고 알린다.
 */
export function StackAnswer({ value, onChange }: { value: string; onChange: (stack: string) => void }) {
  const [catalog, setCatalog] = useState<StackCatalog | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<StackLayer, string>>({ frontend: '', backend: '', database: '' })
  useEffect(() => { loadCatalog().then(setCatalog).catch((e) => setError((e as Error).message)) }, [])
  useEffect(() => { if (catalog) setPicked(partsOf(catalog, value)) }, [catalog, value])
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
  return (
    <fieldset className="mt-3 space-y-2">
      <legend className="sr-only">기술 스택 고르기</legend>
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
      <p className="text-micro text-fg-3">세 칸을 모두 골라야 해결됩니다. 기능 명세를 확정(내보내기)하면 스택도 확정되고, 최종 산출물에서는 보기만 합니다.</p>
    </fieldset>
  )
}

/** 이 버전의 기술 스택 상태 (원문·확정·미정)와 개발 틀이 없는 층 경고. 기능 명세 위·최종 산출물 개발 스펙에 보인다 */
export function StackNote({ project, version, hideWhenPending, className }: { project: string; version: string; hideWhenPending?: boolean; className?: string }) {
  const [status, setStatus] = useState<StackStatus | null>(null)
  useEffect(() => { getStackStatus(project, version).then(setStatus).catch(() => setStatus(null)) }, [project, version])
  if (!status || status.basis === '없음' || (hideWhenPending && status.basis === '미정')) return null
  if (status.basis === '미정') {
    return <p className={cx('rounded-md bg-sunken px-3 py-2 text-small text-fg-2', className)}>기술 스택: 아직 정하지 않음 (기능 명세의 확인 질문 TQ-001에서 화면·서버·DB를 고릅니다)</p>
  }
  const warn = Boolean(status.warning)
  return (
    <div className={cx('flex items-start gap-2 rounded-md px-3 py-2 text-small', warn ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-fg-2', className)}>
      {warn ? <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <SealCheck size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />}
      <span className="min-w-0">
        기술 스택: <strong>{status.stack || LAYERS.map((l) => status.parts[l.id]).filter(Boolean).join(' · ')}</strong>{' '}
        ({status.basis === '원문' ? '원문에 정해짐 — 그대로 따름' : '확정 — 기능 명세에서 고름'})
        {warn && <span className="mt-0.5 block">{status.warning}</span>}
      </span>
    </div>
  )
}
