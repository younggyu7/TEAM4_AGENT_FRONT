import { ArrowRight, Check, CircleNotch, Copy, GitBranch, Play, Stop } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { apiUrl, appUrl, getGitSettings, getPreviewAccounts, getPreviewStatus, getRepo, previewUrl, stopPreview, type GitSettings, type Job, type PreviewAccount, type PreviewStatus, type RepoBranch } from '../../api'
import { formatDate } from '../../labels'
import { shortModel } from '../lib/pricing'
import type { VersionRecord } from '../../types'
import { GitDialog } from '../components/DevelopActions'
import { CodeBrowser, OPEN_CODE_FILE } from '../components/CodeBrowser'
import { JobPanel } from '../components/JobPanel'
import { PreviewTerminal } from '../components/PreviewTerminal'
import { LayoutEditor, WorkBundles } from '../components/WorkBundles'
import { useRepoBranch, useRepoVersion } from '../lib/repo'
import { can, NEEDS, type User } from '../lib/session'
import { Badge, Button, Card, CardHeader, cx, ErrorNote } from '../components/ui'

type Step = '1' | '2' | '3'
type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral'

const RUN: Record<PreviewStatus['status'], { label: string; tone: Tone }> = {
  stopped: { label: '꺼짐', tone: 'neutral' },
  building: { label: '빌드 중', tone: 'info' },
  starting: { label: '켜는 중', tone: 'info' },
  running: { label: '실행 중', tone: 'ok' },
  failed: { label: '실패', tone: 'danger' },
  no_backend: { label: '백엔드 없음', tone: 'warn' },
}

/**
 * 최종 개발물: 최종 승인한 최종본을 1 개발(코드 + 예시 데이터 화면) → 2 실행(Docker) → 3 Git 단계로 나눠 보여 준다.
 * 단계는 주소의 마지막 칸(focus)에 둔다 — 산출물 보기 '최종 개발하기'를 시작하면 1단계로 온다.
 * 위의 '결과물 미리보기'는 1단계면 예시 데이터 화면, 2·3단계면 실행 미리보기(새 탭에서 Docker를 켜고 앱 화면)를 연다.
 */
