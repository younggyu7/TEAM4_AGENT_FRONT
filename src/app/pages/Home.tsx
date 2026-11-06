import { ArrowRight, FileText, SlackLogo, TreeStructure, UploadSimple, Warning } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { getLlmOptions, listPickMembers, type LlmOptions, type PickMember, type SlackConnected } from '../../api'
import { NoticeItem, useNotices } from '../components/Notices'
import { formatDate } from '../../labels'
import type { Project } from '../../types'
import { HomeInsights } from '../components/Insights'
import { PageHeader, SchemaArt } from '../components/PageHeader'
import { Shell, type ShellBase } from '../components/Shell'
import { JobPanel } from '../components/JobPanel'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, ErrorNote, fmt, Label, Loading, TextInput, type Tone } from '../components/ui'
import { draftSummaries } from '../lib/draft'
import { startUpload, useJob } from '../lib/jobs'
import { can, hasPm, NEED_PM, NEEDS } from '../lib/session'

export function Home({ shell }: { shell: ShellBase }) {
  const { user, projects, navigate, onReloadProjects: onReload } = shell
  const list = projects.state === 'ready' ? projects.data : []
  const drafts = useMemo(() => draftSummaries(), [])
  // 검토할 초안: 최종 승인한 프로젝트는 빼고, 승인 뒤에 새 버전(다시 고친 기능 명세·ERD 등)이 생겼으면 다시 센다
  const pending = list.filter((p) => {
    const approvedAt = p.versions.filter((v) => v.stage === 'final' && v.approval?.decision === 'approve')
      .map((v) => v.approval!.at).sort().at(-1)
    const lastMade = p.versions.map((v) => v.created_at ?? '').sort().at(-1) ?? ''
    return !approvedAt || lastMade > approvedAt
  })
  const latest = pending[0]

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
      header={<PageHeader trail={[user.name, '홈']} meta={list[0]?.versions[0].created_at && <>최근 생성 {formatDate(list[0].versions[0].created_at)}</>} />}
      insights={projects.state === 'ready' ? <HomeInsights projects={list} /> : <Card><Loading label="요약을 불러오는 중" lines={6} /></Card>}
    >
        <div className="space-y-4">
          {/* 검은 구획: 지금 할 일 */}
          <section className="relative overflow-hidden rounded-lg bg-hero px-6 py-7 text-on-hero sm:px-8">
            <SchemaArt className="pointer-events-none absolute -right-8 -bottom-10 hidden w-[360px] text-on-hero opacity-30 md:block" />
            <p className="eyebrow !text-hero-muted">Welcome back</p>
            <h1 className="relative mt-3 max-w-lg text-title font-normal text-balance sm:text-headline">
              {pending.length ? `${user.name}님, 검토할 초안이 ${pending.length}건 있습니다.` : `${user.name}님, 검토할 초안이 없습니다.`}
            </h1>
            <p className="relative mt-3 max-w-md text-label text-hero-muted">
              {pending.length ? '기능 명세서와 ERD 초안을 고치고, 애매한 항목을 결정해 최종 확정하세요.'
                : list.length ? `프로젝트 ${list.length}개 모두 최종 승인했습니다. 새 문서를 올리거나 최종 개발물을 확인하세요.` : '새 문서를 올려 시작하세요.'}
              {pending.length > 0 && list.length > pending.length && ` (최종 승인된 ${list.length - pending.length}개는 뺌)`}
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

          <NoticesCard navigate={navigate} reloadKey={projects} />

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

          <NewRunCard canUpload={can(user, 'upload')} meId={user.id} onFinished={onReload} onOpen={(project, version) => navigate({ name: 'workspace', project, version, page: 'spec' })} />
        </div>
    </Shell>
  )
}

