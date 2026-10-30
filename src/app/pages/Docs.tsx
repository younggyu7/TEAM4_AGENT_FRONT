import { CheckCircle, Check, Copy, MagnifyingGlass, WarningOctagon, XCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AGENT, ISSUE_STATUS, PRIORITY, QUESTION_KIND, QUESTION_STATUS, REQ_SCOPE, REQ_STATUS, REQ_TYPE, SEMANTIC_KIND, SEVERITY,
  issueKindLabel, label,
} from '../../labels'
import type { Design, Issue, Question, Requirement, VersionRecord } from '../../types'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, ErrorNote, fmt, Loading, Segmented, TextInput, type Tone } from '../components/ui'
import { useFile } from '../lib/data'
import { buildIdPages, buildLinks, type Links } from '../lib/links'
import { DOC_PAGES, type DocPage, type Page } from '../lib/route'
import { relationsOf } from '../lib/erd'
import { FullErd } from './Erd'
import { ZipButton } from '../components/ZipButton'
import { DevSpecView } from './DevSpec'
import { FinalBadge } from './Final'
import { FinalDdlReview } from './FinalDdl'
import { scrollToId } from './Spec'

// 예전 viewer.html의 읽기 전용 탭을 작업실 안으로 옮긴 것. 질문 답처럼 작업실에서 바꾼 내용은 반영된 design으로 보여준다.

interface DocsProps {
  page: DocPage
  design: Design           // 화면에서 고친 내용(질문 답 등)을 반영한 설계
  saved: Design            // 이 버전에 저장된 설계 (최종 DDL은 저장된 것 기준)
  versions: VersionRecord[]
  finalizedAt?: string     // 이 계보의 최종 산출물을 확정한 시각 (제목 옆에 표시)
  project: string
  version: string
  versionRecord?: VersionRecord
  focus?: string
  onOpen: (page: Page, focus?: string) => void
}

interface Ctx {
  design: Design
  links: Links
  focus?: string
  idLink: (id: string) => ReactNode
  onOpen: (page: Page, focus?: string) => void
}