export function DevelopView({ project, record, user, step: given, job, onStep, onOpenDocs, onFinished }: {
  project: string
  record?: VersionRecord
  user: User
  step?: string
  /** 이 프로젝트에서 도는(또는 막 끝난) 개발·git 작업 */
  job?: Job
  onStep: (step: Step) => void
  onOpenDocs: () => void
  onFinished: () => void
}) {
  const [run, setRun] = useState<PreviewStatus | null>(null)
  const [error, setError] = useState('')
  const [gitOpen, setGitOpen] = useState(false)
  const [branch, setBranch] = useRepoBranch(project)
  const repoVersion = useRepoVersion()
  const [branches, setBranches] = useState<RepoBranch[]>([])
  const [remote, setRemote] = useState<GitSettings | null>(null)
  const developed = record?.develop
  const step: Step = given === '2' || given === '3' ? given : '1'
  // 맨 위 '테스트(검증)'에서 오면 1단계의 자동 확인 줄로 내려 보여 준다
  useEffect(() => {
    if (given === 'check' && record?.develop) document.getElementById('develop-check')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [given, record?.develop])
  // 오른쪽 '업무 로직 현황'에서 파일을 고르면 1단계(코드 보기)로 옮긴다 (코드 보기가 그 파일을 연다)
  const [openPath, setOpenPath] = useState('')
  useEffect(() => {
    const toCode = (e: Event) => { setOpenPath((e as CustomEvent<string>).detail); if (step !== '1') onStep('1') }
    window.addEventListener(OPEN_CODE_FILE, toCode)
    return () => window.removeEventListener(OPEN_CODE_FILE, toCode)
  }, [step, onStep])
  // 코드 보기 브랜치 고르기 (오른쪽 '코드 저장소'와 같은 브랜치) · 3단계 원격 상태
  useEffect(() => {
    if (!developed) return
    getRepo(project).then((r) => setBranches(r.branches)).catch(() => setBranches([]))
    getGitSettings(project).then(setRemote).catch(() => setRemote(null))
  }, [project, developed, repoVersion, job?.status])
  useEffect(() => {
    if (!developed) return
    let alive = true
    let timer = 0
    const load = () => getPreviewStatus(project)
      .then((s) => { if (!alive) return; setRun(s); setError(''); timer = window.setTimeout(load, s.status === 'building' || s.status === 'starting' ? 2000 : 10000) })
      .catch((e) => { if (alive) setError((e as Error).message) })
    load()
    return () => { alive = false; window.clearTimeout(timer) }
  }, [project, developed])

  if (!record || record.approval?.decision !== 'approve') {
    return <Card><ErrorNote message="최종 승인한 최종본이 없습니다." hint="최종 산출물에서 최종 승인하면 이 화면이 열립니다." /></Card>
  }
  const allowed = can(user, 'develop')
  const canStop = can(user, 'preview_stop')
  const developing = job?.source === 'develop' && job.status === 'running'
  const stop = () => stopPreview(project).then(setRun).catch((e) => setError((e as Error).message))
  const state = run ? RUN[run.status] : undefined
  const mockUrl = apiUrl(`/preview/${encodeURIComponent(project)}/mock/`)
  const openUrl = step === '1' ? (developed?.mock ? mockUrl : undefined) : developed ? previewUrl(project) : undefined
  const steps: { id: Step; label: string; status: string; tone: Tone; done: boolean; spin?: 'ok' | 'info' }[] = [
    { id: '1', label: '개발', done: Boolean(developed),
      status: developing ? '개발 중' : developed ? `완료 ${formatDate(developed.at)}` : '개발 대기', tone: developed ? 'ok' : developing ? 'info' : 'warn' },
    // 실행: 끝난 일이 아니라 지금 돌고 있는 상태라 체크 대신 도는 표시 (실행 중 초록, 빌드·켜는 중 파랑)
    { id: '2', label: '실행 (Docker)', done: false, spin: run?.status === 'running' ? 'ok' : run?.status === 'building' || run?.status === 'starting' ? 'info' : undefined,
      status: !developed ? '1단계 후' : !run ? '확인 중' : !run.backend ? '백엔드 없음' : RUN[run.status].label, tone: state?.tone ?? 'neutral' },
    { id: '3', label: 'Git', done: Boolean(record.git) && remote?.ahead === 0,
      status: !developed ? '1단계 후' : remote?.ahead ? `원격보다 ${remote.ahead}개 앞섬` : record.git ? `올림 ${formatDate(record.git.at)}` : '안 올림',
      tone: record.git && !remote?.ahead ? 'ok' : 'neutral' },
  ]
  return (
    <Card aria-labelledby="develop-title">
      <CardHeader
        level={1}
        eyebrow={`Develop · v${record.design_version}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            최종 개발물
            <Button variant="ok" icon={<Play weight="fill" />} disabled={!openUrl}
              title={!developed ? "산출물 보기에서 '최종 개발하기'를 먼저 하세요"
                : step === '1' ? '새 탭에서 예시 데이터 화면을 엽니다 (서버·DB 없이)'
                : '새 탭에서 실행 미리보기를 켜고(처음엔 빌드로 몇 분) 앱 화면을 엽니다'}
              onClick={() => openUrl && window.open(openUrl, '_blank', 'noopener')}>
              결과물 미리보기{step === '1' ? ' (예시 데이터)' : ''}
            </Button>
          </span>
        }
        titleId="develop-title"
      />

      <ol aria-label="개발 단계" className="mb-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.id}>
            <button type="button" aria-current={step === s.id ? 'step' : undefined} onClick={() => onStep(s.id)}
              className={cx('flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
                step === s.id ? 'border-fg bg-card' : 'border-line bg-card/60 hover:border-control hover:bg-card')}>
              <span aria-hidden="true" className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-md text-small font-semibold tabular-nums',
                s.spin === 'ok' ? 'bg-ok-soft text-ok' : s.spin === 'info' ? 'bg-info-soft text-info'
                  : s.done ? 'bg-ok text-card' : step === s.id ? 'bg-primary text-on-primary' : 'bg-sunken text-fg-3')}>
                {s.spin ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : s.done ? <Check size={14} weight="bold" /> : s.id}
              </span>
              <span className="min-w-0">
                <span className={cx('block text-label', step === s.id ? 'font-semibold' : 'font-medium text-fg-2')}>{s.id}단계 · {s.label}</span>
                <span className={cx('block truncate text-micro', s.tone === 'ok' ? 'text-ok' : s.tone === 'danger' ? 'text-danger' : 'text-fg-3')}>{s.status}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* 이 단계의 작업 (1단계: 개발, 3단계: git) */}
      {job && ((step === '1' && job.source === 'develop') || (step === '3' && job.source === 'git')) && (
        <JobPanel job={job} project={project} onOpen={() => undefined} current={record.design_version} />
      )}
      {step === '1' && (
        <dl className="divide-y divide-line text-label">
          <Row label="개발">
            {developed ? (
              <>
                <Badge tone="ok">완료</Badge>{' '}
                {formatDate(developed.at)} · {developed.by.name} · {developed.build ? '기능 전체 AI' : developed.logic ? '빈 로직만 AI' : 'AI 안 씀'}{(developed.build || developed.logic) ? ` (${shortModel(developed.ai?.model ?? '') || '기본 모델'} · ${developed.ai?.effort || '기본'})` : ''}
                <p className="mt-1 text-small text-fg-3">
                  기술 스택: {record.tech_stack?.stack || '미정'} · {developed.backend ? '화면·백엔드·DB' : '화면·DB만 (백엔드 틀이 있는 Spring 계열 스택이 아님)'}
                </p>
              </>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={developing ? 'info' : 'warn'}>{developing ? '개발 중' : '개발 대기'}</Badge>
                {!developing && <>
                  <span className="text-fg-2">산출물 보기에서 '최종 개발하기'를 누르면 코드를 만듭니다 (개발자).</span>
                  <Button size="sm" icon={<ArrowRight />} onClick={onOpenDocs}>산출물 보기</Button>
                </>}
              </span>
            )}
          </Row>
          {developed?.summary && (
            <Row label="구현 방식">
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                <span>기능 {developed.summary.functions}개</span>
                {developed.logic
                  ? <span className="text-ai">AI가 채운 업무 로직 {developed.summary.logic_holes ?? 0}곳 (기능 {developed.summary.logic_functions?.length ?? 0}개)</span>
                  : <span className="text-ai">AI 구현 {developed.summary.ai.length}</span>}
                {developed.summary.failed.length > 0 && <span className="text-warn" title={developed.summary.failed.join(', ')}>AI 실패 → 코드 틀 {developed.summary.failed.length}</span>}
                {!developed.logic && <span className="text-fg-2">코드 틀 {developed.summary.template.length}</span>}
              </span>
              <p className="mt-1 text-small text-fg-3">코드 틀 기능은 등록·조회·수정·삭제·상태 바꾸기 기본 동작이고, 업무 규칙 자리는 아래 코드에서 노란 줄(빈 로직)로 보입니다. 자세한 내용은 IMPLEMENTATION.md.</p>
            </Row>
          )}
          {developed?.summary && developed.summary.todo_count > 0 && (
            <Row label="고객 답 대기">
              <details>
                <summary className="cursor-pointer text-small text-warn">구현하지 않은 규칙 {developed.summary.todo_count}건 (고객 확인이 필요해 TODO로 둠)</summary>
                <ul className="mt-1 space-y-0.5 text-small">
                  {developed.summary.todos.map((t, i) => <li key={i}><code className="text-micro">{t.function}</code> {t.rule} — <span className="text-fg-3">{t.reason}</span></li>)}
                </ul>
              </details>
            </Row>
          )}
          {developed?.check !== undefined && (
            <Row label="자동 확인" id="develop-check">
              {developed.check === null && developed.request ? <span className="text-fg-3">다시 개발한 결과는 하지 않음 — gen → dev 합치기 요청 #{developed.request}을 승인한 뒤 2단계에서 실행해 확인하세요</span>
                : developed.check === null ? <span className="text-fg-3">서버 코드가 없어 하지 않음</span>
                : !developed.check.counts ? <span className="text-danger">{developed.check.message}</span>
                : (
                  <>
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <Badge tone={developed.check.ok ? 'ok' : 'danger'}>{developed.check.ok ? '통과' : '서버 오류 있음'}</Badge>
                      <span>admin 로그인 · 조회 API {developed.check.apis}개</span>
                      <span className="text-ok">정상 {developed.check.counts.ok}</span>
                      {developed.check.counts.not_implemented > 0 && <span className="text-fg-2" title={developed.check.not_implemented?.join('\n')}>구현 대기(501) {developed.check.counts.not_implemented}</span>}
                      {developed.check.counts.errors > 0 && <span className="text-danger">서버 오류 {developed.check.counts.errors}</span>}
                      {developed.check.counts.other > 0 && <span className="text-warn" title={developed.check.other?.join('\n')}>그 밖 {developed.check.counts.other}</span>}
                    </span>
                    {(developed.check.errors?.length ?? 0) > 0 && <ul className="mt-1 font-mono text-micro text-danger">{developed.check.errors!.map((e) => <li key={e}>{e}</li>)}</ul>}
                  </>
                )}
            </Row>
          )}
          <Row label="결과물">
            {developed
              ? <span className="text-fg-2">서버 코드 폴더에 화면(frontend)·{developed.backend ? '백엔드(backend)·' : ''}DB(db)·개발 스펙(spec)이 있습니다.
                  {developed.mock ? " 위의 '결과물 미리보기'로 예시 데이터 화면을 봅니다." : ' 예시 데이터 화면 빌드는 실패했습니다 (기록 확인).'}</span>
              : <span className="text-fg-3">개발하면 생깁니다.</span>}
          </Row>
          {developed && developed.log.length > 0 && (
            <Row label="개발 기록"><Log title={`코드 생성·화면 빌드 기록 ${developed.log.length}줄`} lines={developed.log} /></Row>
          )}
        </dl>
      )}
      {step === '1' && developed && (
        <section aria-label="작업" className="mt-4 space-y-3">
          <h2 className="text-label font-semibold">작업 묶음 <span className="font-normal text-fg-3">· 코드를 사람에게 나눠 맡기는 단위. 배정하면 작업 브랜치가 생기고, 담당자가 VS Code 확장(또는 아래 코드 보기)에서 고쳐 제출하면 다른 개발자가 승인합니다</span></h2>
          <WorkBundles project={project} user={user} refreshKey={developed.at} />
          <details className="rounded-lg border border-line bg-card">
            <summary className="cursor-pointer px-3 py-2 text-label font-semibold">화면 구성 <span className="font-normal text-fg-3">· 생성 앱의 메뉴 이름·순서·숨김과 홈 칸 (코드 수정 없이, 저장하면 dev에 커밋)</span></summary>
            <div className="border-t border-line p-3"><LayoutEditor project={project} user={user} /></div>
          </details>
        </section>
      )}
      {step === '1' && developed && (
        <details aria-label="코드" className="mt-4 rounded-lg border border-line bg-card px-3 py-2">
          <summary className="cursor-pointer text-label font-semibold">전체 파일 <span className="font-normal text-fg-3">· 펼쳐서 전체 코드 보기·고치기</span></summary>
          <h2 className="my-2 flex flex-wrap items-center gap-2 text-label font-semibold">코드
            <select aria-label="코드 브랜치" value={branch} onChange={(e) => setBranch(e.target.value)}
              className="min-h-8 rounded-md border border-control bg-card px-2 text-small font-normal text-fg">
              {(branches.length ? branches : [{ name: 'dev', protected: true } as RepoBranch]).map((b) => (
                <option key={b.name} value={b.name}>{b.name}{b.protected ? ' (보호 · 읽기만)' : b.changes ? ` · 저장 안 한 변경 ${b.changes}` : ''}</option>
              ))}
            </select>
            <span className="font-normal text-fg-3">노란 줄은 빈 업무 로직(기본 동작만) · 브랜치는 오른쪽 '코드 저장소'에서 만듭니다</span></h2>
          <CodeBrowser project={project} branch={branch} canEdit={can(user, 'repo_write')} refreshKey={developed.at} openPath={openPath} />
        </details>
      )}

      {step === '2' && (
        <dl className="divide-y divide-line text-label">
          <Row label="실행 미리보기">
            {!developed ? <span className="text-fg-3">1단계 개발을 먼저 하세요.</span>
              : error ? <span className="text-danger">{error}</span>
              : !run || !state ? <span className="text-fg-3">상태를 확인하는 중…</span>
              : (
                <>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {run.stale && run.status === 'running' && <Badge tone="warn">다시 개발함 · 다음에 열 때 새로 빌드</Badge>}
                    {run.status === 'running' && run.port && (
                      <a href={appUrl(run.port, run.url)} target="_blank" rel="noopener" className="font-mono text-small text-info underline-offset-4 hover:underline">{appUrl(run.port, run.url)}</a>
                    )}
                    <span className="text-fg-2">{run.status === 'running'
                      ? `쓰는 동안은 켜 두고 ${Math.round(run.idle_limit / 60)}분 동안 요청이 없으면 끕니다${run.idle_seconds !== null ? ` (마지막 사용 ${Math.floor(run.idle_seconds / 60)}분 전)` : ''}. 동시에 3개까지.`
                      : run.message || (run.backend ? "위의 '결과물 미리보기'를 누르면 켭니다 (처음엔 빌드로 몇 분)." : '')}</span>
                    {run.status === 'running' && (
                      <Button size="sm" variant="ghost" icon={<Stop />} disabled={!canStop} title={canStop ? undefined : NEEDS.preview_stop} onClick={() => void stop()}>끄기</Button>
                    )}
                  </span>
                  {!run.backend && <p className="mt-1 text-small text-warn">서버 코드가 없어(서버 틀이 없는 기술 스택) 실행하지 않고 예시 데이터 화면을 엽니다.</p>}
                  {!run.docker && run.backend && <p className="mt-1 text-small text-warn">이 서버 PC에 Docker가 없어 실행할 수 없습니다.</p>}
                </>
              )}
          </Row>
          {can(user, 'app_accounts') && <Row label="시연 계정"><Accounts project={project} running={run?.status === 'running'} /></Row>}
          <Row label="실행 방식">
            <span className="text-small text-fg-3">앱 폴더의 Dockerfile·docker-compose.yml로 프로젝트마다 따로 띄우는 독립 앱입니다 (화면·서버 한 이미지 + 앱 DB). 우리 서비스와 분리되고, 같은 네트워크의 팀원 PC에서도 위 주소로 열립니다.</span>
          </Row>
        </dl>
      )}
      {step === '2' && developed && (
        <section aria-label="터미널" className="mt-4">
          <h2 className="mb-2 text-label font-semibold">터미널 <span className="font-normal text-fg-3">서버가 실행한 명령과 출력 · 앱 서버 로그</span></h2>
          <PreviewTerminal project={project} />
        </section>
      )}

      {step === '3' && (
        <dl className="divide-y divide-line text-label">
          <Row label="원격 저장소">
            <div className="space-y-2">
              {remote?.url
                ? <p><span className="font-mono text-small">{remote.url}</span> · <code>{remote.branch}</code>
                    <span className="ml-2">{remote.ahead === null ? <Badge tone="neutral">원격 확인 전</Badge>
                      : remote.behind ? <Badge tone="danger">원격에 서버에 없는 커밋 {remote.behind}개</Badge>
                      : remote.ahead ? <Badge tone="warn">원격보다 {remote.ahead}개 앞섬</Badge> : <Badge tone="ok">원격과 같음</Badge>}</span></p>
                : <p className="text-fg-3">원격 저장소를 아직 정하지 않았습니다.</p>}
              {record.git && (
                <p className="text-small text-fg-3">마지막 올림 {formatDate(record.git.at)} · {record.git.by.name}
                  {record.git.commit ? <> · {record.git.branch}@<code>{record.git.commit.slice(0, 10)}</code></> : record.git.pushed ? ` · ${Object.values(record.git.pushed).join(', ')} (예전 두 저장소 방식)` : ''}</p>
              )}
              <Button variant={remote?.ahead ? 'ok' : 'secondary'} icon={<GitBranch />} disabled={!allowed || !developed || job?.status === 'running'}
                title={!allowed ? NEEDS.develop : !developed ? '1단계 개발을 먼저 하세요' : '코드 저장소의 dev(테스트 배포)나 main(릴리스)과 태그를 원격에 올립니다 (처음엔 원격 설정)'}
                onClick={() => setGitOpen(true)}>
                원격 설정 · 올리기
              </Button>
            </div>
          </Row>
          <Row label="저장소 구성">
            <span className="text-small text-fg-3">서버의 코드 폴더 하나가 git 저장소입니다. 화면(frontend)·백엔드(backend)·DB(db)·개발 스펙(spec)을 한 저장소에 같이 올립니다.
              dev(통합·테스트 배포)는 최종 개발하기(AI 커밋, 태그 final-v최종본)·개발자의 합치기·화면 구성 저장으로만 바뀌고, main(고객 납품)은 '릴리스'로만 dev까지 앞으로 갑니다. 개발자는 작업 브랜치에서 고쳐 저장하기 → 제출(합치기 요청)을 합니다.
              빌드 결과·node_modules·미리보기·생성기 기록·시연 계정은 커밋하지 않습니다. 원격에 서버에 없는 커밋이 있으면 덮어쓰지 않고 멈춥니다.</span>
          </Row>
        </dl>
      )}
      {gitOpen && <GitDialog project={project} version={record.design_version} onClose={() => setGitOpen(false)} onFinished={onFinished} />}
    </Card>
  )
}

function Log({ title, lines }: { title: string; lines: string[] }) {
  return (
    <details>
      <summary className="cursor-pointer text-small text-fg-3">{title}</summary>
      <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-sunken p-3 text-micro whitespace-pre-wrap">{lines.join('\n')}</pre>
    </details>
  )
}

function Row({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return (
    <div id={id} className="grid scroll-mt-4 gap-1 py-3 sm:grid-cols-[120px_1fr]">
      <dt className="text-small font-medium text-fg-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** 앱이 처음 뜰 때 만든 시연 계정 (local/accounts.txt). 로그인 화면에 넣을 아이디·비밀번호 */
function Accounts({ project, running }: { project: string; running: boolean }) {
  const [list, setList] = useState<PreviewAccount[] | null>(null)
  useEffect(() => { getPreviewAccounts(project).then(setList).catch(() => setList([])) }, [project, running])
  if (!list) return <span className="text-fg-3">읽는 중…</span>
  if (!list.length) return <span className="text-fg-3">앱을 처음 켜면 admin(전체 권한)·user(일반 역할) 계정과 비밀번호가 만들어집니다.</span>
  return (
    <table className="text-small">
      <tbody>
        {list.map((a) => (
          <tr key={a.loginId}>
            <td className="py-0.5 pr-4 font-mono">{a.loginId}</td>
            <td className="py-0.5 pr-4 text-fg-2">{a.role}</td>
            <td className="py-0.5 pr-2 font-mono">{a.password}</td>
            <td><Button size="sm" variant="ghost" icon={<Copy />} onClick={() => void navigator.clipboard.writeText(a.password)}>복사</Button></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
