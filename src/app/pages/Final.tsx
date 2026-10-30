import { ArrowsClockwise, Copy, DownloadSimple, Eye, FileText, Check, SealCheck, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { Job } from '../../api'
import { formatDate } from '../../labels'
import type { Design, VersionRecord } from '../../types'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, ErrorNote, fmt, Loading } from '../components/ui'
import { ZipButton } from '../components/ZipButton'
import { ARTIFACT_FILES, DEV_SPEC_FILES, fileUrl } from '../lib/artifacts'
import { useFile } from '../lib/data'
import { relationsOf } from '../lib/erd'
import { remarkKey, useSemanticChecks, useSemanticReview } from '../lib/semantic'
import { FullErd } from './Erd'

// 최종 산출물: 이 버전에 저장된 결과 (화면에서 고치고 저장하지 않은 내용은 들어가지 않는다)
export function FinalView({ design, project, version, record, finalized, unsavedEntities, onOpenEntity, onOpenDevSpec, review, onReview }: {
  design: Design
  project: string
  version: string
  record?: VersionRecord
  finalized: { spec?: string; erd?: string; final?: string }
  unsavedEntities: number
  onOpenEntity: (id: string) => void
  /** 산출물 보기 → 개발 스펙 탭의 그 문서 */
  onOpenDevSpec: (name: string) => void
  /** 이 버전의 의미 검토 작업 (ERD 최종 확정 때 시작) */
  review?: Job
  onReview: () => void
}) {
  // 최종본은 확정한 ERD 아래 번호(v2.1 → v2.1.1). 백엔드 최종 단계가 생기기 전에는 ERD 버전을 미리 보기로 보여준다
  const isFinal = version.split('.').length === 3
  const ready = Boolean(finalized.spec && finalized.erd)
  const { entities } = design.data_model
  return (
    <div className="space-y-4">
      <Card aria-labelledby="final-title">
        <CardHeader
          level={1}
          eyebrow={isFinal ? `Deliverables · v${version}` : `Deliverables · ERD v${version} 기준 미리 보기`}
          title={record?.title ? `최종 산출물 · ${record.title}` : '최종 산출물'}
          titleId="final-title"
          actions={finalized.final
            ? <FinalBadge at={finalized.final} />
            : ready
              ? <Badge tone="info">기능 명세·ERD 확정 · 최종 확정 전</Badge>
              : <Badge tone="warn">확정 전 미리 보기</Badge>}
        >
          <p className="mt-1 text-label text-fg-3">
            요구사항 {fmt(design.requirements.length)} · 기능 {fmt(design.functions.length)} · 테이블 {fmt(entities.length)} · 관계 {fmt(relationsOf(entities).length)}
            {record?.created_at && ` · ${formatDate(record.created_at)} 생성`}
          </p>
        </CardHeader>
        <div className="space-y-2 px-5 pb-5">
          {!isFinal && (
            <p className="flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-small text-fg-2">
              <WarningCircle size={16} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" />
              ERD를 최종 확정하면 최종본 v{version}.1이 만들어집니다 (산출물은 이 ERD 그대로, 추적·의미 검토 추가). 지금은 ERD v{version}의 결과를 미리 보여줍니다.
            </p>
          )}
          {!ready && !finalized.final && (
            <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-small text-warn">
              <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {!finalized.spec && !finalized.erd ? '기능 명세와 ERD를' : !finalized.spec ? '기능 명세를' : 'ERD를'} 아직 확정하지 않았습니다. 확정하기 전의 결과입니다.
            </p>
          )}
          {unsavedEntities > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-small text-info">
              <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              ERD 화면에서 저장하지 않은 테이블 수정 {unsavedEntities}건은 여기에 들어가지 않습니다. 'ERD 저장하고 새 버전 만들기'를 하면 새 버전의 산출물에 반영됩니다.
            </p>
          )}
          <dl className="grid gap-3 pt-2 sm:grid-cols-3">
            <Summary term="DB 검증" value={record?.db_validation ? (record.db_validation === 'PASSED' ? '통과' : '실패') : '하지 않음'}
              tone={record?.db_validation === 'PASSED' ? 'ok' : record?.db_validation ? 'danger' : undefined} />
            <Summary term="Agent 완료 조건" value={`${design.completion.checks.filter((c) => c.passed).length}/${design.completion.checks.length}`} />
            <Summary term="열린 검토 지적" value={`${design.issues.filter((i) => i.status !== 'RESOLVED').length}건`} />
          </dl>
        </div>
      </Card>

      <SemanticReviewCard project={project} version={version} hasErd={entities.length > 0} erdFinalized={Boolean(finalized.erd)}
        review={review} onReview={onReview} />

      <FinalErdCard design={design} version={version} onOpenEntity={onOpenEntity} />

      <DdlCard project={project} version={version} />

      <Card aria-labelledby="final-files">
        <CardHeader eyebrow="Files" title="산출물 파일" titleId="final-files" actions={<ZipButton project={project} version={version} size="sm" />}>
          <p className="mt-1 text-small text-fg-3">이 버전의 설계 산출물을 그대로 받습니다. zip에는 아래 개발 스펙 파일도 함께 들어갑니다.</p>
        </CardHeader>
        <FileList project={project} version={version} files={ARTIFACT_FILES} />
      </Card>

      <DevSpecFilesCard design={design} project={project} version={version} onOpen={onOpenDevSpec} />
    </div>
  )
}