export function DocsView({ page, design, saved, versions, finalizedAt, project, version, versionRecord, focus, onOpen }: DocsProps) {
  const links = useMemo(() => buildLinks(design), [design])
  const idPages = useMemo(() => buildIdPages(design), [design])
  const idLink = (id: string) => {
    const target = idPages.get(id)
    if (!target) return <span key={id} className="font-mono text-micro text-fg-3">{id}</span>
    return (
      <button
        key={id}
        type="button"
        onClick={() => onOpen(target, id)}
        className="font-mono text-micro text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-fg"
      >
        {id}
      </button>
    )
  }
  const ctx: Ctx = { design, links, focus, idLink, onOpen }

  return (
    <Card aria-labelledby="docs-title" className="flex flex-col">
      <CardHeader
        level={1}
        eyebrow={`Artifacts · v${version}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {DOC_PAGES.find((p) => p.id === page)!.label}
            {finalizedAt && <FinalBadge at={finalizedAt} large />}
            {/* 최종 확정했으면 바로 받을 수 있게 강조, 확정 전에도 받을 수는 있다 */}
            <ZipButton project={project} version={version} variant={finalizedAt ? 'primary' : 'secondary'} />
          </span>
        }
        titleId="docs-title"
      />
      {/* 산출물 안의 탭: 왼쪽 메뉴는 그대로 두고 여기서만 바꾼다 */}
      <nav aria-label="산출물 종류" className="overflow-x-auto border-b border-line px-5">
        <ul className="flex gap-1">
          {DOC_PAGES.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                aria-current={p.id === page ? 'page' : undefined}
                onClick={() => onOpen(p.id)}
                className={cx(
                  '-mb-px min-h-10 border-b-2 px-3 text-label whitespace-nowrap transition-colors duration-150',
                  p.id === page ? 'border-fg font-semibold text-fg' : 'border-transparent text-fg-3 hover:text-fg',
                )}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="px-5 py-4">
        {page === 'overview' && <Overview ctx={ctx} versionRecord={versionRecord} />}
        {page === 'requirements' && <Requirements ctx={ctx} />}
        {page === 'questions' && <Questions ctx={ctx} />}
        {page === 'final-erd' && (
          <div className="space-y-4">
            {saved.data_model.entities.length === 0
              ? <Empty title={`v${version}에는 ERD가 없습니다`}>ERD 단계에서 만든 버전(v{version}.1 …)을 열어 보세요.</Empty>
              : <FullErd entities={saved.data_model.entities} functions={saved.functions} onPick={(id) => onOpen('erd', id)} />}
            {/* 테이블별 변경·설계 표준은 필요할 때만 펼친다 */}
            <details className="rounded-lg border border-line">
              <summary className="flex min-h-11 items-center px-4 text-label font-medium">테이블별 변경·설계 표준 검토 (DDL 포함)</summary>
              <div className="border-t border-line p-4">
                <FinalDdlReview design={saved} project={project} version={version} versions={versions} />
              </div>
            </details>
          </div>
        )}
        {page === 'ddl' && <Ddl project={project} version={version} />}
        {page === 'dev-spec' && <DevSpecView design={saved} project={project} version={version} focus={focus} onOpen={onOpen} />}
        {page === 'trace' && <Trace ctx={ctx} />}
        {page === 'issues' && <Issues ctx={ctx} />}
        {page === 'decisions' && <Decisions ctx={ctx} />}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------ 공통 조각 */
function Toolbar({ children, summary }: { children: ReactNode; summary?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {summary && <span className="ml-auto text-small text-fg-3 tabular-nums" aria-live="polite">{summary}</span>}
    </div>
  )
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
      <TextInput dense type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="pl-9" />
    </div>
  )
}

const has = (q: string, ...texts: (string | undefined)[]) => {
  const k = q.trim().toLowerCase()
  return !k || texts.some((t) => t?.toLowerCase().includes(k))
}

function IdList({ ids, ctx, empty = '없음' }: { ids: string[]; ctx: Ctx; empty?: string }) {
  if (ids.length === 0) return <span className="text-fg-3">{empty}</span>
  return <span className="inline-flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => ctx.idLink(id))}</span>
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 text-small sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-fg-3">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** 펼쳐지는 목록 항목. 다른 화면에서 이 ID로 왔으면 펼치고 화면에 보이게 한다. */
function Item({ id, focus, head, children, defaultOpen = false }: {
  id: string
  focus?: string
  head: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const focused = focus === id
  const [open, setOpen] = useState(defaultOpen)
  const expanded = open || focused
  useEffect(() => { if (focused) scrollToId(`doc-${id}`) }, [focused, id])
  return (
    <li id={`doc-${id}`} className={cx('scroll-mt-20 rounded-lg border', focused ? 'border-fg' : 'border-line')}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-150 hover:bg-sunken"
      >
        {head}
      </button>
      {expanded && <div className="space-y-3 border-t border-line px-3 py-3">{children}</div>}
    </li>
  )
}

function ItemHead({ id, title, badges }: { id: string; title: ReactNode; badges: ReactNode }) {
  return (
    <>
      <span className="min-w-0">
        <span className="block font-mono text-micro text-fg-3">{id}</span>
        <span className="block text-body font-medium">{title}</span>
      </span>
      <span className="flex flex-wrap justify-end gap-1">{badges}</span>
    </>
  )
}

/* ------------------------------------------------------------ 개요 */
function Overview({ ctx, versionRecord }: { ctx: Ctx; versionRecord?: VersionRecord }) {
  const { design, onOpen } = ctx
  const { requirements: reqs, functions, data_model: model, questions, issues, completion } = design
  const system = reqs.filter((r) => r.scope === 'SYSTEM')
  const open = issues.filter((i) => i.status !== 'RESOLVED')
  const remarks = Object.entries(SEMANTIC_KIND)
    .map(([kind, [name, owner]]) => ({ kind, name, owner, count: open.filter((i) => i.kind === kind).length }))
    .filter((r) => r.count > 0)
  const unresolvedErrors = open.filter((i) => !i.kind.startsWith('SEM_') && i.severity === 'ERROR').length

  const tiles: { label: string; value: number; note: string; page: Page }[] = [
    { label: '요구사항', value: reqs.length, note: `기능 ${system.filter((r) => r.type === 'FUNCTIONAL').length} · 비기능 ${system.filter((r) => r.type === 'NON_FUNCTIONAL').length} · 수행 의무 ${reqs.length - system.length}`, page: 'requirements' },
    { label: '기능', value: functions.length, note: `그룹 ${new Set(functions.map((f) => f.group)).size}개`, page: 'spec' },
    // 새 형식 data_model.json은 relations가 비어 있을 수 있어 컬럼의 FK 참조로 센다 (ERD 화면과 같은 기준)
    { label: '테이블', value: model.entities.length, note: `관계 ${relationsOf(model.entities).length}`, page: 'erd' },
    { label: '확인 질문', value: questions.length, note: `답변 ${questions.filter((q) => q.status === 'ANSWERED').length}`, page: 'questions' },
  ]

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <button type="button" onClick={() => onOpen(t.page)} className="w-full rounded-lg border border-line px-3 py-3 text-left transition-colors duration-150 hover:border-control hover:bg-sunken">
              <span className="block text-small text-fg-3">{t.label}</span>
              <span className="block text-title font-medium tabular-nums">{fmt(t.value)}</span>
              <span className="block text-micro text-fg-3">{t.note}</span>
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="ov-db">
        <h2 id="ov-db" className="eyebrow mb-2">DB validation · DB 검증</h2>
        {!versionRecord?.db_validation ? (
          <p className="text-small text-fg-3">이 버전은 DB 검증을 하지 않았습니다. CLI에서 --validate-db로 실행하면 결과가 생깁니다.</p>
        ) : (
          <div className="rounded-lg border border-line px-4 py-3">
            <p className={cx('flex items-center gap-1.5 text-subtitle font-medium', versionRecord.db_validation === 'PASSED' ? 'text-ok' : 'text-danger')}>
              {versionRecord.db_validation === 'PASSED' ? <CheckCircle weight="fill" aria-hidden="true" /> : <XCircle weight="fill" aria-hidden="true" />}
              {versionRecord.db_validation === 'PASSED' ? '통과' : '실패'}
            </p>
            <p className="mt-1 text-small text-fg-3">
              {versionRecord.db_engine === 'sqlite'
                ? 'SQLite로 대체 검증 (PostgreSQL에 접속하지 못함). PostgreSQL 전용 문법은 확인되지 않았습니다.'
                : `${versionRecord.db_engine ?? ''}에서 DDL을 실행해 확인했습니다.`}
            </p>
            {versionRecord.db_errors && versionRecord.db_errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-small text-danger">{versionRecord.db_errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="ov-todo">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="ov-todo" className="eyebrow">To check · 담당자가 확인할 것</h2>
          <Button size="sm" variant="ghost" onClick={() => onOpen('issues')}>이슈 전체 보기</Button>
        </div>
        {unresolvedErrors === 0 && remarks.length === 0 ? <p className="text-small text-fg-3">확인할 지적이 없습니다.</p> : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {unresolvedErrors > 0 && (
              <li className="grid grid-cols-[minmax(0,10rem)_4rem_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-small">
                <Badge tone="danger">해결 못 한 오류</Badge><span className="font-medium tabular-nums">{unresolvedErrors}건</span><span className="text-fg-3">Agent가 수정 한도 안에 고치지 못함</span>
              </li>
            )}
            {remarks.map((r) => (
              <li key={r.kind} className="grid grid-cols-[minmax(0,10rem)_4rem_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-small">
                <Badge tone="info">{r.name}</Badge><span className="font-medium tabular-nums">{r.count}건</span><span className="text-fg-3">{r.owner}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ov-checks">
        <h2 id="ov-checks" className="eyebrow mb-2">Completion · 완료 조건</h2>
        <ul className="space-y-1.5">
          {completion.checks.map((c) => (
            <li key={c.name} className="grid grid-cols-[1.25rem_minmax(0,10rem)_minmax(0,1fr)] items-start gap-2 text-small">
              {c.passed
                ? <CheckCircle size={16} weight="fill" className="mt-0.5 text-ok" aria-label="충족" />
                : <XCircle size={16} weight="fill" className="mt-0.5 text-danger" aria-label="미충족" />}
              <span className={c.passed ? 'font-medium' : 'font-medium text-danger'}>{c.name}</span>
              <span className="text-fg-3">{c.detail}</span>
            </li>
          ))}
        </ul>
        {completion.forced && <p className="mt-2 text-small text-warn">단계 한도에 닿아 남은 이슈를 둔 채 초안으로 제공한 결과입니다.</p>}
      </section>

      {versionRecord?.summary && versionRecord.summary.length > 0 && (
        <section aria-labelledby="ov-steps">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="ov-steps" className="eyebrow">Steps · 이 버전을 만든 순서</h2>
            <Button size="sm" variant="ghost" onClick={() => onOpen('decisions')}>판단 기록 자세히</Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-small text-fg-2 marker:text-fg-3">
            {versionRecord.summary.map((s) => <li key={s}>{s.replace(/^#\d+\s*/, '')}</li>)}
          </ol>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ 요구사항 */
type ReqKind = 'ALL' | 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'PROJECT'
const kindOf = (r: Requirement): Exclude<ReqKind, 'ALL'> => (r.scope === 'PROJECT' ? 'PROJECT' : r.type)

function Requirements({ ctx }: { ctx: Ctx }) {
  const reqs = ctx.design.requirements
  const [kind, setKind] = useState<ReqKind>('ALL')
  const [status, setStatus] = useState<'ALL' | Requirement['status']>('ALL')
  const [query, setQuery] = useState('')
  // 다른 화면에서 특정 요구사항으로 왔으면 필터 때문에 안 보이는 일이 없게 푼다
  useEffect(() => { if (ctx.focus) { setKind('ALL'); setStatus('ALL'); setQuery('') } }, [ctx.focus])

  const shown = reqs.filter((r) => (kind === 'ALL' || kindOf(r) === kind) && (status === 'ALL' || r.status === status)
    && has(query, r.requirement_id, r.title, r.description, r.category, r.source_ref))
  const count = (k: ReqKind) => reqs.filter((r) => k === 'ALL' || kindOf(r) === k).length

  return (
    <>
      <Toolbar summary={`${fmt(shown.length)} / ${fmt(reqs.length)}건`}>
        <Segmented<ReqKind> label="요구사항 구분" value={kind} onChange={setKind} options={[
          { value: 'ALL', label: '전체', count: count('ALL') },
          { value: 'FUNCTIONAL', label: '기능', count: count('FUNCTIONAL') },
          { value: 'NON_FUNCTIONAL', label: '비기능', count: count('NON_FUNCTIONAL') },
          { value: 'PROJECT', label: '수행 의무', count: count('PROJECT') },
        ]} />
        <Segmented label="확정 여부" value={status} onChange={setStatus} options={[
          { value: 'ALL', label: '모두' }, { value: 'CONFIRMED', label: '확정' }, { value: 'ASSUMED', label: '가정' }, { value: 'OPEN', label: '미확정' },
        ]} />
        <Search value={query} onChange={setQuery} placeholder="ID·이름·내용 검색" />
      </Toolbar>
      {shown.length === 0 ? <Empty title="조건에 맞는 요구사항이 없습니다">필터를 바꿔 보세요.</Empty> : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const funcs = ctx.links.funcsOfReq.get(r.requirement_id) ?? []
            return (
              <Item key={r.requirement_id} id={r.requirement_id} focus={ctx.focus} head={
                <ItemHead id={r.requirement_id} title={r.title} badges={<>
                  <Badge>{label(REQ_TYPE, r.type)}</Badge>
                  {r.scope === 'PROJECT' && <Badge>{label(REQ_SCOPE, r.scope)}</Badge>}
                  {r.status !== 'CONFIRMED' && <Badge tone="warn">{label(REQ_STATUS, r.status)}</Badge>}
                </>} />
              }>
                <p className="max-w-prose text-label text-fg-2">{r.description}</p>
                {r.evidence.length > 0 && (
                  <div>
                    <h3 className="eyebrow mb-1.5">원문 근거</h3>
                    {r.evidence.map((e) => (
                      <blockquote key={e.source_block_id + e.quote} className="mb-2 max-w-prose border-l-2 border-line-strong pl-3">
                        <p className={cx('text-label', !e.verified && 'underline decoration-danger decoration-wavy underline-offset-4')}>{e.quote}</p>
                        <footer className="mt-0.5 flex items-center gap-2 text-micro text-fg-3">
                          블록 {e.source_block_id}
                          {!e.verified && <Badge tone="danger">원문에서 확인 안 됨</Badge>}
                        </footer>
                      </blockquote>
                    ))}
                  </div>
                )}
                {r.acceptance_criteria.length > 0 && (
                  <div>
                    <h3 className="eyebrow mb-1.5">검수 기준</h3>
                    <ul className="list-disc space-y-0.5 pl-5 text-label">{r.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                )}
                <dl className="space-y-1.5">
                  <Row term="원문 번호">{r.source_ref || r.source_key || '—'}</Row>
                  <Row term="우선순위">{label(PRIORITY, r.priority)}</Row>
                  <Row term={r.type === 'FUNCTIONAL' ? '구현 기능' : '적용 기능'}>
                    {r.scope === 'SYSTEM' ? <IdList ids={funcs} ctx={ctx} empty="연결된 기능 없음" /> : <span className="text-fg-3">수행 의무라 설계 대상이 아님</span>}
                  </Row>
                </dl>
              </Item>
            )
          })}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------ 확인 질문 */
function Questions({ ctx }: { ctx: Ctx }) {
  const questions = ctx.design.questions
  const [status, setStatus] = useState<'ALL' | Question['status']>('ALL')
  useEffect(() => { if (ctx.focus) setStatus('ALL') }, [ctx.focus])
  const shown = questions.filter((q) => status === 'ALL' || q.status === status)
  const count = (s: typeof status) => questions.filter((q) => s === 'ALL' || q.status === s).length

  return (
    <>
      <Toolbar summary={`${fmt(shown.length)} / ${fmt(questions.length)}건`}>
        <Segmented label="답변 상태" value={status} onChange={setStatus} options={[
          { value: 'ALL', label: '전체', count: count('ALL') },
          { value: 'PENDING', label: '답변 대기', count: count('PENDING') },
          { value: 'ANSWERED', label: '답변함', count: count('ANSWERED') },
          { value: 'DEFERRED', label: '보류', count: count('DEFERRED') },
        ]} />
      </Toolbar>
      <p className="mb-4 text-small text-fg-3">답은 기능 명세서의 '확인 필요' 탭에서 고릅니다. 여기에는 그 답이 반영되어 보입니다.</p>
      {shown.length === 0 ? <Empty title="해당하는 질문이 없습니다" /> : (
        <ul className="space-y-2">
          {shown.map((q) => (
            <Item key={q.question_id} id={q.question_id} focus={ctx.focus} defaultOpen head={
              <ItemHead id={q.question_id} title={q.question} badges={<>
                <Badge>{label(QUESTION_KIND, q.kind)}</Badge>
                {q.blocking && <Badge tone="danger">진행 막음</Badge>}
                <Badge tone={q.status === 'ANSWERED' ? 'ok' : q.status === 'PENDING' ? 'warn' : 'neutral'}>{label(QUESTION_STATUS, q.status)}</Badge>
              </>} />
            }>
              <p className="text-small text-fg-3">{q.context}</p>
              {q.options.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="선택지">
                  {q.options.map((o) => (
                    <li key={o} className={cx('rounded-sm border px-2.5 py-1 text-small', o === q.answer ? 'border-fg bg-primary text-on-primary' : 'border-line text-fg-2')}>
                      {o === q.answer && <Check size={12} weight="bold" className="mr-1 inline" aria-hidden="true" />}{o}
                      {o === q.answer && <span className="sr-only"> (선택한 답)</span>}
                    </li>
                  ))}
                </ul>
              )}
              {q.answer && !q.options.includes(q.answer) && <p className="text-label"><span className="font-medium">답변</span> {q.answer}</p>}
              <dl className="space-y-1.5">
                <Row term="관련 요구사항"><IdList ids={q.requirement_ids} ctx={ctx} /></Row>
                <Row term="원문 블록">{q.evidence_block_ids.join(', ') || '—'}</Row>
              </dl>
            </Item>
          ))}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------ DDL */
function Ddl({ project, version }: { project: string; version: string }) {
  const sql = useFile(project, version, 'schema.sql')
  const [copied, setCopied] = useState(false)
  if (sql.state === 'loading') return <Loading label="schema.sql을 불러오는 중" lines={8} />
  if (sql.state === 'error') return <ErrorNote message={sql.message} />
  if (sql.data === null) return <Empty title="이 버전에는 schema.sql 파일이 없습니다" />
  const text = sql.data
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
  return (
    <>
      <Toolbar summary={`PostgreSQL · ${fmt(text.split('\n').length)}줄`}>
        <Button icon={copied ? <Check /> : <Copy />} onClick={copy}>{copied ? '복사함' : 'DDL 복사'}</Button>
      </Toolbar>
      <p className="mb-3 text-small text-fg-3">CLI가 만든 원본 DDL입니다. ERD 화면에서 고친 내용은 여기에 반영되지 않습니다.</p>
      <pre className="relative max-h-[70vh] overflow-auto rounded-lg border border-line bg-sunken p-4 font-mono text-small leading-relaxed">
        <code>{text.split('\n').map((line, i) => (
          <span key={i} className={line.trimStart().startsWith('--') ? 'text-fg-3' : undefined}>{line}{'\n'}</span>
        ))}</code>
      </pre>
    </>
  )
}

/* ------------------------------------------------------------ 추적 */
type Column = 'req' | 'func' | 'entity'
interface TNode { column: Column; id: string; name: string; gap?: string }

/** 선택한 항목과 이어진 요구사항·기능·테이블 (기능을 거쳐 양쪽으로 따라간다) */
function connected(sel: TNode, links: Links, includeNfr: boolean): Set<string> {
  const ids = new Set([sel.id])
  const reqsOf = (f: string) => [...(links.reqsOfFunc.get(f) ?? []), ...(includeNfr ? links.nfrsOfFunc.get(f) ?? [] : [])]
  const funcs = sel.column === 'func' ? [sel.id] : sel.column === 'req' ? links.funcsOfReq.get(sel.id) ?? [] : links.funcsOfEntity.get(sel.id) ?? []
  for (const f of funcs) {
    ids.add(f)
    reqsOf(f).forEach((r) => ids.add(r))
    ;(links.entitiesOfFunc.get(f) ?? []).forEach((e) => ids.add(e))
  }
  // 요구사항을 고르면 그 기능을 쓰는 다른 요구사항까지 넓히지 않는다
  if (sel.column === 'req') for (const f of funcs) reqsOf(f).forEach((r) => r !== sel.id && ids.delete(r))
  return ids
}

function Trace({ ctx }: { ctx: Ctx }) {
  const { design, links } = ctx
  const [includeNfr, setIncludeNfr] = useState(false)
  const [gapsOnly, setGapsOnly] = useState(false)
  const [selected, setSelected] = useState<TNode | null>(null)

  const columns = useMemo<Record<Column, TNode[]>>(() => ({
    req: design.requirements.filter((r) => r.scope === 'SYSTEM' && (includeNfr || r.type === 'FUNCTIONAL')).map((r) => ({
      column: 'req', id: r.requirement_id, name: r.title,
      gap: r.type === 'FUNCTIONAL' && !links.funcsOfReq.get(r.requirement_id)?.length ? '기능 없음' : undefined,
    })),
    func: design.functions.map((f) => ({ column: 'func', id: f.function_id, name: f.name, gap: !links.entitiesOfFunc.get(f.function_id)?.length ? '테이블 없음' : undefined })),
    entity: design.data_model.entities.map((e) => ({ column: 'entity', id: e.entity_id, name: e.label, gap: !links.funcsOfEntity.get(e.entity_id)?.length ? '쓰는 기능 없음' : undefined })),
  }), [design, links, includeNfr])
  const lit = useMemo(() => (selected ? connected(selected, links, includeNfr) : null), [selected, links, includeNfr])
  const gaps = Object.values(columns).flat().filter((n) => n.gap).length
  const pageOf: Record<Column, Page> = { req: 'requirements', func: 'spec', entity: 'erd' }

  return (
    <>
      <Toolbar summary={gaps === 0 ? '연결 누락 없음' : `연결 누락 ${gaps}건`}>
        <Checkbox checked={gapsOnly} onChange={setGapsOnly} label="누락만 보기" />
        <Checkbox checked={includeNfr} onChange={(v) => { setIncludeNfr(v); setSelected(null) }} label="비기능 요구사항 포함" />
      </Toolbar>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-small text-fg-3" aria-live="polite">
        {selected ? <>
          <span><span className="font-mono text-fg">{selected.id}</span>와 이어진 항목만 밝게 표시했습니다.</span>
          <Button size="sm" variant="ghost" onClick={() => ctx.onOpen(pageOf[selected.column], selected.id)}>자세히 보기</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>선택 해제</Button>
        </> : '항목을 누르면 요구사항 → 기능 → 테이블로 이어진 것만 밝게 표시합니다.'}
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {([['req', '요구사항'], ['func', '기능'], ['entity', '테이블']] as const).map(([key, title]) => {
          const list = columns[key].filter((n) => !gapsOnly || n.gap || lit?.has(n.id))
          return (
            <section key={key} aria-label={title} className="min-w-0">
              <h2 className="mb-2 flex items-baseline justify-between border-b border-line-strong pb-1.5 text-label font-semibold">
                {title}<span className="text-small font-normal text-fg-3 tabular-nums">{columns[key].length}</span>
              </h2>
              <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
                {list.map((n) => {
                  const state = !lit ? '' : n.id === selected?.id ? 'selected' : lit.has(n.id) ? 'lit' : 'dim'
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        aria-pressed={n.id === selected?.id}
                        onClick={() => setSelected(n.id === selected?.id ? null : n)}
                        className={cx(
                          'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-md border px-2.5 py-1.5 text-left transition-[opacity,border-color,background-color] duration-150',
                          state === 'selected' ? 'border-fg bg-sunken' : state === 'lit' ? 'border-fg-3' : 'border-line hover:border-control',
                          state === 'dim' && 'opacity-35',
                        )}
                      >
                        <span className="col-start-1 truncate font-mono text-micro text-fg-3">{n.id}</span>
                        <span className="col-start-1 text-small">{n.name}</span>
                        {n.gap && <span className="col-start-2 row-span-2 row-start-1 self-center text-micro font-semibold text-danger">{n.gap}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

/* ------------------------------------------------------------ 이슈 */
const SEVERITY_TONE: Record<Issue['severity'], Tone> = { ERROR: 'danger', WARNING: 'warn', INFO: 'neutral' }

/** 의미 검토 메시지는 '문제\n근거: …\n제안: …' 형태라 나눠서 보여준다. */
function splitMessage(message: string) {
  const [summary, ...rest] = message.split('\n')
  return {
    summary,
    parts: rest.map((line) => {
      const m = /^(근거|제안):\s*(.*)$/.exec(line)
      return m ? { term: m[1], text: m[2] } : { term: '', text: line }
    }),
  }
}

function Issues({ ctx }: { ctx: Ctx }) {
  const issues = ctx.design.issues
  const [source, setSource] = useState<'ALL' | 'semantic' | 'check'>('ALL')
  const [status, setStatus] = useState<'ACTIVE' | 'RESOLVED' | 'ALL'>('ACTIVE')
  const [query, setQuery] = useState('')
  useEffect(() => { if (ctx.focus) { setSource('ALL'); setStatus('ALL'); setQuery('') } }, [ctx.focus])

  const shown = issues.filter((i) => (source === 'ALL' || (source === 'semantic') === i.kind.startsWith('SEM_'))
    && (status === 'ALL' || (status === 'RESOLVED') === (i.status === 'RESOLVED'))
    && has(query, i.issue_id, i.kind, issueKindLabel(i.kind), i.message, i.target_id))

  return (
    <>
      <Toolbar summary={`${fmt(shown.length)} / ${fmt(issues.length)}건`}>
        <Segmented label="출처" value={source} onChange={setSource} options={[
          { value: 'ALL', label: '전체' },
          { value: 'semantic', label: '의미 검토', count: issues.filter((i) => i.kind.startsWith('SEM_')).length },
          { value: 'check', label: '규칙 검사', count: issues.filter((i) => !i.kind.startsWith('SEM_')).length },
        ]} />
        <Segmented label="상태" value={status} onChange={setStatus} options={[
          { value: 'ACTIVE', label: '남은 것' }, { value: 'RESOLVED', label: '해결됨' }, { value: 'ALL', label: '모두' },
        ]} />
        <Search value={query} onChange={setQuery} placeholder="내용·대상 ID 검색" />
      </Toolbar>
      {shown.length === 0 ? <Empty title="해당하는 이슈가 없습니다" /> : (
        <ul className="space-y-2">
          {shown.map((issue) => {
            const { summary, parts } = splitMessage(issue.message)
            const owner = SEMANTIC_KIND[issue.kind]?.[1] ?? label(AGENT, issue.target_agent)
            return (
              <Item key={issue.issue_id} id={issue.issue_id} focus={ctx.focus} defaultOpen head={
                <ItemHead id={issue.issue_id} title={<span className={issue.status === 'RESOLVED' ? 'text-fg-3' : undefined}>{summary}</span>} badges={<>
                  <Badge tone={SEVERITY_TONE[issue.severity]} icon={issue.severity === 'ERROR' ? <WarningOctagon weight="bold" aria-hidden="true" /> : undefined}>{label(SEVERITY, issue.severity)}</Badge>
                  <Badge>{issueKindLabel(issue.kind)}</Badge>
                  {issue.status !== 'OPEN' && <Badge tone={issue.status === 'RESOLVED' ? 'ok' : 'danger'}>{label(ISSUE_STATUS, issue.status)}</Badge>}
                </>} />
              }>
                {parts.length > 0 && (
                  <dl className="space-y-1.5">
                    {parts.map((p, i) => <Row key={i} term={p.term || '내용'}>{p.text}</Row>)}
                  </dl>
                )}
                <p className="flex flex-wrap gap-x-5 gap-y-1 text-small text-fg-3">
                  <span>대상 <IdList ids={issue.target_id ? issue.target_id.split(/,\s*/) : []} ctx={ctx} empty="—" /></span>
                  <span>확인 담당 {owner}</span>
                  {issue.raised_by && <span>발견 {label(AGENT, issue.raised_by)}</span>}
                  {issue.attempts > 0 && <span>수정 시도 {issue.attempts}회</span>}
                </p>
              </Item>
            )
          })}
        </ul>
      )}
    </>
  )
}

/* ------------------------------------------------------------ 판단 기록 */
function Decisions({ ctx }: { ctx: Ctx }) {
  const decisions = ctx.design.decisions
  if (decisions.length === 0) return <Empty title="판단 기록이 없습니다" />
  return (
    <>
      <p className="mb-4 text-small text-fg-3">조정 Agent가 단계마다 무엇을 왜 골랐고, 실행한 결과가 어땠는지입니다.</p>
      <ol className="max-w-3xl">
        {decisions.map((d, i) => (
          <li key={d.step} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 pb-5">
            {i < decisions.length - 1 && <span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px bg-line" />}
            <span className="relative inline-flex size-8 items-center justify-center rounded-md border border-line-strong bg-card text-small font-semibold tabular-nums" aria-label={`${d.step}단계`}>{d.step}</span>
            <div className="min-w-0 pt-1">
              <h3 className="text-label font-semibold">{label(AGENT, d.action)}{d.mode && <span className="font-normal text-fg-3"> · {d.mode}</span>}</h3>
              <p className="mt-0.5 text-small text-fg-2">{d.reason}</p>
              {d.result && <p className="mt-1 text-small">{d.result}</p>}
              {d.scope.length > 0 && <p className="mt-1 text-small text-fg-3">범위 <IdList ids={d.scope} ctx={ctx} /></p>}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}
