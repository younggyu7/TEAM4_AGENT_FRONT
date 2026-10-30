import { Check, CheckCircle, Info, PencilSimple, Warning, WarningOctagon, X, XCircle } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { setVersionTitle } from '../../api'
import { formatDate } from '../../labels'
import type { Design, Project } from '../../types'
import { useUsages, type Load, type VersionUsage } from '../lib/data'
import { remarkKey, useSemanticChecks, useSemanticReview } from '../lib/semantic'
import { isDocPage, type EditPage, type Page, type Route, type StagePage } from '../lib/route'
import { depth, erdsOf, levelOf, specOf, stageVersions, truncate } from '../lib/versions'
import { BarList, TickMeter, TokenBars, TokenRows } from './charts'
import { Badge, Card, CardHeader, compact, cx, fmt, IconButton, Loading, TextInput } from './ui'

/* ============================================================ 작업 화면 오른쪽 */
type Summary = { total: number; done: number; requiredLeft: number }

export function WorkspaceInsights({ design, project, version, reviews, finalized, navigate, onReloadProjects, page }: {
  design: Design
  project?: Project
  version: string
  /** 단계마다 그 단계 버전(기능 명세 v1, ERD v1.2)의 확인 항목 요약. null이면 읽는 중 */
  reviews: Record<EditPage, Summary | null>
  finalized: Partial<Record<EditPage | 'final', string>>
  navigate: (r: Route) => void
  onReloadProjects: () => void
  page: Page
}) {
  const versions = project?.versions ?? [{ design_version: version }]
  const targets = useMemo(() => versions.map((v) => ({ project: project?.id ?? '', version: v.design_version })), [versions, project?.id])
  const usages = useUsages(project ? targets : [])

  return (
    <>
      <ProgressCard design={design} reviews={reviews} finalized={finalized} page={page} project={project?.id ?? ''} version={version} />
      <TokenCard usages={usages} version={version} />
      <VersionsCard project={project} version={version} page={page} navigate={navigate} onReloadProjects={onReloadProjects} />
      <IssuesCard design={design} />
    </>
  )
}

/** 목록 순서: 최상위 버전은 최신이 위, 그 아래 번호(v4.1 …)는 기준 버전 바로 밑에 최신이 위 */
function treeOrder(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1   // a가 b의 기준 버전 → 먼저
    if (y[i] === undefined) return 1
    if (x[i] !== y[i]) return y[i] - x[i]
  }
  return 0
}

