import { ArrowCounterClockwise, ArrowsClockwise, CheckCircle, CircleNotch, FloppyDisk, LockSimpleOpen, PaperPlaneTilt, SealCheck, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '../../labels'
import type { Design } from '../../types'
import { WorkspaceInsights } from '../components/Insights'
import { PageHeader } from '../components/PageHeader'
import { SaveVersionDialog } from '../components/SaveVersionDialog'
import { Shell, type ShellBase } from '../components/Shell'
import { StageStepper } from '../components/StageStepper'
import { Button, Card, ErrorNote, Loading } from '../components/ui'
import { useDesign } from '../lib/data'
import { mergedEntities, mergedFunctions, readDraft, useDraft, type ConfirmStage, type Draft, type DraftState, type SaveStatus } from '../lib/draft'
import { readStore } from '../lib/storage'
import { specOf, stageTargets } from '../lib/versions'
import { JobPanel } from '../components/JobPanel'
import { startReviewJob, useJob } from '../lib/jobs'
import { erdReview, newAnswers, specReview, summarize, type ReviewItem } from '../lib/review'
import { isDocPage, PAGE_LABEL, type Page, type Route, type StagePage } from '../lib/route'
import { DocsView } from './Docs'
import { ErdEditor } from './Erd'
import { FinalView } from './Final'
import { SpecEditor } from './Spec'

type WorkspaceRoute = Extract<Route, { name: 'workspace' }>

/** 끝난 뒤 새 버전을 자동으로 연 작업 ID (작업 하나당 한 번만 이동) */
const autoOpened = new Set<string>()

export function Workspace({ shell }: { shell: ShellBase }) {
  const route = shell.route as WorkspaceRoute
  const design = useDesign(route.project, route.version)
  const project = shell.projects.state === 'ready' ? shell.projects.data.find((p) => p.id === route.project) : undefined
  const trail = [shell.user.name, project?.name ?? route.project, ...(isDocPage(route.page) ? ['산출물'] : []), PAGE_LABEL[route.page]]

  if (design.state !== 'ready') {
    return (
      <Shell {...shell} header={<PageHeader trail={trail} />} insights={<Card><Loading label="진행 상황을 불러오는 중" lines={6} /></Card>}>
        <Card>
          {design.state === 'loading'
            ? <Loading label={`${PAGE_LABEL[route.page]}을 불러오는 중`} lines={8} />
            : <ErrorNote message={`설계를 불러오지 못했습니다. (${design.message})`} hint="프로젝트·버전이 output 폴더에 있는지 확인하세요." />}
        </Card>
      </Shell>
    )
  }
  // 버전이 바뀌면 편집 상태를 새로 만든다
  return <WorkspaceReady key={`${route.project}@${route.version}`} shell={shell} route={route} design={design.data} trail={trail} />
}

function WorkspaceReady({ shell, route, design, trail }: { shell: ShellBase; route: WorkspaceRoute; design: Design; trail: string[] }) {
  const draft = useDraft(design, route.project, route.version)
  const project = shell.projects.state === 'ready' ? shell.projects.data.find((p) => p.id === route.project) : undefined
  const versions = project?.versions ?? []
  // 오른쪽 진행 상황은 어느 화면에서든 기능 명세·ERD 둘 다 보여준다
  const specItems = useMemo(() => specReview(design, draft.functions, draft.state), [design, draft.functions, draft.state])
  const erdItems = useMemo(() => erdReview(design, draft.entities, draft.state), [design, draft.entities, draft.state])
  const setFocus = (focus?: string) => shell.navigate({ ...route, focus }, true)
  const edited = draft.editedFunctions + draft.editedEntities
  const record = versions.find((v) => v.design_version === route.version)
  // 단계마다 그 단계 번호의 버전을 연다 (기능 명세 v2 → ERD v2.1 → 최종 v2.1.1)
  const targets = stageTargets(versions, route.version)
  const open = (page: Page, focus?: string) =>
    shell.navigate({ ...route, page, focus, version: isDocPage(page) ? route.version : targets[page as StagePage] })
  // 오른쪽 진행 상황: 단계마다 그 단계 버전(기능 명세 v1, ERD v1.2)의 확인 항목으로 센다
  // (체크는 버전별로 저장되므로 지금 버전으로 세면 ERD·최종 화면에서 기능 명세가 0으로 보인다)
  const specSummary = useStageSummary('spec', route.project, targets.spec, route.version, specItems)
  const erdSummary = useStageSummary('erd', route.project, targets.erd, route.version, erdItems)
  const finalized = {
    spec: finalizedOf(route.project, targets.spec, 'spec', route.version, draft),
    erd: finalizedOf(route.project, targets.erd, 'erd', route.version, draft),
    final: finalizedOf(route.project, targets.final, 'final', route.version, draft),
  }
  const [dialog, setDialog] = useState<'spec' | 'answers' | 'erd' | null>(null)   // answers: AI로 답 반영 (LLM)
  const [savedNote, setSavedNote] = useState('')
  const job = useJob(route.project)
  // 이 기능 명세 계보에서 도는(또는 막 끝난) 작업만 이 화면에 보여준다
  const myJob = job && specOf(versions, job.base) === targets.spec ? job : undefined
  // 기능 명세 화면에서 새로 답한 확인 질문: 있으면 내보내기가 ERD 대신 '답 반영 → 기능 명세 다시 만들기'가 된다
  const answered = Object.keys(newAnswers(design, draft.state)).length
  // ERD 최종 확정 → 최종본 v<ERD>.1 (추적·의미 검토). 최종본 화면에서 다시 하면 같은 ERD 아래 다음 최종본
  const reviewJob = myJob?.source === 'review' ? myJob : undefined
  const startReview = () => {
    startReviewJob(route.project, targets.erd, shell.onReloadProjects)
      .catch((e) => setSavedNote(`최종 확정을 시작하지 못함: ${(e as Error).message}`))
  }
  const openJobVersion = (v: string) =>
    shell.navigate({ ...route, version: v, focus: undefined, ...(myJob?.source === 'review' ? { page: 'final' as const } : {}) })

  // 기능 명세 화면은 기능 명세 번호(v2, 답 반영 버전 v2.1)로 연다 (ERD v2.2에서 기능 명세를 누르면 v2로).
  // 버전 기록에 없는 번호(막 만든 버전)는 계보를 알 수 없으므로 기록을 다시 읽을 때까지 그대로 둔다
  useEffect(() => {
    if (route.page === 'spec' && record && route.version !== targets.spec) shell.navigate({ ...route, version: targets.spec }, true)
  }, [route, record, targets.spec, shell])

  // 작업이 끝나면 새 버전을 한 번만 연다 (ERD 작업은 ERD 화면에서, 답 반영은 기능 명세 화면에서 보고 있을 때만,
  // 최종 확정은 ERD·최종 산출물 화면에서 보고 있으면 최종본의 최종 산출물 화면으로).
  // 이 화면은 버전마다 새로 만들어지므로(key) 연 작업은 화면 밖(autoOpened)에 기억한다. 화면 안에 두면
  // 다른 버전(예: ERD)을 열 때마다 다시 새 버전으로 끌려간다.
  useEffect(() => {
    if (myJob?.status !== 'done' || !myJob.new_version || autoOpened.has(myJob.id)) return
    const page = myJob.source === 'answers' ? 'spec' : myJob.source === 'review' ? 'final' : 'erd'
    if (route.page !== page && !(page === 'final' && route.page === 'erd')) return
    autoOpened.add(myJob.id)
    if (route.version !== myJob.new_version || route.page !== page) {
      shell.navigate({ ...route, page, version: myJob.new_version, focus: undefined })
    }
  }, [myJob, route, shell])

  const center = route.page === 'spec'
    ? <SpecEditor draft={draft} items={specItems} focus={route.focus} onFocus={setFocus} finalizedAt={finalized.spec} version={route.version}
        nextAction={{ label: '내보내고 ERD 만들기', onClick: () => setDialog('spec') }}
        // 확정하면 다음 단계로: 이 기능 명세의 ERD가 아직 없으면 ERD 만들기 창, 있으면 ERD 화면
        onFinalized={() => (targets.erd === targets.spec ? setDialog('spec') : open('erd'))}
        blockReason={myJob?.status === 'running' && myJob.source === 'answers'
          ? '확인 질문 답을 반영해 기능 명세를 다시 만드는 중입니다. 끝난 뒤 새 버전에서 확정하세요.' : undefined} />
    : route.page === 'erd'
      ? <ErdEditor draft={draft} items={erdItems} focus={route.focus} onFocus={setFocus} finalizedAt={finalized.erd} version={route.version}
          onOpenFunction={(id) => open('spec', id)}
          onFinalized={startReview}
          nextAction={{ label: '최종 산출물 보기', onClick: () => open('final') }}
          blockReason={draft.editedEntities > 0
            ? `저장하지 않은 테이블 수정 ${draft.editedEntities}건이 있습니다. 'ERD 저장하고 새 버전 만들기'로 만든 새 버전에서 확정하세요.`
            : myJob?.status === 'running' && myJob.source !== 'review' ? '이 기능 명세로 새 ERD를 만드는 중입니다. 끝난 뒤 새 버전에서 확정하세요.' : undefined} />
      : route.page === 'final'
        ? <FinalView design={design} project={route.project} version={route.version} record={record} finalized={finalized}
            unsavedEntities={draft.editedEntities} onOpenEntity={(id) => open('erd', id)} onOpenDevSpec={(name) => open('dev-spec', name)}
            review={reviewJob && [reviewJob.base, reviewJob.new_version].includes(route.version) ? reviewJob : undefined}
            onReview={startReview} />
        : <DocsView page={route.page} design={draft.merged} saved={design} project={route.project} version={route.version}
            versionRecord={record} versions={versions} finalizedAt={finalized.final} focus={route.focus} onOpen={open} />

  const actions = route.page === 'spec' ? (
    <>
      <ResetButton draft={draft} />
      <Button icon={<FloppyDisk />} onClick={() => { const ok = draft.saveNow(); setSavedNote(ok ? `저장함 ${formatDate(new Date().toISOString()).slice(-5)}` : '저장 실패') }}>저장</Button>
      {/* 새 답은 내보낼 때 코드로 반영된다. LLM으로 답이 바꾼 기능을 다시 쓰고 싶을 때만 이 버튼 (토큰 사용) */}
      {answered > 0 && (
        <Button icon={<ArrowsClockwise />} disabled={myJob?.status === 'running'} onClick={() => setDialog('answers')}
          title="LLM이 답이 바꾼 기능을 다시 설계해 기능 명세 새 버전을 만듭니다 (토큰 사용)">
          답 {answered}건 AI로 반영 → 기능 명세 다시
        </Button>
      )}
      <Button variant="primary" icon={<PaperPlaneTilt />} disabled={myJob?.status === 'running'} onClick={() => setDialog('spec')}>
        내보내기 → ERD 만들기
      </Button>
    </>
  ) : route.page === 'erd' ? (
    <>
      <ResetButton draft={draft} />
      <Button variant="primary" icon={<FloppyDisk />} disabled={myJob?.status === 'running'} onClick={() => setDialog('erd')}>ERD 저장하고 새 버전 만들기</Button>
    </>
  ) : route.page === 'final' ? (
    <FinalizeButton draft={draft} finalized={finalized} />
  ) : null

  return (
    <Shell
      {...shell}
      header={
        <PageHeader
          trail={trail}
          meta={myJob?.status === 'running'
            ? <button type="button" onClick={() => myJob.source === 'review' ? openJobVersion(myJob.new_version ?? myJob.base) : open(myJob.source === 'answers' ? 'spec' : 'erd')} className="flex items-center gap-1.5 text-info underline-offset-4 hover:underline">
                <CircleNotch size={14} className="animate-spin" aria-hidden="true" />{myJob.message}
              </button>
            : <SaveIndicator status={draft.save} edited={edited} note={savedNote} />}
          actions={actions}
        />
      }
      insights={
        <WorkspaceInsights
          design={design}
          project={project}
          version={route.version}
          reviews={{ spec: specSummary, erd: erdSummary }}
          finalized={finalized}
          navigate={shell.navigate}
          onReloadProjects={shell.onReloadProjects}
          page={route.page}
        />
      }
    >
      <p className="sr-only">v{route.version} · {formatDate(design.meta.generated_at)} 생성</p>
      {!isDocPage(route.page) && <StageStepper page={route.page} targets={targets} finalized={finalized} onGo={(p) => open(p)} />}
      {myJob && (route.page === 'erd' || (route.page === 'spec' && myJob.source === 'answers') || (route.page === 'final' && myJob.source === 'review'))
        && <JobPanel job={myJob} project={route.project} onOpen={openJobVersion} current={route.version} />}
      {center}
      {dialog && (
        <SaveVersionDialog
          mode={dialog === 'erd' ? 'erd' : 'spec'}
          aiAnswers={dialog === 'answers'}
          open
          onClose={() => setDialog(null)}
          draft={draft}
          design={design}
          project={route.project}
          version={route.version}
          onStarted={(kind) => { if (dialog === 'spec' && kind === 'erd') open('erd') }}
          onFinished={shell.onReloadProjects}
        />
      )}
    </Shell>
  )
}

/**
 * 최종 산출물 화면의 '최종 확정하기': 보고 있는 버전을 최종 산출물로 확정했다고 이 브라우저에 표시한다.
 * 최종본(v<ERD>.1) 자체는 ERD 화면의 'ERD 최종 확정'(POST /projects/review)이 만든다. 앞 단계를 확정하지 않았으면 한 번 더 묻는다.
 */
function FinalizeButton({ draft, finalized }: { draft: Draft; finalized: { spec?: string; erd?: string; final?: string } }) {
  const [confirming, setConfirming] = useState(false)
  if (finalized.final) {
    return <Button variant="ghost" icon={<LockSimpleOpen />} onClick={() => draft.unfinalize('final')}>최종 확정 취소</Button>
  }
  const missing = [!finalized.spec && '기능 명세', !finalized.erd && 'ERD'].filter(Boolean)
  if (confirming) {
    return (
      <span role="group" aria-label="최종 확정 확인" className="flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn-soft py-1 pr-1 pl-3 text-small text-warn">
        {missing.join('·')}를 아직 확정하지 않았습니다. 그래도 최종 확정할까요?
        <Button size="sm" variant="primary" onClick={() => { draft.finalize('final'); setConfirming(false) }}>최종 확정</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>취소</Button>
      </span>
    )
  }
  return (
    <Button variant="primary" icon={<SealCheck />} onClick={() => (missing.length ? setConfirming(true) : draft.finalize('final'))}>
      최종 확정하기
    </Button>
  )
}

/** 다른 버전의 확정 여부는 그 버전의 초안 기록에서 읽는다 (지금 버전은 화면의 상태를 쓴다) */
/** 단계 버전의 확인 항목 요약. 지금 보는 버전이면 편집 중인 항목, 아니면 그 버전의 design.json과 이 브라우저에 저장된 초안으로 센다 */
function useStageSummary(stage: 'spec' | 'erd', project: string, version: string, current: string, currentItems: ReviewItem[]) {
  const other = useDesign(project, version)
  return useMemo(() => {
    if (version === current) return summarize(currentItems)
    if (other.state !== 'ready') return null
    const saved = readDraft(project, version)
    return summarize(stage === 'spec'
      ? specReview(other.data, mergedFunctions(other.data, saved), saved)
      : erdReview(other.data, mergedEntities(other.data, saved), saved))
  }, [stage, project, version, current, currentItems, other])
}

function finalizedOf(project: string, version: string, page: ConfirmStage, current: string, draft: Draft): string | undefined {
  if (version === current) return draft.finalizedAt(page)
  return readStore<DraftState>(`draft:${project}@v${version}`)?.finalized?.find((f) => f.page === page)?.at
}

function SaveIndicator({ status, edited, note }: { status: SaveStatus; edited: number; note?: string }) {
  return (
    <p aria-live="polite" className="flex items-center gap-1.5">
      {note && status === 'saved' && <span className="mr-1 font-medium text-ok">{note} ·</span>}
      {status === 'saving' && <><CircleNotch size={14} className="animate-spin" aria-hidden="true" />저장 중…</>}
      {status === 'saved' && (edited
        ? <><CheckCircle size={14} className="text-ok" aria-hidden="true" />수정 {edited}건 · 이 브라우저에 저장됨</>
        : <>원본 초안 그대로</>)}
      {status === 'unsaved' && <span className="flex items-center gap-1.5 text-danger"><WarningCircle size={14} aria-hidden="true" />저장 안 됨 — 내보내기로 백업하세요</span>}
    </p>
  )
}

/** 편집·체크를 모두 지우는 버튼: 한 번 더 눌러야 실행된다 */
function ResetButton({ draft }: { draft: Draft }) {
  const [confirming, setConfirming] = useState(false)
  const s = draft.state
  const empty = !Object.keys(s.functions).length && !Object.keys(s.entities).length && !Object.keys(s.answers).length
    && !Object.keys(s.checked).length && !s.finalized?.length
  if (confirming) {
    return (
      <span role="group" aria-label="초안 되돌리기 확인" className="flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger-soft py-1 pr-1 pl-3 text-small text-danger">
        편집·체크를 모두 지울까요?
        <Button size="sm" variant="danger" onClick={() => { draft.reset(); setConfirming(false) }}>지우기</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>취소</Button>
      </span>
    )
  }
  return (
    <Button variant="ghost" icon={<ArrowCounterClockwise />} disabled={empty} onClick={() => setConfirming(true)}>
      원본으로 되돌리기
    </Button>
  )
}
