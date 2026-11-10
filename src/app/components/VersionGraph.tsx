import { Check, PencilSimple, X } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { setVersionTitle } from '../../api'
import { formatDate } from '../../labels'
import type { Project, VersionRecord } from '../../types'
import type { Route, StagePage } from '../lib/route'
import { compare, specOf, stageOf } from '../lib/versions'
import { Badge, cx, IconButton, TextInput } from './ui'

/*
 * 설계 버전 트리 (왼쪽 사이드바, Git 그래프처럼).
 * 줄은 버전 번호 내림차순: v4.1.1 → v4.1 → v4 → v3 → v2 → v1.1.1 → v1.1 → v1처럼 한 계보(기능 명세 → ERD → 최종본)가
 * 붙어서 보인다 (자식 번호는 부모 번호를 이어 쓰므로 부모는 늘 자식 아래). 단계는 점 색으로 구분한다:
 * 최종 산출물 초록 · ERD 주황 · 기능 명세 파랑.
 * 버전은 모두 부모 점에서 갈라져 나온다: ERD(v1.1·v1.2·v1.3)는 기능 명세 v1에서, 최종본(v1.1.1)은 ERD v1.1에서,
 * 다시 만든 기능 명세(stage function_designer, v2)는 v1에서. 선 색은 위쪽(자식) 버전의 단계 색이다.
 * 새로 올린 문서(전체 실행)는 부모 없이 새로 시작한다. 줄을 누르면 그 버전의 단계 화면이 열린다.
 */

const STAGE_COLOR: Record<StagePage, string> = { spec: 'text-info', erd: 'text-warn', final: 'text-ok' }
const ROW = 44        // 버전 줄 높이
const SPEC_STAGE = 'function_designer'

type Row = { v: VersionRecord; stage: StagePage; lane: number }
/** 부모 점(아래 줄)에서 자식 점(위 줄)으로 가는 선 */
type Edge = { from: number; to: number; fromLane: number; lane: number; stage: StagePage }