/** 최종 확정 표시 (최종 산출물 화면·산출물 보기 제목 옆에 같은 모양으로) */
export function FinalBadge({ at, large }: { at: string; large?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md bg-ok-soft font-semibold text-ok',
      large ? 'px-3 py-1.5 text-label' : 'px-2 py-1 text-small')}>
      <SealCheck size={large ? 18 : 16} weight="fill" aria-hidden="true" />
      최종 확정됨 <span className="font-normal tabular-nums">{formatDate(at)}</span>
    </span>
  )
}

/** 최종 ERD: 이 버전에 저장된 데이터 모델의 관계도 (테이블이 적으면 관계도, 많으면 테이블 지도부터) */
export function FinalErdCard({ design, version, onOpenEntity }: { design: Design; version: string; onOpenEntity: (id: string) => void }) {
  const { entities } = design.data_model
  return (
    <Card aria-labelledby="final-erd">
      <CardHeader eyebrow="Final ERD" title="최종 ERD" titleId="final-erd">
        <p className="mt-1 text-small text-fg-3">
          v{version}에 저장된 데이터 모델로 그린 ERD입니다 · 테이블 {fmt(entities.length)} · 관계 {fmt(relationsOf(entities).length)}.
          테이블을 누르면 ERD 화면에서 그 테이블을 엽니다.
        </p>
      </CardHeader>
      {entities.length === 0
        ? <Empty title="이 버전에는 데이터 모델이 없습니다" />
        : <FullErd entities={entities} functions={design.functions} onPick={onOpenEntity} />}
    </Card>
  )
}

