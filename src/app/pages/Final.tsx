import { ArrowBendUpLeft, Copy, DownloadSimple, Eye, FileText, Check, SealCheck, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { decideFinal, getTechStacks, setTechStack, targetsOf, type Approval, type ChangeItem, type Job } from '../../api'
import { formatDate, issueKindLabel } from '../../labels'
import type { Design, Issue, VersionRecord } from '../../types'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, ErrorNote, fmt, Label, Loading, TextArea, TextInput } from '../components/ui'
import { ZipButton } from '../components/ZipButton'
import { ARTIFACT_FILES, DEV_SPEC_FILES, fileUrl } from '../lib/artifacts'
import { refreshVersion, useFile } from '../lib/data'
import { relationsOf } from '../lib/erd'
import { FullErd } from './Erd'

// 최종 산출물: 최종본(v<ERD>.1)에 저장된 결과를 보여주기만 한다 (고치는 단계가 아님 — 바꾸려면 ERD 화면에서 새 버전)
export function FinalView({ design, project, version, record, finalized, onOpenEntity, onOpenDevSpec, review, canDecide, onDecided, previous }: {
  design: Design
  project: string
  version: string
  record?: VersionRecord
  finalized: { spec?: string; erd?: string; final?: string }
  onOpenEntity: (id: string) => void
  /** 산출물 보기 → 개발 스펙 탭의 그 문서 */
  onOpenDevSpec: (name: string) => void
  /** 진행 중인 ERD 최종 확정 작업 */
  review?: Job
  /** 팀장: 최종 승인·수정 지시·기술 스택을 정할 수 있다 */
  canDecide: boolean
  /** 승인·수정 지시를 남긴 뒤 버전 기록을 다시 읽는다 */
  onDecided: () => void
  /** 이 최종본보다 먼저 받은 수정 지시 (그 처리 결과를 보고 승인한다) */
  previous?: VersionRecord
}) {
  // 최종본은 확정한 ERD 아래 번호(v2.1 → v2.1.1). 아직 없으면 ERD 버전을 미리 보기로 보여준다
  const isFinal = record?.stage === 'final' || version.split('.').length === 3
  const { entities } = design.data_model
  const remarks = design.issues.filter((i) => i.kind.startsWith('SEM_'))
  return (
    <div className="space-y-4">
      <Card aria-labelledby="final-title">
        <CardHeader
          level={1}
          eyebrow={isFinal ? `Deliverables · v${version}` : `Deliverables · ERD v${version} 기준 미리 보기`}
          title={record?.title ? `최종 산출물 · ${record.title}` : '최종 산출물'}
          titleId="final-title"
          actions={isFinal && record?.approval?.decision === 'approve'
            ? <ApprovedBadge at={record.approval.at} by={record.approval.by.name} />
            : isFinal && finalized.final ? <FinalBadge at={finalized.final} /> : <Badge tone="warn">최종 확정 전 미리 보기</Badge>}
        >
          <p className="mt-1 text-label text-fg-3">
            요구사항 {fmt(design.requirements.length)} · 기능 {fmt(design.functions.length)} · 테이블 {fmt(entities.length)} · 관계 {fmt(relationsOf(entities).length)}
            {record?.created_at && ` · ${formatDate(record.created_at)} 생성`}
          </p>
        </CardHeader>
        <div className="space-y-2 px-5 pb-5">
          {review?.status === 'running' && (
            <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-small text-info">
              <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{review.message}
            </p>
          )}
          {!isFinal && (
            <p className="flex items-start gap-2 rounded-md bg-sunken px-3 py-2 text-small text-fg-2">
              <WarningCircle size={16} className="mt-0.5 shrink-0 text-fg-3" aria-hidden="true" />
              ERD 화면에서 필수 항목을 모두 처리하고 'ERD 최종 확정하기'를 누르면 최종본 v{version}.1이 만들어집니다. 지금은 ERD v{version}의 결과를 미리 보여줍니다.
            </p>
          )}
          <dl className="grid gap-3 pt-2 sm:grid-cols-3">
            <Summary term="DB 검증" value={record?.db_validation ? (record.db_validation === 'PASSED' ? '통과' : '실패') : '하지 않음'}
              tone={record?.db_validation === 'PASSED' ? 'ok' : record?.db_validation ? 'danger' : undefined} />
            <Summary term="Agent 완료 조건" value={`${design.completion.checks.filter((c) => c.passed).length}/${design.completion.checks.length}`} />
            <Summary term="의미 검토 지적" value={`${remarks.length}건`} />
          </dl>
        </div>
      </Card>

      {isFinal && record && previous?.approval && !record.approval && <PreviousDirective record={previous} />}
      {isFinal && record && <DecisionCard project={project} version={version} record={record} design={design} canDecide={canDecide} onDecided={onDecided} />}

      <RemarksCard remarks={remarks} isFinal={isFinal} onOpen={onOpenEntity} entities={new Set(entities.map((e) => e.entity_id))} />

      <FinalErdCard design={design} version={version} onOpenEntity={onOpenEntity} />

      <DdlCard project={project} version={version} />

      <Card aria-labelledby="final-files">
        <CardHeader eyebrow="Files" title="산출물 파일" titleId="final-files" actions={<ZipButton project={project} version={version} size="sm" />}>
          <p className="mt-1 text-small text-fg-3">이 버전의 설계 산출물을 그대로 받습니다. zip에는 아래 개발 스펙 파일도 함께 들어갑니다.</p>
        </CardHeader>
        <FileList project={project} version={version} files={ARTIFACT_FILES} />
      </Card>

      <DevSpecFilesCard design={design} project={project} version={version} onOpen={onOpenDevSpec} canDecide={canDecide}
        chosen={record?.tech_stack?.basis === '확정'} onChosen={onDecided} />
    </div>
  )
}