export function VersionGraph({ project, version, navigate, onReloadProjects }: {
  project: Project
  version: string
  navigate: (r: Route) => void
  onReloadProjects: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const all = project.versions

  const { rows, lanes, edges } = useMemo(() => {
    const stage = (v: string) => stageOf(all, v)
    const known = new Set(all.map((v) => v.design_version))
    // 부모: ERD → 그 기능 명세, 최종본 → 그 ERD(기준 버전), 다시 만든 기능 명세 → 기준 기능 명세, 새 문서는 없음
    const parentOf = (v: VersionRecord): string | undefined => {
      const s = stage(v.design_version)
      if (s === 'spec') {
        const p = v.stage === SPEC_STAGE ? (v.base ?? v.parent) : undefined
        return p && known.has(p) ? specOf(all, p) : undefined
      }
      if (s === 'erd') return specOf(all, v.design_version)
      const p = v.base ?? v.parent
      return p && known.has(p) && stage(p) === 'erd' ? p : undefined
    }

    // 선(lane) 번호: 기능 명세 → 그 ERD들 → 각 ERD의 최종본 순서로 왼쪽부터. 첫 최종본은 ERD 선을 이어 쓴다
    const lane = new Map<string, number>()
    let next = 0
    const byVersion = (a: VersionRecord, b: VersionRecord) => compare(a.design_version, b.design_version)
    const childrenOf = (p: string) => all.filter((v) => parentOf(v) === p).sort(byVersion)
    const place = (v: VersionRecord, inherit?: number) => {
      lane.set(v.design_version, inherit ?? next++)
      const kids = childrenOf(v.design_version)
      kids.forEach((k, i) => {
        // 최종본 하나는 ERD 선을 그대로 잇는다 (ERD → 최종이 한 줄로 보이게). 나머지는 모두 새 가지
        const keep = stage(v.design_version) === 'erd' && stage(k.design_version) === 'final' && i === 0
        place(k, keep ? lane.get(v.design_version) : undefined)
      })
    }
    all.filter((v) => !parentOf(v)).sort(byVersion).forEach((root) => place(root))

    // 번호 내림차순 (위가 최신 계보): 단계별로 모으면 다른 계보의 ERD·최종본이 사이에 끼어 보인다
    const rows: Row[] = [...all].sort((a, b) => compare(b.design_version, a.design_version))
      .map((v) => ({ v, stage: stage(v.design_version), lane: lane.get(v.design_version) ?? 0 }))
    const rowOf = new Map(rows.map((r, i) => [r.v.design_version, i] as const))
    const edges: Edge[] = all.flatMap((v) => {
      const p = parentOf(v)
      const from = p !== undefined ? rowOf.get(p) : undefined
      const to = rowOf.get(v.design_version)
      if (from === undefined || to === undefined || from <= to) return []
      return [{ from, to, fromLane: lane.get(p!)!, lane: lane.get(v.design_version)!, stage: stage(v.design_version) }]
    })
    return { rows, lanes: next, edges }
  }, [all])

  // 계보 선이 많으면 간격을 줄여 글자 칸을 남긴다 (화면이 작거나 사이드바에 스크롤바가 생기면 번호가 두 줄로 꺾이지 않게)
  const gap = lanes > 8 ? 8 : lanes > 4 ? 10 : 13
  const width = Math.max(1, lanes) * gap + 6
  const x = (l: number) => 7 + l * gap

  const save = async (v: string) => {
    setSaving(true)
    setError('')
    try {
      await setVersionTitle(project.id, v, draftTitle)
      setEditing(null)
      onReloadProjects()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** 한 줄의 왼쪽 그림: 이 줄에서 갈라져 나가는 곡선, 지나가는 선, 들어오는 선, 이 줄의 점 */
  const gutter = (i: number, h: number, node: { lane: number; stage: StagePage; current: boolean }) => {
    const mid = h / 2
    return (
      <svg width={width} height={h} aria-hidden="true" className="shrink-0 overflow-visible">
        {edges.map((e, k) => {
          const color = STAGE_COLOR[e.stage]
          if (i === e.from) {   // 부모 점에서 위로 (다른 선이면 곡선으로 갈라진다)
            const d = e.fromLane === e.lane
              ? `M ${x(e.lane)} ${mid} L ${x(e.lane)} 0`
              : `M ${x(e.fromLane)} ${mid} C ${x(e.fromLane)} ${mid * 0.35}, ${x(e.lane)} ${mid * 0.6}, ${x(e.lane)} 0`
            return <path key={k} className={color} stroke="currentColor" strokeWidth={2} fill="none" d={d} />
          }
          if (i === e.to) return <line key={k} className={color} stroke="currentColor" strokeWidth={2} x1={x(e.lane)} x2={x(e.lane)} y1={mid} y2={h} />
          if (i > e.to && i < e.from) return <line key={k} className={color} stroke="currentColor" strokeWidth={2} x1={x(e.lane)} x2={x(e.lane)} y1={0} y2={h} />
          return null
        })}
        <circle cx={x(node.lane)} cy={mid} r={4.5} className={STAGE_COLOR[node.stage]} fill="currentColor" />
        {node.current && <circle cx={x(node.lane)} cy={mid} r={7.5} className="text-fg" fill="none" stroke="currentColor" strokeWidth={1.5} />}
      </svg>
    )
  }

  return (
    <section aria-labelledby="version-graph" className="rounded-lg border border-line bg-card py-2">
      <h2 id="version-graph" className="eyebrow mb-1 px-3">설계 버전</h2>
      <ol className="overflow-x-auto">
        {rows.map((r, i) => {
          const v = r.v
          const current = v.design_version === version
          return (
            <li key={v.design_version} className="flex items-stretch pr-1" style={{ height: ROW }}>
              {gutter(i, ROW, { lane: r.lane, stage: r.stage, current })}
              {editing === v.design_version ? (
                <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); void save(v.design_version) }}>
                  <TextInput dense autoFocus aria-label={`v${v.design_version} 제목`} value={draftTitle} maxLength={80}
                    onChange={(e) => setDraftTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }} />
                  <IconButton type="submit" label="제목 저장" icon={<Check />} disabled={saving} className="size-7" />
                  <IconButton label="취소" icon={<X />} onClick={() => setEditing(null)} className="size-7" />
                </form>
              ) : (
                <div className={cx('group flex min-w-0 flex-1 items-center rounded-md transition-colors duration-150', current ? 'bg-sunken' : 'hover:bg-sunken')}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => navigate({ name: 'workspace', project: project.id, version: v.design_version, page: r.stage })}
                    className="min-w-0 flex-1 px-1.5 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {/* 번호는 꺾지 않는다. 자리가 모자라면 배지가 먼저 잘린다 */}
                      <span className={cx('shrink-0 whitespace-nowrap text-label tabular-nums', current ? 'font-semibold' : 'text-fg-2')}>v{v.design_version}</span>
                      <span className="flex min-w-0 overflow-hidden">
                        {v.approval?.decision === 'approve' ? <Badge tone="ok">승인</Badge>
                          : v.approval?.decision === 'changes' ? <Badge tone="warn">수정 지시</Badge>
                          : v.db_validation === 'PASSED' ? <Badge tone="ok">DB 통과</Badge>
                          // DDL 검증 실패는 버전(ERD)은 만들어진 것이라 확인할 것으로 보인다 (최종 확정 전에 ERD를 고치거나 다시 확정)
                          : v.db_validation && <span title={`DDL 검증을 통과하지 못했습니다. 최종 확정 전에 확인하세요.${v.db_errors?.length ? `\n${v.db_errors.slice(0, 3).join('\n')}` : ''}`}><Badge tone="info">DB 확인 필요</Badge></span>}
                      </span>
                    </span>
                    <span className="block truncate text-micro text-fg-3">
                      {[v.title, formatDate(v.created_at)].filter(Boolean).join(' · ') || '날짜 없음'}
                    </span>
                  </button>
                  <IconButton
                    label={`v${v.design_version} 제목 ${v.title ? '고치기' : '붙이기'}`}
                    icon={<PencilSimple />}
                    className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => { setEditing(v.design_version); setDraftTitle(v.title ?? ''); setError('') }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {error && <p role="alert" className="px-3 pt-1 text-small text-danger">제목을 저장하지 못했습니다: {error}</p>}
    </section>
  )
}