/** 의미 검토 미리 보기: ERD 최종 확정 때 한 번 돌린 결과 (semantic_review.json). 자동으로 고치지 않는 보고용 */
function SemanticReviewCard({ project, version, hasErd, erdFinalized, review, onReview }: {
  project: string
  version: string
  hasErd: boolean
  erdFinalized: boolean
  review?: Job
  onReview: () => void
}) {
  const running = review?.status === 'running'
  // 검토 작업이 끝나면 다시 읽는다
  const result = useSemanticReview(project, version, true, review?.finished_at)
  const { checked, toggle } = useSemanticChecks(project, version)
  const remarks = result?.remarks ?? []
  const done = remarks.filter((r, i) => checked[remarkKey(r, i)]).length
  return (
    <Card aria-labelledby="final-semantic">
      <CardHeader
        eyebrow="Semantic review"
        title="의미 검토 (ERD ↔ 기능 명세)"
        titleId="final-semantic"
        actions={result && !running && (
          <>
            <Button size="sm" variant="ghost" icon={<ArrowsClockwise />} onClick={onReview}>다시 검토</Button>
            <a href={fileUrl(project, version, 'semantic_review.md')} download={`semantic_review.v${version}.md`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-card px-2.5 text-small font-semibold hover:border-control hover:bg-sunken">
              <DownloadSimple size={16} aria-hidden="true" />받기
            </a>
          </>
        )}
      >
        <p className="mt-1 text-small text-fg-3">
          {result
            ? `${formatDate(result.reviewed_at)} 검토 · ${result.scope} · LLM 호출 ${fmt(result.usage.calls ?? 0)}회 · `
              + `입력 ${fmt(result.usage.input_tokens ?? 0)} / 출력 ${fmt(result.usage.output_tokens ?? 0)} 토큰. AI 지적이므로 담당자가 확인해 반영 여부를 정합니다.`
            : 'ERD를 최종 확정하면 최종본을 만들면서 확정한 ERD를 기능 명세와 대조해 빠진 데이터·제약을 한 번 검토합니다.'}
        </p>
      </CardHeader>
      <div className="px-5 pb-5">
        {running && <Loading label="의미 검토 중" lines={3} />}
        {!running && result === undefined && <Loading label="의미 검토 결과를 확인하는 중" lines={2} />}
        {!running && result === null && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2.5 text-small text-fg-2">
            <span>{!hasErd ? '이 버전에는 ERD가 없어 의미 검토를 할 수 없습니다.'
              : erdFinalized ? `아직 최종본이 없습니다. 최종본 v${version}.1을 만들고 검토할 수 있습니다.`
              : `ERD 화면의 '확인 필요' 탭에서 'ERD 최종 확정'을 누르면 최종본 v${version}.1을 만들고 검토합니다.`}</span>
            {hasErd && erdFinalized && <Button size="sm" onClick={onReview}>최종본 만들기</Button>}
          </div>
        )}
        {!running && result && (
          <>
            {result.failed.length > 0 && (
              <p className="mb-3 flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-small text-warn">
                <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />검토 실패(미검증): {result.failed.join(', ')}
              </p>
            )}
            {remarks.length === 0
              ? <p className="flex items-center gap-2 text-small text-ok"><SealCheck size={16} weight="fill" aria-hidden="true" />지적 없음</p>
              : (
                <ul className="space-y-2">
                  <li className="text-small text-fg-3">확인한 지적 <strong className="font-semibold text-fg tabular-nums">{done}/{remarks.length}</strong> · 반영 여부를 정한 지적은 '확인함'으로 표시하세요.</li>
                  {remarks.map((r, i) => (
                    <li key={remarkKey(r, i)} className={cx('rounded-lg border border-line px-3 py-2.5', checked[remarkKey(r, i)] && 'opacity-60')}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex flex-wrap items-center gap-1.5 text-small">
                          <Badge tone={checked[remarkKey(r, i)] ? 'ok' : 'warn'}>{r.label}</Badge>
                          <span className="font-mono text-micro text-fg-3">{r.target}</span>
                        </p>
                        <Checkbox checked={Boolean(checked[remarkKey(r, i)])} onChange={() => toggle(remarkKey(r, i))} label="확인함" />
                      </div>
                      <p className="mt-1 text-label">{r.message}</p>
                      {r.evidence && <p className="mt-1 text-small text-fg-3">근거: {r.evidence}</p>}
                      {r.suggestion && <p className="mt-0.5 text-small text-fg-2">제안: {r.suggestion}</p>}
                    </li>
                  ))}
                </ul>
              )}
          </>
        )}
      </div>
    </Card>
  )
}

function Summary({ term, value, tone }: { term: string; value: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <dt className="text-small text-fg-3">{term}</dt>
      <dd className={cx('mt-0.5 text-subtitle font-medium tabular-nums', tone === 'ok' && 'text-ok', tone === 'danger' && 'text-danger')}>{value}</dd>
    </div>
  )
}

