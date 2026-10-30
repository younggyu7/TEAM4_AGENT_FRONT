import { ArrowRight, FileText, TreeStructure, UploadSimple } from '@phosphor-icons/react'
import { useId, useMemo, useState } from 'react'
import { formatDate } from '../../labels'
import type { Project } from '../../types'
import { HomeInsights } from '../components/Insights'
import { PageHeader, SchemaArt } from '../components/PageHeader'
import { Shell, type ShellBase } from '../components/Shell'
import { JobPanel } from '../components/JobPanel'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, ErrorNote, fmt, Label, Loading, TextInput, type Tone } from '../components/ui'
import { draftSummaries } from '../lib/draft'
import { startUpload, useJob } from '../lib/jobs'

export function Home({ shell }: { shell: ShellBase }) {
  const { user, projects, navigate, onReloadProjects: onReload } = shell
  const list = projects.state === 'ready' ? projects.data : []
  const drafts = useMemo(() => draftSummaries(), [])
  const latest = list[0]

  const status = (p: Project): { tone: Tone; label: string } => {
    const d = drafts.find((x) => x.project === p.id && x.version === p.versions[0].design_version)
    if (d?.finalized) return { tone: 'ok', label: '확정' }
    if (d?.edited) return { tone: 'info', label: `편집 중 · ${d.edited}건` }
    return { tone: 'neutral', label: '새 초안' }
  }

  // 최신 버전 생성일로 묶는다 (이미지의 날짜별 묶음과 같은 구성)
  const groups = useMemo(() => {
    const m = new Map<string, Project[]>()
    for (const p of list) {
      const day = p.versions[0].created_at?.slice(0, 10) ?? '날짜 없음'
      m.set(day, [...(m.get(day) ?? []), p])
    }
    return [...m.entries()]
  }, [list])

  return (
    <Shell
      {...shell}
      header={<PageHeader trail={[user.name, '홈']} meta={latest?.versions[0].created_at && <>최근 생성 {formatDate(latest.versions[0].created_at)}</>} />}
      insights={projects.state === 'ready' ? <HomeInsights projects={list} /> : <Card><Loading label="요약을 불러오는 중" lines={6} /></Card>}
    >
        <div className="space-y-4">
          {/* 검은 구획: 지금 할 일 */}
          <section className="relative overflow-hidden rounded-lg bg-hero px-6 py-7 text-on-hero sm:px-8">
            <SchemaArt className="pointer-events-none absolute -right-8 -bottom-10 hidden w-[360px] text-on-hero opacity-30 md:block" />
            <p className="eyebrow !text-hero-muted">Welcome back</p>
            <h1 className="relative mt-3 max-w-lg text-title font-normal text-balance sm:text-headline">
              {user.name}님, 검토할 초안이 {list.length}건 있습니다.
            </h1>
            <p className="relative mt-3 max-w-md text-label text-hero-muted">
              기능 명세서와 ERD 초안을 고치고, 애매한 항목을 결정해 최종 확정하세요.
            </p>
            {latest && (
              <div className="relative mt-6 flex flex-wrap gap-2">
                <Button
                  className="!border-transparent !bg-on-hero !text-hero hover:!opacity-85"
                  icon={<ArrowRight />}
                  onClick={() => navigate({ name: 'workspace', project: latest.id, version: latest.versions[0].design_version, page: 'spec' })}
                >
                  {latest.name} 이어서 검토
                </Button>
              </div>
            )}
          </section>

          <Card aria-labelledby="recent-drafts">
            <CardHeader eyebrow="Drafts" title="최근 초안" titleId="recent-drafts" actions={<Button size="sm" variant="ghost" onClick={onReload}>새로고침</Button>} />
            {projects.state === 'loading' && <Loading label="초안 목록을 불러오는 중" lines={5} />}
            {projects.state === 'error' && (
              <ErrorNote message={`초안 목록을 불러오지 못했습니다. (${projects.message})`} hint="백엔드 서버(TEAM4_AGENT/backend에서 uvicorn app.main:app)가 떠 있는지 확인하세요." onRetry={onReload} />
            )}
            {projects.state === 'ready' && list.length === 0 && (
              <Empty title="아직 초안이 없습니다">아래 '새 문서 분석'에서 고객 요구사항 원본을 올리면 여기에 나타납니다.</Empty>
            )}
            <div className="px-5 pb-5">
              {groups.map(([day, items]) => (
                <section key={day} aria-label={day} className="mt-2 first:mt-0">
                  <h3 className="py-2 text-small text-fg-3 tabular-nums">{day === '날짜 없음' ? day : formatDay(day)}</h3>
                  <ul className="space-y-2">
                    {items.map((p) => {
                      const v = p.versions[0]
                      const s = status(p)
                      return (
                        <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-line px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                          <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-md bg-sunken text-fg-2">
                            <FileText size={20} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-body font-medium">{p.name}</p>
                            <p className="truncate text-small text-fg-3">{v.document ?? p.id} · v{v.design_version} · {formatDate(v.created_at)}</p>
                          </div>
                          <div className="col-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-auto">
                            <Badge tone={s.tone}>{s.label}</Badge>
                            {v.db_validation && <Badge tone={v.db_validation === 'PASSED' ? 'ok' : 'danger'}>DB {v.db_validation === 'PASSED' ? '통과' : '실패'}</Badge>}
                          </div>
                          <div className="col-span-2 flex gap-1.5 sm:col-span-1">
                            <Button size="sm" icon={<FileText />} onClick={() => navigate({ name: 'workspace', project: p.id, version: v.design_version, page: 'spec' })}>
                              기능 명세<span className="sr-only"> — {p.name}</span>
                            </Button>
                            <Button size="sm" icon={<TreeStructure />} onClick={() => navigate({ name: 'workspace', project: p.id, version: v.design_version, page: 'erd' })}>
                              ERD<span className="sr-only"> — {p.name}</span>
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </Card>

          <NewRunCard onFinished={onReload} onOpen={(project, version) => navigate({ name: 'workspace', project, version, page: 'spec' })} />
        </div>
    </Shell>
  )
}

const ACCEPT = '.pdf,.docx,.hwpx,.txt,.md'

/** 원본 요구서 올리기 → 백엔드가 전체 실행(확인 질문은 추천안으로 가정) → 끝나면 기능 명세 첫 버전을 연다 */
function NewRunCard({ onFinished, onOpen }: { onFinished: () => void; onOpen: (project: string, version: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [project, setProject] = useState('')
  const [title, setTitle] = useState('')
  const [validateDb, setValidateDb] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [jobProject, setJobProject] = useState('')
  const job = useJob(jobProject)
  const running = submitting || job?.status === 'running'
  const inputId = useId()

  const pick = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setError('')
  }
  const submit = async () => {
    if (!file) return
    setSubmitting(true)
    setError('')
    try {
      const started = await startUpload(file, { project, title, validateDb }, (done) => {
        if (done.status === 'done') onFinished()
      })
      setJobProject(started.project)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card aria-labelledby="new-run">
      <CardHeader eyebrow="New" title="새 문서 분석" titleId="new-run">
        <p className="mt-1 text-label text-fg-3">고객 요구사항 원본(PDF·DOCX·HWPX·TXT)을 올리면 요구사항과 기능 명세 초안을 만듭니다. 확인 질문은 추천안으로 가정하고, 끝난 뒤 화면에서 확인·수정하고 '내보내기 → ERD 만들기'로 ERD·DDL을 만듭니다.</p>
      </CardHeader>
      <div className="space-y-4 px-5 pb-5">
        {job && <JobPanel job={job} project={jobProject} onOpen={(v) => onOpen(jobProject, v)} />}
        <label
          htmlFor={inputId}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
          className={cx('flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center',
            dragging ? 'border-control bg-sunken' : 'border-line-strong hover:bg-sunken')}
        >
          <UploadSimple size={24} aria-hidden="true" className="text-fg-2" />
          {file
            ? <span className="text-body font-medium">{file.name} <span className="text-small font-normal text-fg-3">({fmt(Math.ceil(file.size / 1024))}KB)</span></span>
            : <span className="text-body font-medium">문서를 끌어다 놓거나 눌러서 고르세요</span>}
          <span className="text-small text-fg-3">PDF · DOCX · HWPX · TXT, 최대 50MB (HWP는 HWPX나 PDF로 저장해서 올리세요)</span>
          <input id={inputId} type="file" accept={ACCEPT} className="sr-only" disabled={running}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${inputId}-project`} hint="비우면 파일 이름">프로젝트 이름</Label>
            <TextInput id={`${inputId}-project`} value={project} disabled={running} placeholder={file ? file.name.replace(/\.[^.]+$/, '') : '예: 고객요구사항4'}
              onChange={(e) => setProject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${inputId}-title`} hint="선택">사업 이름</Label>
            <TextInput id={`${inputId}-title`} value={title} disabled={running} placeholder="예: KISA 데이터 금고 지원 포털 구축"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox checked={validateDb} onChange={setValidateDb} disabled={running} label="만든 DDL을 검증용 DB에 적용해 보기" />
          <Button variant="primary" icon={<UploadSimple />} disabled={!file || running} onClick={submit}>
            {submitting ? '올리는 중' : job?.status === 'running' ? '분석 중' : '올리고 분석 시작'}
          </Button>
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
      </div>
    </Card>
  )
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}