/** 나에게 온 알림 전체 (내 역할 기준, 모든 프로젝트): 상태 알림 + 일 알림. 누르면 그 화면으로, '확인'을 누르면 사라진다 */
function NoticesCard({ navigate, reloadKey }: { navigate: ShellBase['navigate']; reloadKey: unknown }) {
  const { list, dismiss } = useNotices(reloadKey)
  return (
    <Card aria-labelledby="my-notices">
      <CardHeader eyebrow="Notices" title="나에게 온 알림" titleId="my-notices"
        actions={<span className="text-label font-medium tabular-nums">{list?.length ?? 0}건</span>} />
      {list === null ? <Loading label="알림을 불러오는 중" lines={2} /> : list.length === 0 ? (
        <p className="px-5 pb-5 text-small text-fg-3">새 알림이 없습니다.</p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto px-2 pb-2">
          {list.map((n) => <NoticeItem key={`${n.project}:${n.id}`} n={n} navigate={navigate} onDismiss={dismiss} showProject />)}
        </ul>
      )}
    </Card>
  )
}

const ACCEPT = '.pdf,.docx,.hwpx'
const UPLOAD_NOTE = 'PDF·DOCX·HWPX만 지원합니다. 스캔본·이미지(사진·그림으로 된 문서, PNG·JPG 등)는 글자를 읽지 못해 올릴 수 없습니다.'
const SELECT = cx('min-h-11 w-full rounded-md border border-control bg-card px-3 text-body text-fg',
  'hover:border-fg-3 focus-visible:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/15 disabled:opacity-45')
const EFFORT_LABEL: Record<string, string> = { low: '낮음 (빠르고 저렴)', medium: '보통', high: '높음 (정확, 토큰 많이)' }