function DdlCard({ project, version }: { project: string; version: string }) {
  const sql = useFile(project, version, 'schema.sql')
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const text = sql.state === 'ready' ? sql.data : null
  const lines = text?.split('\n') ?? []
  const shown = expanded ? lines : lines.slice(0, 40)
  return (
    <Card aria-labelledby="final-ddl">
      <CardHeader
        eyebrow="DDL"
        title="테이블 생성 스크립트"
        titleId="final-ddl"
        actions={text && (
          <>
            <Button size="sm" icon={copied ? <Check /> : <Copy />} onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })}>
              {copied ? '복사함' : '복사'}
            </Button>
            <a href={fileUrl(project, version, 'schema.sql')} download={`schema.v${version}.sql`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-card px-2.5 text-small font-semibold hover:border-control hover:bg-sunken">
              <DownloadSimple size={16} aria-hidden="true" />받기
            </a>
          </>
        )}
      />
      <div className="px-5 pb-5">
        {sql.state === 'loading' && <Loading label="schema.sql을 불러오는 중" lines={6} />}
        {sql.state === 'error' && <ErrorNote message={sql.message} />}
        {sql.state === 'ready' && text === null && <p className="text-small text-fg-3">이 버전에는 schema.sql 파일이 없습니다.</p>}
        {text && (
          <>
            <pre className="relative max-h-[60vh] overflow-auto rounded-lg border border-line bg-sunken p-4 font-mono text-small leading-relaxed">
              <code>{shown.map((line, i) => <span key={i} className={line.trimStart().startsWith('--') ? 'text-fg-3' : undefined}>{line}{'\n'}</span>)}</code>
            </pre>
            {lines.length > 40 && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setExpanded((v) => !v)}>
                {expanded ? '접기' : `전체 보기 (${fmt(lines.length)}줄)`}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

/** 개발 스펙 파일: 최종본('ERD 최종 확정')에 생기는 개발 AI용 문서 9개를 읽는 순서대로. 문서마다 보기(개발 스펙 탭)·받기 */
function DevSpecFilesCard({ design, project, version, onOpen }: {
  design: Design
  project: string
  version: string
  onOpen: (name: string) => void
}) {
  const meta = design.meta.dev_spec
  return (
    <Card aria-labelledby="final-dev-spec">
      <CardHeader eyebrow="Dev spec" title="개발 스펙 파일" titleId="final-dev-spec">
        <p className="mt-1 text-small text-fg-3">
          {meta
            ? <>개발 AI(Claude Code 등)가 읽고 개발할 문서 9개입니다. 위 설계 산출물로 코드가 같은 틀({meta.format})로 만들고, 1번부터 읽습니다.
                {' '}기술 스택: <strong className="text-fg">{meta.stack || '정해지지 않음'}</strong>{meta.stack_basis === '가정' && ' (추천안으로 가정 — 확인 필요)'}</>
            : "이 버전에는 개발 스펙이 없습니다. ERD 화면에서 'ERD 최종 확정'으로 만든 최종본에 생깁니다 (예전에 만든 최종본은 다시 최종 확정하면 새 최종본에 생깁니다)."}
        </p>
      </CardHeader>
      {meta && (
        <ol className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
          {DEV_SPEC_FILES.map((d, i) => (
            <li key={d.name} className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-3 py-2">
              <span className="w-4 shrink-0 font-mono text-micro text-fg-3">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-label font-medium">{d.label}</span>
                <span className="block truncate font-mono text-micro text-fg-3">{d.name} · {d.summary}</span>
              </span>
              <button type="button" onClick={() => onOpen(d.name)} aria-label={`${d.name} 보기`}
                className="rounded-md p-1.5 text-fg-3 transition-colors duration-150 hover:bg-sunken hover:text-fg">
                <Eye size={16} aria-hidden="true" />
              </button>
              <a href={fileUrl(project, version, d.name)} download={d.name.replace(/(\.\w+)$/, `.v${version}$1`)} aria-label={`${d.name} 받기`}
                className="rounded-md p-1.5 text-fg-3 transition-colors duration-150 hover:bg-sunken hover:text-fg">
                <DownloadSimple size={16} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/** 이 버전 폴더에 실제로 있는 파일만 보여준다 */
function FileList({ project, version, files: candidates }: { project: string; version: string; files: { name: string; label: string }[] }) {
  const [exists, setExists] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    let cancelled = false
    Promise.all(candidates.map((d) => fetch(fileUrl(project, version, d.name), { method: 'HEAD' }).then((r) => [d.name, r.ok] as const).catch(() => [d.name, false] as const)))
      .then((pairs) => { if (!cancelled) setExists(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [project, version, candidates])
  if (!exists) return <Loading label="파일 목록을 확인하는 중" lines={4} />
  const files = candidates.filter((d) => exists[d.name])
  if (files.length === 0) return <Empty title="받을 수 있는 파일이 없습니다" />
  return (
    <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
      {files.map((d) => (
        <li key={d.name}>
          <a
            href={fileUrl(project, version, d.name)}
            download={d.name.replace(/(\.\w+)$/, `.v${version}$1`)}
            className="flex min-h-12 items-center gap-3 rounded-lg border border-line px-3 py-2 transition-colors duration-150 hover:border-control hover:bg-sunken"
          >
            <FileText size={20} className="shrink-0 text-fg-3" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-label font-medium">{d.label}</span>
              <span className="block truncate font-mono text-micro text-fg-3">{d.name}</span>
            </span>
            <DownloadSimple size={16} className="text-fg-3" aria-label="받기" />
          </a>
        </li>
      ))}
    </ul>
  )
}
