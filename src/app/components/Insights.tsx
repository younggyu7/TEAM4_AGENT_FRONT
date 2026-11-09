import { CheckCircle, Info, Warning, WarningOctagon, XCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { getAppFiles, type AppFileTree, type DraftLogEntry } from '../../api'
import { formatDate } from '../../labels'
import type { Design, Project, VersionRecord } from '../../types'
import { useUsages, type Load, type Usage, type VersionUsage } from '../lib/data'
import { costOf, shortModel, usd } from '../lib/pricing'
import type { EditPage, Page } from '../lib/route'
import { BarList, TickMeter, TokenBars, TokenRows } from './charts'
import { OPEN_CODE_FILE } from './CodeBrowser'
import { MembersCard } from './MembersCard'
import { AccessTokenCard, ExtensionCard } from './MyWork'
import { RepoCard } from './RepoCard'
import { can, type User } from '../lib/session'
import { Badge, Card, CardHeader, compact, cx, fmt, Loading } from './ui'

/* ============================================================ 작업 화면 오른쪽 */
type Summary = { total: number; done: number; requiredLeft: number }

export function WorkspaceInsights({ design, project, version, reviews, finalized, page, log, canEditMembers = false, user }: {
  design: Design
  /** 최종 개발물 '코드 저장소'의 버튼 권한 */
  user?: User
  project?: Project
  version: string
  /** PM: 프로젝트 담당자(이 프로젝트를 보는 회원, Slack 채널 초대)를 바꿀 수 있다 (백엔드도 PM만 허용) */
  canEditMembers?: boolean
  /** 단계마다 그 단계 버전(기능 명세 v1, ERD v1.2)의 확인 항목 요약. null이면 읽는 중 */
  reviews: Record<EditPage, Summary | null>
  finalized: Partial<Record<EditPage | 'final', string>>
  page: Page
  /** 기능 명세·ERD 화면: 이 버전 초안의 변경 내역 (누가·언제·무엇을) */
  log?: DraftLogEntry[]
}) {
  const versions = project?.versions ?? [{ design_version: version }]
  const targets = useMemo(() => versions.map((v) => ({ project: project?.id ?? '', version: v.design_version })), [versions, project?.id])
  const usages = useUsages(project && page !== 'develop' ? targets : [])
  const record = project?.versions.find((v) => v.design_version === version)

  return (
    <>
      {page === 'develop' ? (
        // 최종 개발물: 진행 상황·검토 지적 대신 코드 저장소(브랜치·이력), VS Code 확장 연결(개발자만), 업무 로직 현황과 개발할 때 쓴 토큰
        <>
          {project && user && record?.develop && <RepoCard project={project.id} version={record.design_version} user={user} />}
          {project && can(user, 'develop') && <ExtensionCard project={project.id} />}
          {project && <LogicStatusCard project={project.id} record={record} />}
          <DevelopTokenCard record={record} />
          {project && <MembersCard project={project.id} canEdit={canEditMembers} />}
        </>
      ) : (
        <>
          <ProgressCard design={design} reviews={reviews} finalized={finalized} page={page} />
          {log && <ChangeLogCard log={log} />}
          <TokenCard usages={usages} version={version} />
          <IssuesCard design={design} />
          {project && <MembersCard project={project.id} canEdit={canEditMembers} />}
        </>
      )}
    </>
  )
}

/** 변경 내역: PM·개발자가 이 버전 초안에서 무엇을 고쳤는지 (최신이 위). 승인 요청·취소·확정도 같이 */
function ChangeLogCard({ log }: { log: DraftLogEntry[] }) {
  const shown = [...log].reverse().slice(0, 30)
  return (
    <Card aria-labelledby="change-log">
      <CardHeader eyebrow="Changes" title="변경 내역" titleId="change-log" actions={<span className="text-label font-medium tabular-nums">{log.length}건</span>} />
      <div className="px-5 pb-5">
        {log.length === 0 ? <p className="text-small text-fg-3">아직 고친 사람이 없습니다 (원본 초안 그대로).</p> : (
          <ol className="space-y-3">
            {shown.map((e, i) => (
              <li key={`${e.at}-${i}`} className="text-small">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-fg">{e.by.name}</span>
                  {e.event === 'request' && <Badge tone="info">승인 요청</Badge>}
                  {e.event === 'request_cancelled' && <Badge tone="warn">요청 취소</Badge>}
                  {e.event === 'request_rejected' && <Badge tone="danger">반려</Badge>}
                  {e.event === 'confirm' && <Badge tone="ok">확정</Badge>}
                  <span className="text-fg-3 tabular-nums">{formatDate(e.at)}</span>
                </p>
                <ul className="mt-1 space-y-0.5 text-fg-2">
                  {e.changes.slice(0, 8).map((c, j) => (
                    <li key={j}>
                      {c.target && c.label !== '확인 표시' && <span className="font-mono text-micro text-fg-3">{c.target} </span>}
                      {c.label && !e.event && <span className="text-fg-3">{c.label} · </span>}
                      {c.what}
                    </li>
                  ))}
                  {e.changes.length > 8 && <li className="text-fg-3">외 {e.changes.length - 8}건</li>}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  )
}

function ProgressCard({ design, reviews, finalized, page }: {
  design: Design
  reviews: Record<EditPage, Summary | null>
  finalized: Partial<Record<EditPage | 'final', string>>
  page: Page
}) {
  const checks = design.completion.checks
  const passed = checks.filter((c) => c.passed).length
  // 기능 명세·ERD 화면은 그 화면의 확인 항목만, 최종 산출물은 의미 검토 → ERD → 기능 명세 (각 단계 버전의 체크로)
  const order: EditPage[] = page === 'spec' ? ['spec'] : page === 'erd' ? ['erd'] : page === 'final' ? ['erd', 'spec'] : ['spec', 'erd']
  return (
    <Card aria-labelledby="progress-title">
      <CardHeader eyebrow="Progress" title="진행 상황" titleId="progress-title" />
      <div className="space-y-5 px-5 pb-5">
        {page === 'final' && <SemanticProgress design={design} finalizedAt={finalized.final} />}
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

/** 의미 검토 지적과 처리: ERD 화면에서 사람이 처리를 정한 수 (최종 산출물 화면의 지적 카드와 같은 기준) */
function SemanticProgress({ design, finalizedAt }: { design: Design; finalizedAt?: string }) {
  const remarks = design.issues.filter((i) => i.kind.startsWith('SEM_'))
  const done = remarks.filter((i) => i.resolution || i.status === 'RESOLVED').length
  const left = remarks.length - done
  return (
    <ReviewProgress name="의미 검토 지적 처리" review={{ total: remarks.length, done, requiredLeft: 0 }} finalizedAt={finalizedAt} current
      note={!remarks.length ? '남은 지적 없음' : left ? `처리가 남지 않은 지적 ${left}건 (ERD 화면에서 처리)` : '모든 지적의 처리를 정했습니다'}
      noteTone={left ? 'warn' : 'ok'} />
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
  // 이 버전을 만든 모델 (검토 보고서 'LLM 사용량'의 '- 모델:' 줄. 예전 버전은 기록 없음)
  const model = usages.state === 'ready' ? usages.data.find((u) => u.version === version)?.usage?.model : undefined
  return (
    <Card aria-labelledby="tokens-title">
      <CardHeader eyebrow="Tokens" titleId="tokens-title"
        title={<span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0">토큰 사용량</span>
          <span className="min-w-0 truncate text-small font-normal text-fg-3" title={model}>{model ? shortModel(model) : usages.state === 'loading' ? '…' : '모델 기록 없음'}</span>
        </span>} />
      <div className="px-5 pb-5">
        {usages.state === 'loading' && <Loading label="토큰 사용량을 읽는 중" lines={4} />}
        {usages.state === 'error' && <p role="alert" className="text-small text-danger">사용량을 읽지 못했습니다: {usages.message}</p>}
        {usages.state === 'ready' && (() => {
          const known = usages.data.filter((u) => u.usage)
          if (known.length === 0) return <p className="text-small text-fg-3">이 프로젝트의 review_report.md에 사용량 기록이 없습니다.</p>
          const cur = usages.data.find((u) => u.version === version)?.usage
          const sum = known.reduce((a, u) => a + u.usage!.input + u.usage!.output, 0)
          // 금액: 버전마다 그 버전을 만든 모델 단가로 계산해 더한다 (모델 기록이 없거나 단가를 모르는 버전은 뺀다)
          const costs = known.map((u) => costOf(u.usage!))
          const cost = costs.reduce<number>((a, c) => a + (c ?? 0), 0)
          const unpriced = costs.filter((c) => c === undefined).length
          const curCost = cur ? costOf(cur) : undefined
          return (
            <>
              <dl className="mb-2 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-small text-fg-3">이 버전 (v{version})</dt>
                  <dd className="mt-1 text-title font-medium tabular-nums">{cur ? compact(cur.input + cur.output) : '—'}</dd>
                  <dd className="text-micro text-fg-3 tabular-nums">{cur ? `호출 ${fmt(cur.calls)}회${curCost !== undefined ? ` · ${usd(curCost)}` : ''}` : '기록 없음'}</dd>
                </div>
                <div>
                  <dt className="text-small text-fg-3">전체 버전 합계</dt>
                  <dd className="mt-1 flex items-baseline gap-2 tabular-nums">
                    <span className="text-title font-medium">{compact(sum)}</span>
                    {unpriced < known.length && <span className="text-label font-medium text-fg-2" title="버전마다 그 모델의 입력·출력·캐시 단가로 계산 (USD, 정가)">≈ {usd(cost)}</span>}
                  </dd>
                  <dd className="text-micro text-fg-3 tabular-nums">버전 {known.length}개{unpriced > 0 ? ` · ${unpriced}개는 모델 기록·단가 없어 금액 제외` : ''}</dd>
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
      <AccessTokenCard />
    </>
  )
}


/** 최종 개발물: 개발할 때 쓴 모델·effort와 토큰 (AI 안 씀이면 0) */
function DevelopTokenCard({ record }: { record?: VersionRecord }) {
  const d = record?.develop
  const u = d?.usage
  const mode = u?.mode ?? (d?.build ? 'build' : d?.logic ? 'logic' : 'none')
  const label = mode === 'build' ? '기능 전체 AI' : mode === 'logic' ? '빈 로직만 AI' : 'AI 안 씀'
  const model = u?.model || d?.ai?.model || ''
  const effort = u?.effort || d?.ai?.effort || ''
  // 금액: 회차마다 그 회차 모델 단가로 (모델 기록이 없거나 단가를 모르면 빼고 '단가 미등록')
  const costOfRun = (x: NonNullable<VersionRecord['develop']>) => {
    const m = x.usage?.model || x.ai?.model || ''
    return x.usage && m ? costOf({ model: m, input: x.usage.input, output: x.usage.output } as Usage) : x.usage?.mode === 'none' ? 0 : undefined
  }
  const runs = d ? (record?.developments?.length ? record.developments : [d]) : []
  const cost = d ? costOfRun(d) : undefined
  const runCosts = runs.map(costOfRun)
  const total = runCosts.reduce<number>((a, c) => a + (c ?? 0), 0)
  const unpriced = runCosts.filter((c, i) => c === undefined && runs[i].usage).length
  return (
    <Card aria-labelledby="dev-tokens-title">
      <CardHeader eyebrow="Tokens" titleId="dev-tokens-title"
        title={<span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0">개발 토큰</span>
          {mode !== 'none' && <span className="min-w-0 truncate text-small font-normal text-fg-3" title={`${model} · ${effort}`}>
            {[model && shortModel(model), effort].filter(Boolean).join(' · ') || '기본 모델'}</span>}
        </span>} />
      <div className="px-5 pb-5">
        {!d ? <p className="text-small text-fg-3">아직 개발하지 않았습니다.</p> : (
          <>
          <dl className="mb-5 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <dt className="text-small text-fg-3">방식 (이번 개발)</dt>
              <dd className="mt-1 truncate text-label font-medium">{label}</dd>
              <dd className="text-micro text-fg-3 tabular-nums">{u ? `호출 ${fmt(u.calls)}회` : mode === 'none' ? '호출 0회' : '기록 없음 (예전 개발)'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-small text-fg-3">토큰</dt>
              <dd className="mt-1 text-title font-medium tabular-nums">{u ? compact(u.input + u.output) : mode === 'none' ? '0' : '—'}</dd>
              <dd className="truncate text-micro text-fg-3 tabular-nums">
                {u ? `입력 ${compact(u.input)} · 출력 ${compact(u.output)}` : ''}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-small text-fg-3">비용</dt>
              <dd className="mt-1 text-title font-medium tabular-nums">
                {mode === 'none' ? '$0' : cost !== undefined ? usd(cost) : '—'}</dd>
              <dd className="truncate text-micro text-fg-3">{mode === 'none' || cost !== undefined ? 'USD 정가' : u ? '단가 미등록 모델' : '기록 없음'}</dd>
            </div>
          </dl>
          <p className="mb-4 text-small text-fg-3 tabular-nums" title="회차마다 그 회차 모델의 입력·출력 단가로 계산 (USD, 정가)">
            개발 {runs.length}회 합계 <span className="font-medium text-fg-2">≈ {usd(total)}</span>{unpriced > 0 ? ` · ${unpriced}회는 단가 없어 제외` : ''}
          </p>
          {/* 개발한 회차별 입력·출력 (다른 화면의 버전별 막대와 같은 부품). 기록이 없던 예전 회차는 0 */}
          <TokenBars
            caption="개발 회차별 토큰 사용량"
            bars={(record?.developments?.length ? record.developments : [d]).map((x, i, all) => {
              const xu = x.usage
              const xmode = xu?.mode ?? (x.build ? 'build' : x.logic ? 'logic' : 'none')
              return {
                key: `${x.at}-${i}`,
                label: `${i + 1}회`,
                input: xu?.input ?? 0,
                output: xu?.output ?? 0,
                calls: xu?.calls ?? 0,
                current: i === all.length - 1,
                sub: `${formatDate(x.at)} · ${xmode === 'build' ? '기능 전체 AI' : xmode === 'logic' ? '빈 로직만 AI' : 'AI 안 씀'}${xu || xmode === 'none' ? '' : ' · 기록 없음 (예전 개발)'}${runCosts[i] !== undefined ? ` · ${usd(runCosts[i]!)}` : ''}`,
              }
            })}
          />
          </>
        )}
      </div>
    </Card>
  )
}

/** 최종 개발물: 업무 로직 자리 현황 (빈 로직 · AI가 채움 · 사람이 채움)과 빈 로직이 많은 파일. 누르면 1단계 코드 보기에서 연다 */
function LogicStatusCard({ project, record }: { project: string; record?: VersionRecord }) {
  const [tree, setTree] = useState<AppFileTree | null>(null)
  const [error, setError] = useState('')
  const at = record?.develop?.at
  useEffect(() => {
    if (!at) return
    getAppFiles(project).then((t) => { setTree(t); setError('') }).catch((e) => setError((e as Error).message))
  }, [project, at])
  const human = tree ? Math.max(0, tree.holes - tree.empty_holes - tree.ai_holes) : 0
  const pct = (n: number) => (tree && tree.holes ? `${(n / tree.holes) * 100}%` : '0%')
  const top = tree ? [...tree.files].filter((f) => f.empty_holes > 0).sort((a, b) => b.empty_holes - a.empty_holes).slice(0, 5) : []
  return (
    <Card aria-labelledby="logic-status-title">
      <CardHeader eyebrow="Logic" title="업무 로직 현황" titleId="logic-status-title"
        actions={tree ? <span className="text-label font-medium tabular-nums">{tree.holes}곳</span> : undefined} />
      <div className="space-y-3 px-5 pb-5">
        {!at ? <p className="text-small text-fg-3">개발하면 업무 로직 자리가 생깁니다.</p>
          : error ? <p role="alert" className="text-small text-danger">{error}</p>
          : !tree ? <Loading label="업무 로직을 세는 중" lines={2} /> : (
            <>
              <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-sunken">
                <span className="bg-warn" style={{ width: pct(tree.empty_holes) }} />
                <span className="bg-ai" style={{ width: pct(tree.ai_holes) }} />
                <span className="bg-ok" style={{ width: pct(human) }} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div><dt className="text-micro text-warn">빈 로직</dt><dd className="text-label font-medium tabular-nums">{tree.empty_holes}</dd></div>
                <div><dt className="text-micro text-ai">AI가 채움</dt><dd className="text-label font-medium tabular-nums">{tree.ai_holes}</dd></div>
                <div><dt className="text-micro text-ok">사람이 채움</dt><dd className="text-label font-medium tabular-nums">{human}</dd></div>
              </dl>
              {tree.ai_files > 0 && <p className="text-small text-ai">기능 전체 AI가 쓴 파일 {tree.ai_files}개 (업무 로직 자리 없이 기능을 통째로 구현)</p>}
              {top.length > 0 && (
                <div>
                  <p className="mb-1 text-micro text-fg-3">빈 로직이 많은 파일</p>
                  <ul className="space-y-0.5">
                    {top.map((f) => (
                      <li key={f.path}>
                        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CODE_FILE, { detail: f.path }))}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-small hover:bg-sunken" title={f.path}>
                          <span className="min-w-0 flex-1 truncate font-mono text-micro">{f.path.split('/').pop()}</span>
                          <span className="shrink-0 rounded-sm bg-warn-soft px-1 text-micro text-warn tabular-nums">빈 {f.empty_holes}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
      </div>
    </Card>
  )
}