/** 설계 버전 목록: 단계만 다시 만든 버전(v4.1)은 기준 버전 아래에 들여 쓰고, 제목은 그 자리에서 고친다 */
function VersionsCard({ project, version, page, navigate, onReloadProjects }: {
  project?: Project
  version: string
  page: Page
  navigate: (r: Route) => void
  onReloadProjects: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const all = project?.versions ?? []
  const stage = isDocPage(page) ? null : (page as StagePage)
  // 단계 화면에서는 그 단계 번호만 (기능 명세 v2 / ERD v2.1… / 최종 v2.1.1…), 산출물 보기에서는 전체를 계보 순서로
  const versions = useMemo(
    () => (stage ? stageVersions(all, stage, version) : [...all].sort((a, b) => treeOrder(a.design_version, b.design_version))),
    [all, stage, version],
  )
  const spec = specOf(all, version)
  const erd = levelOf(all, version) >= 1 ? truncate(version, depth(spec) + 1) : version
  const heading = stage === 'spec' ? '기능 명세 버전' : stage === 'erd' ? `기능 명세 v${spec}로 만든 ERD` : stage === 'final' ? `ERD v${erd}로 만든 최종본` : '설계 버전'
  const empty = stage === 'final'
    ? `아직 최종본 버전이 없습니다. ERD 화면에서 v${erd}를 'ERD 최종 확정'하면 v${erd}.1로 만들어집니다.`
    : stage === 'erd' ? `기능 명세 v${spec}로 만든 ERD가 없습니다. 기능 명세에서 '내보내기 → ERD 만들기'를 하세요.` : '버전 기록이 없습니다.'

  const save = async (v: string) => {
    if (!project) return
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

  return (
    <Card aria-labelledby="versions-title">
      <CardHeader eyebrow="Versions" title={heading} titleId="versions-title" />
      {versions.length === 0 && <p className="px-5 pb-5 text-small text-fg-3">{empty}</p>}
      <ol className="px-3 pb-3">
        {versions.map((v) => {
          const current = v.design_version === version
          // 단계 화면에서는 같은 단계끼리라 들여쓰지 않는다
          const indent = stage ? 0 : depth(v.design_version)
          const kind = stage === 'erd' && levelOf(all, v.design_version) === 0
            ? '기능 명세와 함께 만든 초안'
            : stage === 'spec' ? (() => {
                const n = erdsOf(all, v.design_version).length
                return `${v.stage === 'function_designer' ? '답 반영 · ' : ''}${n ? `ERD ${n}개` : 'ERD 없음'}`
              })()
            : v.stage === 'function_designer' ? '기능 명세 다시'
            : v.stage && v.stage !== 'full' ? '데이터 설계 다시' : depth(v.design_version) === 0 ? '전체 실행' : ''
          return (
            <li key={v.design_version} style={{ paddingLeft: indent * 16 }} className={cx(indent > 0 && 'border-l border-line ml-3')}>
              {editing === v.design_version ? (
                <form
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  onSubmit={(e) => { e.preventDefault(); void save(v.design_version) }}
                >
                  <span className="w-10 shrink-0 text-label font-semibold tabular-nums">v{v.design_version}</span>
                  <TextInput dense autoFocus aria-label={`v${v.design_version} 제목`} value={draftTitle} maxLength={80}
                    onChange={(e) => setDraftTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }} />
                  <IconButton type="submit" label="제목 저장" icon={<Check />} disabled={saving} className="size-8" />
                  <IconButton label="취소" icon={<X />} onClick={() => setEditing(null)} className="size-8" />
                </form>
              ) : (
                <div className={cx('group flex items-center rounded-md transition-colors duration-150', current ? 'bg-sunken' : 'hover:bg-sunken')}>
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    disabled={!project}
                    onClick={() => project && navigate({ name: 'workspace', project: project.id, version: v.design_version, page })}
                    className="grid min-h-11 min-w-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <span className={cx('text-label tabular-nums', current ? 'font-semibold' : 'text-fg-2')}>v{v.design_version}</span>
                    <span className="min-w-0">
                      <span className={cx('block truncate text-small', v.title ? 'font-medium text-fg' : 'text-fg-2')}>{v.title || formatDate(v.created_at) || '날짜 없음'}</span>
                      <span className="block truncate text-micro text-fg-3">
                        {[v.title && formatDate(v.created_at), kind, !stage && v.parent && `v${v.parent}에서`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {v.db_validation && (
                      <Badge tone={v.db_validation === 'PASSED' ? 'ok' : 'danger'}>DB {v.db_validation === 'PASSED' ? '통과' : '실패'}</Badge>
                    )}
                  </button>
                  <IconButton
                    label={`v${v.design_version} 제목 ${v.title ? '고치기' : '붙이기'}`}
                    icon={<PencilSimple />}
                    className="mr-1 size-8 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => { setEditing(v.design_version); setDraftTitle(v.title ?? ''); setError('') }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {error && <p role="alert" className="px-5 pb-4 text-small text-danger">제목을 저장하지 못했습니다: {error}</p>}
    </Card>
  )
}

function ProgressCard({ design, reviews, finalized, page, project, version }: {
  design: Design
  reviews: Record<EditPage, Summary | null>
  finalized: Partial<Record<EditPage | 'final', string>>
  page: Page
  project: string
  version: string
}) {
  const checks = design.completion.checks
  const passed = checks.filter((c) => c.passed).length
  // 기능 명세·ERD 화면은 그 화면의 확인 항목만, 최종 산출물은 의미 검토 → ERD → 기능 명세 (각 단계 버전의 체크로)
  const order: EditPage[] = page === 'spec' ? ['spec'] : page === 'erd' ? ['erd'] : page === 'final' ? ['erd', 'spec'] : ['spec', 'erd']
  return (
    <Card aria-labelledby="progress-title">
      <CardHeader eyebrow="Progress" title="진행 상황" titleId="progress-title" />
      <div className="space-y-5 px-5 pb-5">
        {page === 'final' && <SemanticProgress project={project} version={version} finalizedAt={finalized.final} />}
        {order.map((p) => <ReviewProgress key={p} name={p === 'spec' ? '기능 명세서' : 'ERD'} review={reviews[p]} finalizedAt={finalized[p]} current={p === page} />)}

        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-small text-fg-3">Agent 완료 조건</p>
            <p className="text-small font-medium tabular-nums">{passed}/{checks.length}</p>
          </div>
          <ul className="mt-2 space-y-1">
            {checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2 text-small" title={c.detail}>
                {c.passed
                  ? <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-ok" aria-label="충족" />
                  : <XCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-label="미충족" />}
                <span className={c.passed ? 'text-fg-2' : 'font-medium text-danger'}>{c.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

/** 최종본의 의미 검토 지적: 사람이 '확인함'으로 표시한 수 (최종 산출물 화면의 의미 검토 카드와 같은 표시) */
function SemanticProgress({ project, version, finalizedAt }: { project: string; version: string; finalizedAt?: string }) {
  const result = useSemanticReview(project, version)
  const { checked } = useSemanticChecks(project, version)
  if (result === undefined) return <Loading label="의미 검토 결과를 읽는 중" lines={2} />
  if (result === null) {
    return (
      <div>
        <p className="text-small font-medium">최종 산출물 검토 (의미 검토)</p>
        <p className="mt-1.5 rounded-md bg-sunken px-2.5 py-1.5 text-small text-fg-3">아직 최종본이 없습니다. ERD를 최종 확정하면 의미 검토 결과가 여기에 나옵니다.</p>
      </div>
    )
  }
  const remarks = result.remarks
  const done = remarks.filter((r, i) => checked[remarkKey(r, i)]).length
  return (
    <ReviewProgress name="최종 산출물 검토 (의미 검토)" review={{ total: remarks.length, done, requiredLeft: 0 }} finalizedAt={finalizedAt} current
      note={result.failed.length ? `검토 실패(미검증): ${result.failed.join(', ')}`
        : remarks.length - done ? `확인할 AI 지적 ${remarks.length - done}건 남음 (필수 아님)` : '모든 지적을 확인했습니다'}
      noteTone={result.failed.length ? 'warn' : remarks.length - done ? 'info' : 'ok'} />
  )
}

function ReviewProgress({ name, review, finalizedAt, current, note, noteTone }: {
  name: string
  review: Summary | null
  finalizedAt?: string
  current: boolean
  /** 필수 항목 안내 대신 보일 문장 (의미 검토) */
  note?: string
  noteTone?: 'ok' | 'warn' | 'info'
}) {
  if (!review) return <Loading label={`${name} 확인 항목을 읽는 중`} lines={2} />
  return (
    <div className={cx(!current && 'opacity-80')}>
      <div className="flex items-center justify-between gap-2">
        <p className={cx('text-small', current ? 'font-medium text-fg' : 'text-fg-3')}>{note ? name : `${name} 확인 항목`}</p>
        {finalizedAt
          ? <Badge tone="ok" icon={<CheckCircle weight="fill" />}>확정됨</Badge>
          : <Badge tone="neutral">초안</Badge>}
      </div>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cx('font-medium tabular-nums', current ? 'text-title' : 'text-subtitle')}>{fmt(review.done)}</span>
        <span className="text-label text-fg-3 tabular-nums">/ {fmt(review.total)}</span>
      </p>
      <div className="mt-2">
        <TickMeter value={review.done} total={review.total} label={`${name} 확인한 항목`} ticks={current ? 36 : 28} />
      </div>
      {note ? (
        <p className={cx('mt-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-small',
          noteTone === 'warn' ? 'bg-warn-soft text-warn' : noteTone === 'info' ? 'bg-info-soft text-info' : 'bg-ok-soft text-ok')}>
          {noteTone === 'ok' ? <CheckCircle size={14} weight="bold" aria-hidden="true" /> : <Info size={14} weight="bold" aria-hidden="true" />}{note}
        </p>
      ) : (
        <p className={cx('mt-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-small', review.requiredLeft ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok')}>
          {review.requiredLeft
            ? <><Warning size={14} weight="bold" aria-hidden="true" />확정 전 필수 {review.requiredLeft}개 남음</>
            : <><CheckCircle size={14} weight="bold" aria-hidden="true" />필수 항목을 모두 확인했습니다</>}
        </p>
      )}
      {finalizedAt && <p className="mt-1.5 text-micro text-fg-3">확정: {formatDate(finalizedAt)}</p>}
    </div>
  )
}

function TokenCard({ usages, version }: { usages: Load<VersionUsage[]>; version: string }) {
  return (
    <Card aria-labelledby="tokens-title">
      <CardHeader eyebrow="Tokens" title="토큰 사용량" titleId="tokens-title" />
      <div className="px-5 pb-5">
        {usages.state === 'loading' && <Loading label="토큰 사용량을 읽는 중" lines={4} />}
        {usages.state === 'error' && <p role="alert" className="text-small text-danger">사용량을 읽지 못했습니다: {usages.message}</p>}
        {usages.state === 'ready' && (() => {
          const known = usages.data.filter((u) => u.usage)
          if (known.length === 0) return <p className="text-small text-fg-3">이 프로젝트의 review_report.md에 사용량 기록이 없습니다.</p>
          const cur = usages.data.find((u) => u.version === version)?.usage
          const sum = known.reduce((a, u) => a + u.usage!.input + u.usage!.output, 0)
          return (
            <>
              <dl className="mb-5 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-small text-fg-3">이 버전 (v{version})</dt>
                  <dd className="mt-1 text-title font-medium tabular-nums">{cur ? compact(cur.input + cur.output) : '—'}</dd>
                  <dd className="text-micro text-fg-3 tabular-nums">{cur ? `호출 ${fmt(cur.calls)}회` : '기록 없음'}</dd>
                </div>
                <div>
                  <dt className="text-small text-fg-3">전체 버전 합계</dt>
                  <dd className="mt-1 text-title font-medium tabular-nums">{compact(sum)}</dd>
                  <dd className="text-micro text-fg-3 tabular-nums">버전 {known.length}개</dd>
                </div>
              </dl>
              <TokenBars
                caption="버전별 토큰 사용량"
                bars={[...usages.data].reverse().map((u) => ({
                  key: String(u.version),
                  label: `v${u.version}`,
                  input: u.usage?.input ?? 0,
                  output: u.usage?.output ?? 0,
                  calls: u.usage?.calls ?? 0,
                  current: u.version === version,
                  sub: u.usage?.calls === 0 ? '이어서 실행 (새 호출 없음)' : undefined,
                }))}
              />
            </>
          )
        })()}
      </div>
    </Card>
  )
}

function IssuesCard({ design }: { design: Design }) {
  const open = design.issues.filter((i) => i.status !== 'RESOLVED')
  const count = (s: string) => open.filter((i) => i.severity === s).length
  return (
    <Card aria-labelledby="issues-title">
      <CardHeader eyebrow="Review" title="열린 검토 지적" titleId="issues-title" actions={<span className="text-label font-medium tabular-nums">{open.length}건</span>} />
      <div className="px-5 pb-5">
        {open.length === 0 ? <p className="text-small text-fg-3">열린 지적이 없습니다.</p> : (
          <BarList
            total={open.length}
            rows={[
              { key: 'e', label: '오류', value: count('ERROR'), tone: 'danger', icon: <WarningOctagon weight="bold" aria-hidden="true" /> },
              { key: 'w', label: '경고', value: count('WARNING'), tone: 'warn', icon: <Warning weight="bold" aria-hidden="true" /> },
              { key: 'i', label: '참고', value: count('INFO'), tone: 'info', icon: <Info weight="bold" aria-hidden="true" /> },
            ]}
          />
        )}
      </div>
    </Card>
  )
}

/* ============================================================ 홈 오른쪽 */
export function HomeInsights({ projects }: { projects: Project[] }) {
  const targets = useMemo(
    () => projects.flatMap((p) => p.versions.map((v) => ({ project: p.id, version: v.design_version }))),
    [projects],
  )
  const usages = useUsages(targets)
  const recent = useMemo(
    () => projects
      .flatMap((p) => p.versions.map((v) => ({ p, v })))
      .sort((a, b) => (b.v.created_at ?? '').localeCompare(a.v.created_at ?? ''))
      .slice(0, 5),
    [projects],
  )

  return (
    <>
      <Card aria-labelledby="home-tokens">
        <CardHeader eyebrow="Tokens" title="프로젝트별 토큰" titleId="home-tokens" />
        <div className="px-5 pb-5">
          {usages.state === 'loading' && <Loading label="토큰 사용량을 읽는 중" lines={4} />}
          {usages.state === 'error' && <p role="alert" className="text-small text-danger">사용량을 읽지 못했습니다.</p>}
          {usages.state === 'ready' && (() => {
            const rows = projects.map((p) => {
              const mine = usages.data.filter((u) => u.project === p.id && u.usage)
              return {
                key: p.id,
                label: p.name,
                input: mine.reduce((a, u) => a + u.usage!.input, 0),
                output: mine.reduce((a, u) => a + u.usage!.output, 0),
                calls: mine.reduce((a, u) => a + u.usage!.calls, 0),
              }
            })
            const total = rows.reduce((a, r) => a + r.input + r.output, 0)
            const calls = rows.reduce((a, r) => a + r.calls, 0)
            return (
              <>
                <p className="text-small text-fg-3">전체 사용량</p>
                <p className="mt-1 mb-5 flex items-baseline gap-2">
                  <span className="text-title font-medium tabular-nums">{compact(total)}</span>
                  <span className="text-small text-fg-3 tabular-nums">토큰 · 호출 {fmt(calls)}회</span>
                </p>
                <TokenRows rows={rows} caption="프로젝트별 토큰 사용량" />
              </>
            )
          })()}
        </div>
      </Card>

      <Card aria-labelledby="home-recent">
        <CardHeader eyebrow="Activity" title="최근 생성된 버전" titleId="home-recent" />
        <ol className="space-y-3 px-5 pb-5">
          {recent.map(({ p, v }) => (
            <li key={`${p.id}@${v.design_version}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
              <span aria-hidden="true" className="mt-1.5 size-2 rounded-full bg-fg-3" />
              <div className="min-w-0">
                <p className="truncate text-label"><span className="font-medium">{p.name}</span> <span className="text-fg-3">v{v.design_version}</span></p>
                <p className="text-micro text-fg-3 tabular-nums">{formatDate(v.created_at)}{v.db_validation ? ` · DB ${v.db_validation === 'PASSED' ? '통과' : '실패'}` : ''}</p>
              </div>
            </li>
          ))}
          {recent.length === 0 && <li className="text-small text-fg-3">아직 생성된 버전이 없습니다.</li>}
        </ol>
      </Card>
    </>
  )
}