const STAGE_NAME = { spec: '기능 명세', erd: 'ERD' } as const
/** 결정 한 줄 요약: 승인 / 수정 지시 → 기능 명세·ERD (항목 n개) */
const decisionText = (a: Approval) => a.decision === 'approve' ? '승인'
  : `수정 지시 → ${targetsOf(a).map((t) => STAGE_NAME[t]).join('·') || '단계 없음'}${a.items?.length ? ` (항목 ${a.items.length}개)` : ''}`

/**
 * 팀장 결정: 최종본을 승인하거나, 고칠 내용과 함께 기능 명세·ERD 단계로 돌려보낸다 (POST /projects/approval).
 * 수정 지시는 두 단계를 함께 고를 수 있고, 최종본의 기능·테이블을 골라 항목마다 메모를 남긴다 (항목만 골라도 그 단계로).
 * 돌려보낸 지시는 그 단계 화면 위에 보이고, 담당 파트가 고쳐 새 버전 → 다시 최종 확정한다. 기록은 버전 기록에 쌓인다.
 */
function DecisionCard({ project, version, record, design, canDecide, onDecided }: {
  project: string; version: string; record: VersionRecord; design: Design; canDecide: boolean; onDecided: () => void
}) {
  const [mode, setMode] = useState<'idle' | 'changes'>('idle')
  const [stages, setStages] = useState<{ spec: boolean; erd: boolean }>({ spec: false, erd: false })
  const [items, setItems] = useState<Record<string, ChangeItem>>({})   // '단계:ID' → 항목
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const ids = { comment: useId() }
  const last = record.approval
  const picked = Object.values(items)
  const send = async (decision: 'approve' | 'changes') => {
    setSending(true)
    setError('')
    try {
      await decideFinal({ project, version, decision, comment,
        targets: decision === 'changes' ? (['spec', 'erd'] as const).filter((t) => stages[t]) : undefined,
        items: decision === 'changes' ? picked : undefined })
      setMode('idle')
      setComment('')
      setItems({})
      setStages({ spec: false, erd: false })
      refreshVersion(project, version)
      onDecided()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }
  const approved = last?.decision === 'approve'
  const canSend = (stages.spec || stages.erd || picked.length > 0) && (comment.trim() !== '' || picked.some((i) => i.note.trim()))
  const toggle = (item: Omit<ChangeItem, 'note'>, on: boolean) => setItems((m) => {
    const key = `${item.stage}:${item.target_id}`
    const { [key]: _, ...rest } = m
    return on ? { ...m, [key]: { ...item, note: m[key]?.note ?? '' } } : rest
  })
  return (
    <Card aria-labelledby="final-decision" className={cx(approved && '!border-ok/50 !bg-ok-soft')}>
      <CardHeader eyebrow="Decision" title={approved ? '최종 승인된 산출물' : '팀장 결정'} titleId="final-decision"
        actions={last ? <Badge tone={last.decision === 'approve' ? 'ok' : 'warn'}>{last.decision === 'approve' ? '최종 승인됨' : decisionText(last)}</Badge>
          : <Badge tone="neutral">결정 전</Badge>}>
        <p className="mt-1 text-small text-fg-3">
          {approved ? `${last.by.name}님이 ${formatDate(last.at)}에 승인했습니다.`
            : last ? `${last.by.name} · ${formatDate(last.at)}${last.comment ? ` — ${last.comment}` : ''}`
            : '팀장이 이 최종본을 승인하거나, 고칠 내용을 적어 기능 명세·ERD 단계로 돌려보냅니다.'}
        </p>
      </CardHeader>
      <div className="space-y-3 px-5 pb-5">
        {!canDecide && <p className="text-small text-fg-3">최종 승인·수정 지시는 팀장만 할 수 있습니다.</p>}
        {approved && (
          <p className="flex items-center gap-1.5 text-label font-semibold text-ok">
            <SealCheck size={18} weight="fill" aria-hidden="true" />승인 완료
          </p>
        )}
        {!approved && last?.decision === 'changes' && (last.items?.length ?? 0) > 0 && (
          <ul className="space-y-0.5 rounded-md bg-warn-soft px-3 py-2 text-small">
            {last.items!.map((i) => (
              <li key={`${i.stage}:${i.target_id}`}><Badge tone="warn">{STAGE_NAME[i.stage]}</Badge> <span className="font-mono text-micro">{i.target_id}</span> {i.label} {i.note && <span className="text-fg-2">— {i.note}</span>}</li>
            ))}
          </ul>
        )}
        {canDecide && mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            {!approved && <Button variant="ok" icon={<SealCheck />} disabled={sending} onClick={() => void send('approve')}>최종 승인</Button>}
            <Button icon={<ArrowBendUpLeft />} disabled={sending} onClick={() => setMode('changes')}
              title={approved ? '승인을 거두고 고칠 내용과 함께 돌려보냅니다' : undefined}>
              {approved ? '승인 거두고 수정 지시' : '수정 지시'}
            </Button>
          </div>
        )}
        {canDecide && mode === 'changes' && (
          <div className="space-y-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-3">
            <fieldset className="flex flex-wrap gap-4 text-label">
              <legend className="mb-1 text-small font-medium text-fg">돌려보낼 단계 (둘 다 고를 수 있음)</legend>
              <Checkbox checked={stages.spec} onChange={(v) => setStages((s) => ({ ...s, spec: v }))} label="기능 명세 (기획 파트)" />
              <Checkbox checked={stages.erd} onChange={(v) => setStages((s) => ({ ...s, erd: v }))} label="ERD (데이터 파트)" />
            </fieldset>
            <div className="grid gap-3 lg:grid-cols-2">
              <ItemPicker title="고칠 기능" stage="spec" options={design.functions.map((f) => ({ id: f.function_id, label: f.name }))}
                items={items} onToggle={toggle} />
              <ItemPicker title="고칠 테이블" stage="erd" options={design.data_model.entities.map((e) => ({ id: e.entity_id, label: e.label }))}
                items={items} onToggle={toggle} />
            </div>
            {picked.length > 0 && (
              <ul className="space-y-1.5">
                {picked.map((i) => (
                  <li key={`${i.stage}:${i.target_id}`} className="flex flex-wrap items-center gap-2 text-small">
                    <Badge tone="warn">{STAGE_NAME[i.stage]}</Badge>
                    <span className="font-mono text-micro">{i.target_id}</span><span className="text-fg-2">{i.label}</span>
                    <TextInput dense className="min-w-0 flex-1" aria-label={`${i.target_id} 고칠 내용`} placeholder="고칠 내용" value={i.note} maxLength={1000}
                      onChange={(e) => setItems((m) => ({ ...m, [`${i.stage}:${i.target_id}`]: { ...i, note: e.target.value } }))} />
                  </li>
                ))}
              </ul>
            )}
            <div>
              <Label htmlFor={ids.comment} hint="항목별 메모가 있으면 선택">전체 의견</Label>
              <TextArea id={ids.comment} value={comment} maxLength={2000} placeholder="예: 결재선 단계를 3단계까지 받도록 기능과 테이블을 고칠 것"
                onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>취소</Button>
              <Button size="sm" variant="primary" disabled={sending || !canSend} onClick={() => void send('changes')}
                title={canSend ? undefined : '돌려보낼 단계(또는 항목)와 의견·메모를 적으세요'}>돌려보내기</Button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        {(record.approvals?.length ?? 0) > 1 && (
          <details className="text-small">
            <summary className="cursor-pointer text-fg-3">결정 기록 {record.approvals!.length}건</summary>
            <ol className="mt-2 space-y-1">
              {[...record.approvals!].reverse().map((a, i) => (
                <li key={i} className="text-fg-2">
                  {formatDate(a.at)} · {a.by.name} · {decisionText(a)}
                  {a.comment && <span className="text-fg-3"> — {a.comment}</span>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </Card>
  )
}

/** 지난 수정 지시의 처리 결과: 팀장이 이 새 최종본을 승인하기 전에 무엇이 어떻게 반영됐는지 본다 */
function PreviousDirective({ record }: { record: VersionRecord }) {
  const a = record.approval!
  const resolutions = (a as Approval & { resolutions?: Record<string, { choice: string; note: string; by: { name: string } }> }).resolutions ?? {}
  const items = a.items ?? []
  const applied = items.filter((i) => resolutions[`${i.stage}:${i.target_id}`]?.choice === 'applied').length
  return (
    <Card aria-labelledby="prev-directive">
      <CardHeader eyebrow="Previous" title={`지난 수정 지시 처리 결과 (최종본 v${record.design_version})`} titleId="prev-directive">
        <p className="mt-1 text-small text-fg-3">
          {a.by.name} · {formatDate(a.at)}{a.comment && ` — ${a.comment}`}
          {items.length > 0 && ` · 항목 ${items.length}건 중 반영 ${applied}건`}
        </p>
      </CardHeader>
      {items.length > 0 && (
        <ul className="space-y-1.5 px-5 pb-5 text-small">
          {items.map((i) => {
            const r = resolutions[`${i.stage}:${i.target_id}`]
            return (
              <li key={`${i.stage}:${i.target_id}`} className="flex flex-wrap items-baseline gap-1.5">
                <Badge tone={!r ? 'danger' : r.choice === 'applied' ? 'ok' : 'neutral'}>{!r ? '처리 안 됨' : r.choice === 'applied' ? '반영함' : '그대로 둠'}</Badge>
                <span className="text-fg-3">{STAGE_NAME[i.stage]}</span>
                <span className="font-mono text-micro">{i.target_id}</span> {i.label}
                <span className="text-fg-2">— 지시: {i.note || '—'}</span>
                {r && <span className="text-fg-3">· {r.by.name}{r.note ? `: ${r.note}` : ''}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** 수정 지시에서 고칠 기능·테이블 고르기 (검색해서 체크) */
function ItemPicker({ title, stage, options, items, onToggle }: {
  title: string; stage: 'spec' | 'erd'; options: { id: string; label: string }[]
  items: Record<string, ChangeItem>; onToggle: (item: Omit<ChangeItem, 'note'>, on: boolean) => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = options.filter((o) => !query || o.id.toLowerCase().includes(query) || o.label.toLowerCase().includes(query)).slice(0, 50)
  return (
    <div className="rounded-md border border-line bg-card px-2.5 py-2">
      <p className="mb-1.5 text-small font-medium">{title} <span className="font-normal text-fg-3">{options.length}개</span></p>
      <TextInput dense type="search" aria-label={`${title} 검색`} placeholder="이름·ID 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-1.5 max-h-40 overflow-y-auto">
        {shown.map((o) => (
          <li key={o.id}>
            <Checkbox checked={Boolean(items[`${stage}:${o.id}`])} onChange={(v) => onToggle({ stage, target_id: o.id, label: o.label }, v)}
              label={<span className="text-small"><span className="font-mono text-micro text-fg-3">{o.id}</span> {o.label}</span>} />
          </li>
        ))}
        {shown.length === 0 && <li className="py-1 text-small text-fg-3">없음</li>}
      </ul>
    </div>
  )
}

/** 팀장 최종 승인 표시 (최종 확정보다 한 단계 위: 개발에 넘겨도 되는 산출물) */
export function ApprovedBadge({ at, by }: { at: string; by: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-ok px-3 py-1.5 text-label font-semibold text-on-primary">
      <SealCheck size={18} weight="fill" aria-hidden="true" />
      최종 승인됨 <span className="font-normal tabular-nums">{by} · {formatDate(at)}</span>
    </span>
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

const RESOLUTION_TONE = (i: Issue) => (!i.resolution ? 'warn' : i.status === 'UNRESOLVED' ? 'warn' : 'ok') as 'warn' | 'ok'

/**
 * 의미 검토 지적과 처리: ERD를 만들 때 의미 검토 Agent가 낸 지적(데이터 모델 Agent가 한 번 고친 뒤 남은 것)과
 * 사람이 ERD 화면에서 정한 처리(반영함·문제 아님·미해결로 둠). 보기만 한다.
 */
function RemarksCard({ remarks, isFinal, onOpen, entities }: { remarks: Issue[]; isFinal: boolean; onOpen: (id: string) => void; entities: Set<string> }) {
  return (
    <Card aria-labelledby="final-semantic">
      <CardHeader eyebrow="Semantic review" title="의미 검토 지적과 처리" titleId="final-semantic">
        <p className="mt-1 text-small text-fg-3">
          ERD를 만들 때 의미 검토 Agent가 ERD를 기능 명세와 대조해 낸 지적입니다. 데이터 지적은 데이터 모델 Agent가 한 번 고쳤고,
          남은 지적은 ERD 화면에서 사람이 처리를 정했습니다{isFinal ? '' : ' (최종 확정 전이라 처리가 아직 남지 않았습니다)'}.
        </p>
      </CardHeader>
      <div className="px-5 pb-5">
        {remarks.length === 0
          ? <p className="flex items-center gap-2 text-small text-ok"><SealCheck size={16} weight="fill" aria-hidden="true" />남은 지적 없음</p>
          : (
            <ul className="space-y-2">
              {remarks.map((i) => {
                const [what, ...rest] = i.message.split('\n')
                const target = i.target_id.split(/\s*,\s*/).find((t) => entities.has(t))
                return (
                  <li key={i.issue_id} className="rounded-lg border border-line px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex flex-wrap items-center gap-1.5 text-small">
                        <Badge tone="neutral">{issueKindLabel(i.kind)}</Badge>
                        {target
                          ? <button type="button" onClick={() => onOpen(target)} className="font-mono text-micro text-fg-3 underline underline-offset-4 hover:text-fg">{i.target_id}</button>
                          : <span className="font-mono text-micro text-fg-3">{i.target_id}</span>}
                      </p>
                      <Badge tone={RESOLUTION_TONE(i)}>{i.resolution || (i.status === 'RESOLVED' ? '해결됨' : '처리 전')}</Badge>
                    </div>
                    <p className="mt-1 text-label">{what}</p>
                    {rest.map((line, n) => <p key={n} className="mt-0.5 text-small text-fg-3">{line}</p>)}
                  </li>
                )
              })}
            </ul>
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

/** 개발 스펙 파일: 최종본('ERD 최종 확정')에 생기는 개발 AI용 문서 10개를 읽는 순서대로. 문서마다 보기(개발 스펙 탭)·받기 */
function DevSpecFilesCard({ design, project, version, onOpen, canDecide, chosen, onChosen }: {
  design: Design
  project: string
  version: string
  onOpen: (name: string) => void
  canDecide: boolean
  /** 팀장이 이 최종본에서 기술 스택을 골랐는지 (버전 기록 tech_stack) */
  chosen: boolean
  onChosen: () => void
}) {
  const meta = design.meta.dev_spec
  return (
    <Card aria-labelledby="final-dev-spec">
      <CardHeader eyebrow="Dev spec" title="개발 스펙 파일" titleId="final-dev-spec">
        <p className="mt-1 text-small text-fg-3">
          {meta
            ? `개발 AI(Claude Code 등)가 읽고 개발할 문서 10개입니다. 위 설계 산출물로 코드가 같은 틀(${meta.format})로 만들고, 1번부터 읽습니다.`
            : "이 버전에는 개발 스펙이 없습니다. ERD 화면에서 'ERD 최종 확정'으로 만든 최종본에 생깁니다 (예전에 만든 최종본은 다시 최종 확정하면 새 최종본에 생깁니다)."}
        </p>
      </CardHeader>
      {/* 최종 산출물 화면에서 유일하게 고칠 수 있는 것: 개발에 쓸 기술 스택 (LLM 없이 개발 스펙 10개를 다시 쓴다) */}
      {meta && <StackPicker project={project} version={version} stack={meta.stack} basis={meta.stack_basis} canDecide={canDecide}
        chosen={chosen} fromAnswer={meta.stack_from_answer ?? meta.stack_basis === '확정'} onChosen={onChosen} />}
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

/**
 * 개발 스펙의 기술 스택: 원문에 없으면 고르거나 직접 적어 확정한다. 확정하면 백엔드가 LLM 없이 개발 스펙 10개를 다시 쓰고
 * design.json(TQ-001 답)·버전 기록(tech_stack)에 남긴다. 원문이 정한 스택은 바꾸지 않는다.
 */
function StackPicker({ project, version, stack, basis, canDecide, chosen, fromAnswer, onChosen }: {
  project: string; version: string; stack: string; basis: string; canDecide: boolean
  /** 팀장이 이 화면에서 골랐는지: 이것만 '확정'이다 (기능 명세의 TQ-001 답은 먼저 넣어 둔 값) */
  chosen: boolean
  /** 지금 값이 기능 명세에서 답한 값인지 (아니면 추천안) */
  fromAnswer: boolean
  /** 고른 뒤 버전 기록(tech_stack)을 다시 읽는다 */
  onChosen: () => void
}) {
  const ids = { group: useId(), custom: useId() }
  const [choices, setChoices] = useState<{ stack: string; note: string }[] | null>(null)
  const [editing, setEditing] = useState(!chosen)
  const [picked, setPicked] = useState(stack)
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (basis !== '원문') getTechStacks().then(setChoices).catch(() => setChoices([])) }, [basis])
  useEffect(() => { setEditing(!chosen); setPicked(stack) }, [stack, chosen])
  // 직접 적어 확정한 스택은 '직접 입력' 칸에 채워 둔다
  useEffect(() => { if (choices && !choices.some((c) => c.stack === stack)) setCustom(stack) }, [choices, stack])

  if (!canDecide) {   // 기술 스택은 팀장이 정한다
    return <p className="mx-5 mb-3 rounded-md bg-sunken px-3 py-2 text-small">기술 스택: <strong>{stack}</strong> ({basis === '원문' ? '원문에 정해짐'
      : chosen ? '확정 — 팀장이 고름' : `팀장 선택 전 — 지금은 ${fromAnswer ? '기능 명세에서 고른 값' : '추천안'}`})</p>
  }
  if (basis === '원문') {
    return <p className="mx-5 mb-3 rounded-md bg-sunken px-3 py-2 text-small">기술 스택: <strong>{stack}</strong> (원문에 정해짐)</p>
  }
  const isCustom = picked === '' || !(choices ?? []).some((c) => c.stack === picked)
  const value = (isCustom ? custom : picked).trim()
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await setTechStack(project, version, value)
      refreshVersion(project, version)   // 개발 스펙 문서·design.json을 다시 읽는다
      onChosen()                         // 버전 기록의 tech_stack → '확정'으로 보인다
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  if (!editing) {
    return (
      <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-ok-soft px-3 py-2 text-small">
        <SealCheck size={16} className="text-ok" aria-hidden="true" />
        <span className="min-w-0 flex-1">기술 스택: <strong>{stack}</strong> (확정 — 개발 스펙 문서에 이 값이 들어 있습니다)</span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>바꾸기</Button>
      </div>
    )
  }
  return (
    <fieldset aria-labelledby={ids.group} className="mx-5 mb-3 space-y-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-3 text-small">
      <legend id={ids.group} className="sr-only">기술 스택 정하기</legend>
      <p className="text-warn">
        {chosen ? '개발에 쓸 기술 스택을 다시 고르세요 (LLM 사용 없음).'
          : fromAnswer ? <>기능 명세에서 고른 값(<strong>{stack}</strong>)을 먼저 넣어 두었습니다. 아직 확정이 아닙니다 — 개발에 쓸 스택을 골라 '이 스택으로 확정'을 누르세요 (LLM 사용 없음).</>
          : <>원문에 개발 언어·프레임워크가 없어 추천안(<strong>{stack}</strong>)을 가정으로 썼습니다. 개발에 쓸 스택을 골라 확정하세요 (LLM 사용 없음).</>}
      </p>
      {choices === null ? <Loading label="선택지를 불러오는 중" lines={2} /> : (
        <div className="space-y-1.5">
          {choices.map((c, i) => (
            <label key={c.stack} className="flex cursor-pointer items-start gap-2 rounded-md bg-card px-2.5 py-1.5">
              <input type="radio" name={ids.group} className="mt-1" checked={picked === c.stack} onChange={() => setPicked(c.stack)} />
              <span><strong>{c.stack}</strong>{i === 0 && <Badge tone="info" className="ml-1.5">추천</Badge>}<span className="block text-micro text-fg-3">{c.note}</span></span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-card px-2.5 py-1.5">
            <input type="radio" name={ids.group} checked={isCustom} onChange={() => setPicked('')} />
            <span className="shrink-0">직접 입력</span>
            <TextInput id={ids.custom} dense value={custom} maxLength={200} placeholder="예: Go 1.23 · Gin · PostgreSQL 16"
              aria-label="기술 스택 직접 입력" onFocus={() => setPicked('')} onChange={(e) => setCustom(e.target.value)} />
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {chosen && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>취소</Button>}
        <Button size="sm" variant="primary" icon={<SealCheck />} disabled={!value || saving || (chosen && value === stack)} onClick={() => void save()}>
          {saving ? '문서 다시 쓰는 중…' : '이 스택으로 확정'}
        </Button>
      </div>
    </fieldset>
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