/** 백엔드가 만들 프로젝트 채널 이름 (services/slack.py channel_name과 같은 규칙. 같은 이름이 있으면 뒤에 -2가 붙는다) */
function slackChannelName(project: string): string {
  const id = project.trim().replace(/[\s<>:"|?*]+/g, '_')   // 백엔드 프로젝트 ID (공백 → _)
  const base = id.toLowerCase().replace(/[^0-9a-z가-힣_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60)
  return `team4-${base || 'project'}`
}

/** 원본 요구서 올리기 → 백엔드가 전체 실행(확인 질문은 추천안으로 가정) → 끝나면 기능 명세 첫 버전을 연다 */
function NewRunCard({ onFinished, onOpen, canUpload, meId }: { onFinished: () => void; onOpen: (project: string, version: string) => void; canUpload: boolean; meId: number }) {
  const [file, setFile] = useState<File | null>(null)
  const [project, setProject] = useState('')
  const [title, setTitle] = useState('')
  // 이 프로젝트 전체(기능 명세 → ERD → 최종 확정)에 쓸 모델·생각 수준. 기본은 백엔드 .env 값
  const [llm, setLlm] = useState<LlmOptions | null>(null)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  useEffect(() => {
    getLlmOptions().then((o) => {
      setLlm(o)
      setModel(o.models.some((m) => m.id === o.default_model) ? o.default_model : o.models[0]?.id ?? '')
      setEffort(o.default_effort)
    }).catch(() => setLlm(null))
  }, [])
  const picked = llm?.models.find((m) => m.id === model)
  // 담당자: 고른 회원 + 올리는 사람만 이 프로젝트를 본다 (PM도 고른 PM만, PM 최소 한 명). 나중에 프로젝트 화면에서 PM이 바꾼다.
  // Slack(백엔드 .env 워크스페이스 토큰이 있을 때): 업로드하면 프로젝트 비공개 채널을 자동으로 만들고 담당자를 초대한다
  const [slackOn, setSlackOn] = useState(false)
  const [people, setPeople] = useState<PickMember[]>([])
  const [chosen, setChosen] = useState<number[]>([])
  const [slackDone, setSlackDone] = useState<SlackConnected | null>(null)
  useEffect(() => {
    listPickMembers().then((r) => {
      setSlackOn(r.slack_enabled)
      setPeople(r.members)
    }).catch(() => setPeople([]))
  }, [meId])
  const always = (m: PickMember) => m.id === meId   // 올리는 사람은 늘 담당자
  const assignees = people.filter((m) => always(m) || chosen.includes(m.id))
  // 회원 목록을 못 읽었으면(고르는 칸이 안 보임) 막지 않는다: 서버가 다시 검사해 이유를 알려 준다
  const noPm = people.length > 0 && !hasPm(assignees)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [jobProject, setJobProject] = useState('')
  const job = useJob(jobProject)
  const running = submitting || job?.status === 'running'
  const inputId = useId()

  const pick = (f: File | undefined) => {
    if (!f) return
    // 끌어다 놓은 파일은 accept가 걸러 주지 않으므로 여기서도 막는다 (스캔본·이미지로 된 문서는 서버가 올린 뒤에 막는다)
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
    if (!ACCEPT.split(',').includes(ext)) {
      setFile(null)
      setError(`${f.name}: 지원하지 않는 형식입니다. ${UPLOAD_NOTE}${ext === '.hwp' ? ' (HWP는 한글에서 HWPX나 PDF로 저장해서 올리세요)' : ''}`)
      return
    }
    setFile(f)
    setError('')
  }
  const submit = async () => {
    if (!file) return
    setSubmitting(true)
    setError('')
    setSlackDone(null)
    try {
      const started = await startUpload(file, {
        project, title, model, effort: picked?.effort === false ? '' : effort, members: assignees.map((m) => m.id),
      }, (done) => {
        if (done.status === 'done') onFinished()
      })
      setJobProject(started.job.project)
      setSlackDone(started.slack)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card aria-labelledby="new-run">
      <CardHeader eyebrow="New" title="새 문서 분석" titleId="new-run">
        <p className="mt-1 text-label text-fg-3">고객 요구사항 원본(PDF·DOCX·HWPX)을 올리면 요구사항과 기능 명세 초안을 만듭니다. 확인 질문은 추천안으로 가정하고, 끝난 뒤 화면에서 확인·수정하고 '내보내기 → ERD 만들기'로 ERD·DDL을 만듭니다.</p>
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
          <span className="text-small text-fg-3">PDF · DOCX · HWPX만, 최대 50MB (HWP는 HWPX나 PDF로 저장해서 올리세요)</span>
          <span className="flex items-center gap-1 text-small text-warn">
            <Warning size={14} aria-hidden="true" />스캔본·이미지(사진·캡처로 된 문서, PNG·JPG)는 글자를 읽지 못해 지원하지 않습니다
          </span>
          <input id={inputId} type="file" accept={ACCEPT} className="sr-only" disabled={running}
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${inputId}-project`} hint="비우면 파일 이름 · 개발한 앱의 로그인 화면·메뉴에도 보임">회사 이름</Label>
            <TextInput id={`${inputId}-project`} value={project} disabled={running} placeholder={file ? file.name.replace(/\.[^.]+$/, '') : '예: 고객요구사항4'}
              onChange={(e) => setProject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`${inputId}-title`} hint="선택">사업 이름</Label>
            <TextInput id={`${inputId}-title`} value={title} disabled={running} placeholder="예: KISA 데이터 금고 지원 포털 구축"
              onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${inputId}-model`} hint="이 프로젝트 전체에 사용">모델</Label>
            <select id={`${inputId}-model`} className={SELECT} value={model} disabled={running || !llm?.models.length}
              onChange={(e) => setModel(e.target.value)}>
              {!llm && <option value="">백엔드 설정(.env) 그대로</option>}
              {llm?.models.map((m) => <option key={m.id} value={m.id}>{m.label}{m.id === llm.default_model ? ' (기본)' : ''}</option>)}
            </select>
            {picked && <p className="mt-1 text-micro text-fg-3">{picked.note}</p>}
          </div>
          <div>
            <Label htmlFor={`${inputId}-effort`} hint="높을수록 정확하지만 토큰 많이">생각 수준 (effort)</Label>
            <select id={`${inputId}-effort`} className={SELECT} value={picked?.effort === false ? '' : effort}
              disabled={running || !llm || picked?.effort === false} onChange={(e) => setEffort(e.target.value)}>
              {picked?.effort === false && <option value="">이 모델은 생각 수준 없음</option>}
              {(llm?.efforts ?? []).map((x) => <option key={x} value={x}>{EFFORT_LABEL[x] ?? x}</option>)}
            </select>
            <p className="mt-1 text-micro text-fg-3">요구사항 검토 등 단계별로 따로 정한 값(.env의 *_EFFORT)은 그대로 씁니다.</p>
          </div>
        </div>
        {people.length > 0 && (
          <fieldset className="rounded-lg border border-line p-4">
            <legend className="px-1 text-label font-medium">
              담당자 <span className="font-normal text-fg-3">({assignees.length}명 · 담당자만 이 프로젝트를 봅니다 · PM 최소 한 명{slackOn
                ? <> · Slack 비공개 채널 <span className="font-mono">#{slackChannelName(project || file?.name.replace(/\.[^.]+$/, '') || '')}</span>을 자동으로 만들어 초대</>
                : ''})</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {people.map((m) => (
                <Checkbox key={m.id} checked={always(m) || chosen.includes(m.id)} disabled={running || always(m)}
                  onChange={(v) => setChosen((list) => v ? [...list, m.id] : list.filter((x) => x !== m.id))}
                  label={<span>{m.name} <span className="text-small text-fg-3">{m.role_label}{m.id === meId ? ' · 나 · 필수' : ''}{slackOn && !m.has_slack ? ' · Slack ID 없음' : ''}</span></span>} />
              ))}
            </div>
            <p className="mt-1 text-micro text-fg-3">
              담당자가 아닌 회원에게는 이 프로젝트가 목록·알림 어디에도 보이지 않습니다. 담당자는 나중에 프로젝트 화면에서 PM이 바꿀 수 있습니다.
              {slackOn ? ' 알림은 그 채널에 알림마다 하나씩, 받을 담당자를 @멘션해 올라갑니다 (Slack 멤버 ID가 없는 담당자는 채널에 초대하지 못함).' : ''}
            </p>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-fg-3">만든 DDL은 ERD를 만들 때마다 검증용 DB에 적용해 봅니다 (실패하면 자동으로 고침).</p>
          <Button variant="primary" icon={<UploadSimple />} disabled={!file || running || !canUpload || noPm} onClick={submit}
            title={!canUpload ? NEEDS.upload : !file ? '먼저 문서(PDF·DOCX·HWPX)를 고르세요' : running ? '지금 분석이 끝난 뒤 올릴 수 있습니다'
              : noPm ? `${NEED_PM} (담당자에서 PM을 골라 주세요)` : undefined}>
            {submitting ? '올리는 중' : job?.status === 'running' ? '분석 중' : '올리고 분석 시작'}
          </Button>
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        {slackDone && (
          <p role="status" className={cx('flex items-start gap-2 text-small', slackDone.error ? 'text-warn' : 'text-ok')}>
            <SlackLogo size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {slackDone.error
                ? slackDone.error
                : slackDone.existing
                  ? <>이 프로젝트는 이미 Slack 채널 <span className="font-mono">#{slackDone.channel_name}</span>이 있습니다 (담당자는 프로젝트 화면에서 바꾸기)</>
                  : <>Slack {slackDone.team} 워크스페이스에 <span className="font-mono">#{slackDone.channel_name}</span> 채널을 만들었습니다 · 초대: {slackDone.invited?.join(', ') || '없음'}</>}
              {slackDone.failed?.map((f) => <span key={f.name} className="block text-warn">초대 못 함 — {f.name}: {f.reason}</span>)}
            </span>
          </p>
        )}
      </div>
    </Card>
  )
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}
