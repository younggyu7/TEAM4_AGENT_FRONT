import { ArrowCounterClockwise, ArrowRight, ArrowsClockwise, BellSimple, CheckCircle, CircleNotch, FloppyDisk, LockSimple, PaperPlaneTilt, SealCheck, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '../../labels'
import type { Design, VersionRecord } from '../../types'
import { WorkspaceInsights } from '../components/Insights'
import { PageHeader } from '../components/PageHeader'
import { SaveVersionDialog } from '../components/SaveVersionDialog'
import { Shell, type ShellBase } from '../components/Shell'
import { StageStepper } from '../components/StageStepper'
import { getDirectives, getNotices, type Directive, type Notice } from '../../api'
import { DIRECTIVES_CHANGED } from '../components/ReviewPanel'
import { Button, Card, cx, ErrorNote, Loading } from '../components/ui'
import { useDesign } from '../lib/data'
import { mergedEntities, mergedFunctions, pullDraft, readDraft, useDraft, type ConfirmStage, type Draft, type DraftState, type DraftSync, type SaveStatus } from '../lib/draft'
import { can, NEEDS } from '../lib/session'
import { readStore } from '../lib/storage'
import { specOf, stageTargets } from '../lib/versions'
import { JobPanel } from '../components/JobPanel'
import { startReviewJob, useJob } from '../lib/jobs'
import { directiveItems, erdReview, newAnswers, specReview, summarize, type ReviewItem } from '../lib/review'
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
  // 역할 권한: 기능 명세는 기획 파트, ERD는 데이터 파트가 고치고, 확정은 각 파트장 (팀장은 모두). 서버도 다시 검사한다
  const me = shell.user
  const perm = {
    specEdit: can(me, 'spec_edit'), specConfirm: can(me, 'spec_confirm'),
    erdEdit: can(me, 'erd_edit'), erdConfirm: can(me, 'erd_confirm'), final: can(me, 'final_decide'),
  }
  // 팀장 수정 지시의 진행(서버가 계산)과 나에게 온 알림. 지시 항목을 처리하거나 버전이 바뀌면 다시 읽는다
  const allVersions = shell.projects.state === 'ready' ? shell.projects.data.find((p) => p.id === route.project)?.versions ?? [] : []
  const [directives, setDirectives] = useState<Directive[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  useEffect(() => {
    const load = () => {
      getDirectives(route.project).then(setDirectives).catch(() => setDirectives([]))
      getNotices().then((list) => setNotices(list.filter((n) => n.project === route.project))).catch(() => setNotices([]))
    }
    load()
    window.addEventListener(DIRECTIVES_CHANGED, load)
    return () => window.removeEventListener(DIRECTIVES_CHANGED, load)
  }, [route.project, route.version, shell.projects])
  // 기능 명세 수정 지시가 진행 중인 옛 계보의 ERD는 잠근다 (서버도 막는다): 새 기능 명세의 ERD에서 고친다
  const lockedBy = route.page === 'erd'
    ? directives.find((d) => d.targets.includes('spec') && d.spec_version === specOf(allVersions, route.version)) : undefined
  const lockReason = lockedBy ? `팀장이 기능 명세 수정을 지시해(최종본 v${lockedBy.final}) 이 ERD는 잠겼습니다. `
    + (lockedBy.erd_version ? `새 ERD v${lockedBy.erd_version}에서 작업하세요.` : '새 기능 명세가 올라오면 그 ERD에서 고칩니다.') : ''
  const canSave = route.page === 'spec' ? perm.specEdit : route.page === 'erd' ? perm.erdEdit && !lockedBy : false
  const draft = useDraft(design, route.project, route.version, canSave)
  const project = shell.projects.state === 'ready' ? shell.projects.data.find((p) => p.id === route.project) : undefined
  const versions = project?.versions ?? []
  // 오른쪽 진행 상황은 어느 화면에서든 기능 명세·ERD 둘 다 보여준다
  // 확인 필요 항목 + 이 화면에서 처리할 팀장 지시 항목(필수)
  const specItems = useMemo(() => [...specReview(design, draft.functions, draft.state), ...directiveItems(directives, 'spec', route.version)],
    [design, draft.functions, draft.state, directives, route.version])
  const erdItems = useMemo(() => [...erdReview(design, draft.entities, draft.state), ...directiveItems(directives, 'erd', route.version)],
    [design, draft.entities, draft.state, directives, route.version])
  const setFocus = (focus?: string) => shell.navigate({ ...route, focus }, true)
  const edited = draft.editedFunctions + draft.editedEntities
  const record = versions.find((v) => v.design_version === route.version)
  // 단계마다 그 단계 번호의 버전을 연다 (기능 명세 v2 → ERD v2.1 → 최종 v2.1.1)
  const targets = stageTargets(versions, route.version)
  const open = (page: Page, focus?: string) =>
    shell.navigate({ ...route, page, focus, version: isDocPage(page) ? route.version : targets[page as StagePage] })
  // 오른쪽 진행 상황: 단계마다 그 단계 버전(기능 명세 v1, ERD v1.2)의 확인 항목으로 센다
  // (체크는 버전별로 저장되므로 지금 버전으로 세면 ERD·최종 화면에서 기능 명세가 0으로 보인다)
  // 다른 단계 버전(기능 명세 v1·ERD v1.2)의 초안은 서버에서 받아 센다 (다른 회원이 고친 것도)
  const [pulled, setPulled] = useState(0)
  useEffect(() => {
    const others = [...new Set([targets.spec, targets.erd])].filter((v) => v !== route.version)
    Promise.all(others.map((v) => pullDraft(route.project, v).catch(() => undefined))).then(() => setPulled((n) => n + 1))
  }, [route.project, route.version, targets.spec, targets.erd])
  const specSummary = useStageSummary('spec', route.project, targets.spec, route.version, specItems, pulled)
  const erdSummary = useStageSummary('erd', route.project, targets.erd, route.version, erdItems, pulled)
  // answers: AI로 답 반영 (LLM) · redo: 확정한 기능 명세에서 새 기능 명세 버전 만들기 (LLM)
  const [dialog, setDialog] = useState<'spec' | 'answers' | 'redo' | 'erd' | null>(null)
  const [savedNote, setSavedNote] = useState('')
  const job = useJob(route.project)
  // 이 기능 명세 계보에서 도는(또는 막 끝난) 작업만 이 화면에 보여준다
  const myJob = job && specOf(versions, job.base) === targets.spec ? job : undefined
  const running = myJob?.status === 'running'
  // 확정: 기능 명세는 '내보내기 → ERD 만들기', ERD는 'ERD 최종 확정하기'를 누른 순간 (다음 단계로 넘어가므로 취소 없음).
  // 다만 다음 단계 결과가 생기지 않고 작업이 실패했으면(DDL 오류 등) 확정하지 않은 것으로 보고 다시 누를 수 있다.
  // 다음 단계 결과(이 명세로 만든 ERD 버전·최종본)가 있으면 이 브라우저에 기록이 없어도(다른 PC 등) 확정한 것으로 본다.
  // 최종 산출물은 최종본(v<ERD>.1)이 만들어진 때
  const finalRecord = versions.find((v) => v.design_version === targets.final && v.stage === 'final')
  const erdRecord = targets.erd !== targets.spec ? versions.find((v) => v.design_version === targets.erd) : undefined
  const pressed = (stage: 'spec' | 'erd', source: string, next?: VersionRecord) => {
    const at = finalizedOf(route.project, stage === 'spec' ? targets.spec : targets.erd, stage, route.version, draft)
    if (next) return at ?? next.created_at
    return at && myJob?.source === source && myJob.status !== 'failed' ? at : undefined
  }
  // 팀장 수정 지시: 이 단계로 돌려보낸 지시 중 아직 새 버전으로 고치지 않은 것 (지시 뒤에 같은 단계 버전이 생기면 처리된 것)
  // 이 화면에서 처리할 팀장 수정 지시 (기능 명세: 그 기능 명세 / ERD: 지시를 처리할 ERD 버전)
  const request = useMemo(() => {
    if (route.page !== 'spec' && route.page !== 'erd') return undefined
    const page = route.page
    const d = directives.find((x) => page === 'spec' ? x.targets.includes('spec') && x.spec_version === route.version && !x.spec_done
      : x.erd_version === route.version && !x.erd_waiting)
    return d ? { version: d.final, by: d.by ?? { id: 0, name: '팀장', role: 'lead' }, at: d.at, comment: d.comment,
      items: d.items.filter((i) => i.stage === page) } : undefined
  }, [directives, route.page, route.version])
  // 이 기능 명세 계보에서 팀장이 승인한 최종본 (기능 명세·ERD 화면에 알린다: 고치면 새 버전 → 다시 승인)
  const approvedFinal = versions.find((v) => v.stage === 'final' && v.approval?.decision === 'approve'
    && specOf(versions, v.design_version) === targets.spec)
  const finalized = {
    spec: pressed('spec', 'spec', erdRecord),
    erd: pressed('erd', 'review', finalRecord),
    final: finalRecord?.created_at,
  }
  // 기능 명세 화면에서 새로 답한 확인 질문: 있으면 'AI로 답 반영 → 기능 명세 다시'를 쓸 수 있다
  const answered = Object.keys(newAnswers(design, draft.state)).length
  // ERD 최종 확정 → 최종본 v<ERD>.1 (지적 처리를 남기고 DDL 검증·추적 검토·API 설계)
  const reviewJob = myJob?.source === 'review' ? myJob : undefined
  const startReview = () => {
    draft.finalize('erd')
    startReviewJob(route.project, targets.erd, draft.state.dispositions ?? {}, shell.onReloadProjects)
      .catch((e) => setSavedNote(`최종 확정을 시작하지 못함: ${(e as Error).message}`))
  }
  // 기능 명세는 내보낸 뒤에도 고쳐서 다시 내보낼 수 있다: 고친 명세를 새 기능 명세 버전(v2)으로 남기고 그 ERD(v2.1)를 만든다
  // (앞 ERD를 이어받아 바뀐 기능의 테이블만 다시 설계). 내보낸 뒤 고친 것이 없으면 같은 ERD를 또 만들지 않게 버튼을 끈다
  // (이 브라우저에 내보낸 기록이 없어도 이 기능 명세로 만든 ERD가 있으면 고친 것이 있을 때만)
  const exportedAt = draft.finalizedAt('spec')
  const specChanged = exportedAt ? (draft.state.updatedAt ?? '') > exportedAt : !erdRecord || Boolean(draft.state.updatedAt)
  // 확정 버튼을 켜는 조건: 필수 항목을 모두 해결 + 진행 중 작업 없음 (ERD는 저장하지 않은 테이블 수정도 없어야 함)
  // 파트장의 확정은 파트원의 '수정 완료 승인 요청'이 있어야 켜진다 (팀장은 요청 없이). 서버도 같은 규칙으로 막는다
  const asked = Boolean(draft.request) || me.role === 'lead'
  const WAITING = "파트원의 '수정 완료 승인 요청'을 기다리는 중입니다 (요청이 오면 켜집니다)"
  const specReady = !running && perm.specConfirm && asked && (specSummary?.requiredLeft ?? 1) === 0 && specChanged
  const erdReady = !running && !lockedBy && perm.erdConfirm && asked && draft.editedEntities === 0 && (erdSummary?.requiredLeft ?? 1) === 0
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
        blockReason={running && myJob?.source === 'answers'
          ? '확인 질문 답을 반영해 기능 명세를 다시 만드는 중입니다. 끝난 뒤 새 버전에서 확정하세요.'
          : erdRecord && specChanged
            ? "내보낸 뒤 고친 내용이 있습니다. '내보내기 → ERD 만들기'를 다시 누르면 새 기능 명세 버전과 그 ERD를 만듭니다 (앞 ERD를 이어받아 바뀐 기능의 테이블만 다시 설계)."
            : undefined} />
    : route.page === 'erd'
      ? <ErdEditor draft={draft} items={erdItems} focus={route.focus} onFocus={setFocus} finalizedAt={finalized.erd} version={route.version}
          onOpenFunction={(id) => open('spec', id)}
          blockReason={draft.editedEntities > 0
            ? `저장하지 않은 테이블 수정 ${draft.editedEntities}건이 있습니다. 'ERD 저장하고 새 버전 만들기'로 만든 새 버전에서 확정하세요.`
            : running && myJob?.source !== 'review' ? '이 기능 명세로 새 ERD를 만드는 중입니다. 끝난 뒤 새 버전에서 확정하세요.' : undefined} />
      : route.page === 'final'
        ? <FinalView design={design} project={route.project} version={route.version} record={record} finalized={finalized}
            onOpenEntity={(id) => open('erd', id)} onOpenDevSpec={(name) => open('dev-spec', name)}
            review={reviewJob && [reviewJob.base, reviewJob.new_version].includes(route.version) ? reviewJob : undefined}
            canDecide={perm.final} onDecided={shell.onReloadProjects}
            previous={versions.filter((v) => v.stage === 'final' && v.design_version !== route.version && v.approval?.decision === 'changes'
              && v.approval.at < (record?.created_at ?? '')).sort((a, b) => b.approval!.at.localeCompare(a.approval!.at))[0]} />
        : <DocsView page={route.page} design={draft.merged} saved={design} project={route.project} version={route.version}
            versionRecord={record} versions={versions} finalizedAt={finalized.final} focus={route.focus} onOpen={open} />

  // 기능 명세 버튼은 내보내기 전후가 같다: 내보낸 뒤 고친 것도 다시 내보내 최신 ERD에 이어서 반영한다
  const actions = route.page === 'spec' ? (
    <>
      {perm.specEdit && <ResetButton draft={draft} />}
      {perm.specEdit && (
        <Button icon={<FloppyDisk />} onClick={() => { const ok = draft.saveNow(); setSavedNote(ok ? `임시저장함 ${formatDate(new Date().toISOString()).slice(-5)}` : '저장 실패') }}
          title="지금 편집·체크를 서버에 저장해 같은 파트 회원과 함께 봅니다 (내보내기 아님)">임시저장</Button>
      )}
      {/* 새 답은 내보낼 때 코드로 반영된다. LLM으로 답이 바꾼 기능을 다시 쓰거나 의견으로 기능 명세 새 버전을 만들 때만 (토큰 사용) */}
      {answered > 0 ? (
        <Button icon={<ArrowsClockwise />} disabled={running || !perm.specEdit} onClick={() => setDialog('answers')}
          title={perm.specEdit ? 'LLM이 답이 바꾼 기능을 다시 설계해 기능 명세 새 버전을 만듭니다 (토큰 사용)' : NEEDS.spec_edit}>
          답 {answered}건 AI로 반영 → 기능 명세 다시
        </Button>
      ) : (
        <Button icon={<ArrowsClockwise />} disabled={running || !perm.specEdit} onClick={() => setDialog('redo')}
          title={perm.specEdit ? '수정·의견으로 기능 명세 새 버전을 만듭니다 (고친 기능은 그대로, 의견이 있을 때만 LLM)' : NEEDS.spec_edit}>
          기능 명세 다시 만들기 (새 버전)
        </Button>
      )}
      {/* 파트원: 확정 대신 파트장에게 승인 요청 / 파트장·팀장: 요청을 받은 뒤 내보내기(확정) */}
      {!perm.specConfirm && perm.specEdit ? (
        <RequestButton draft={draft} ready={!running && (specSummary?.requiredLeft ?? 1) === 0}
          reason={running ? '작업이 끝난 뒤 요청하세요' : `필수 확인 항목 ${specSummary?.requiredLeft ?? ''}개를 먼저 해결하세요`} />
      ) : (
      <Button variant={specReady ? 'ok' : 'secondary'} icon={<PaperPlaneTilt />} disabled={!specReady} onClick={() => setDialog('spec')}
        title={!perm.specConfirm ? NEEDS.spec_confirm
          : !asked ? WAITING
          : (specSummary?.requiredLeft ?? 1) > 0 ? `필수 확인 항목 ${specSummary?.requiredLeft ?? ''}개를 먼저 해결하세요`
          : !specChanged ? '마지막으로 내보낸 뒤 고친 것이 없습니다'
          : erdRecord ? `고친 기능 명세를 새 기능 명세 버전으로 남기고 그 ERD를 만듭니다 (ERD v${targets.erd}를 이어받아 바뀐 기능의 테이블만)`
          : '기능 명세를 확정하고 이 명세로 ERD를 만듭니다'}>
        내보내기 → ERD 만들기
      </Button>
      )}
    </>
  ) : route.page === 'erd' ? (
    <>
      {!finalized.erd && perm.erdEdit && !lockedBy && <ResetButton draft={draft} />}
      <Button icon={<FloppyDisk />} disabled={running || !perm.erdEdit || Boolean(lockedBy)} onClick={() => setDialog('erd')}
        title={lockReason || (perm.erdEdit ? undefined : NEEDS.erd_edit)}>ERD 저장하고 새 버전 만들기</Button>
      {finalized.erd
        ? <Button variant="primary" icon={<ArrowRight />} onClick={() => open('final')}>최종 산출물 보기</Button>
        : !perm.erdConfirm && perm.erdEdit
          ? <RequestButton draft={draft} ready={!running && !lockedBy && draft.editedEntities === 0 && (erdSummary?.requiredLeft ?? 1) === 0}
              reason={lockReason || running ? lockReason || '작업이 끝난 뒤 요청하세요'
                : draft.editedEntities ? `저장하지 않은 테이블 수정 ${draft.editedEntities}건을 먼저 'ERD 저장하고 새 버전 만들기'로 저장하세요 (새 버전에서 요청)`
                : `필수 확인 항목 ${erdSummary?.requiredLeft ?? ''}개를 먼저 해결하세요`} />
          : <ConfirmErdButton ready={erdReady} left={erdSummary?.requiredLeft ?? 0} unsaved={draft.editedEntities} onConfirm={startReview}
              denied={lockReason || (perm.erdConfirm ? (asked ? undefined : WAITING) : NEEDS.erd_confirm)} />}
    </>
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
            : <SaveIndicator status={draft.save} edited={edited} note={savedNote} sync={draft.sync} onReload={draft.reloadServer} />}
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
          page={route.page}
          log={route.page === 'spec' || route.page === 'erd' ? draft.log : undefined}
        />
      }
    >
      <p className="sr-only">v{route.version} · {formatDate(design.meta.generated_at)} 생성</p>
      <StageStepper page={route.page} version={route.version} targets={targets} finalized={finalized}
        decision={finalRecord?.approval} onGo={(p) => open(p)} />
      {/* 나에게 온 알림 (이 프로젝트, 내 역할): 수정 지시·기능 명세 대기·승인 요청·승인 대기 */}
      {notices.length > 0 && (
        <ul aria-label="알림" className="mb-4 space-y-1">
          {notices.map((n, i) => (
            <li key={i}>
              <button type="button" onClick={() => shell.navigate({ name: 'workspace', project: n.project, version: n.version, page: n.page })}
                className={cx('flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-3 py-1.5 text-left text-small hover:opacity-85',
                  n.kind === 'waiting' ? 'bg-sunken text-fg-2' : n.kind === 'request' || n.kind === 'decide' ? 'bg-info-soft text-info' : 'bg-warn-soft text-warn')}>
                <BellSimple size={14} aria-hidden="true" />
                <span className="font-medium">{n.title}</span>
                {n.detail && <span className="text-fg-3">{n.detail}</span>}
                <span className="ml-auto text-micro text-fg-3 tabular-nums">{formatDate(n.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lockReason && (
        <p role="note" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-sunken px-4 py-3 text-label text-fg-2">
          <LockSimple size={18} aria-hidden="true" />
          <span className="min-w-0 flex-1">{lockReason}</span>
          {lockedBy?.erd_version && <Button size="sm" icon={<ArrowRight />} onClick={() => shell.navigate({ ...route, version: lockedBy.erd_version!, focus: undefined })}>새 ERD v{lockedBy.erd_version} 열기</Button>}
        </p>
      )}
      {myJob && (route.page === 'erd' || (route.page === 'spec' && myJob.source === 'answers') || (route.page === 'final' && myJob.source === 'review'))
        && <JobPanel job={myJob} project={route.project} onOpen={openJobVersion} current={route.version} />}
      {approvedFinal && (route.page === 'spec' || route.page === 'erd') && (
        <p role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-ok/40 bg-ok-soft px-4 py-3 text-label text-ok">
          <SealCheck size={18} weight="fill" className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold">최종 승인된 프로젝트입니다</strong> (최종본 v{approvedFinal.design_version} · {approvedFinal.approval!.by.name} · {formatDate(approvedFinal.approval!.at)})
            <span className="block text-small text-fg-3">여기서 고치면 새 버전이 되고, 다시 확정·승인을 받아야 합니다.</span>
          </span>
          <Button size="sm" icon={<ArrowRight />} onClick={() => shell.navigate({ ...route, page: 'final', version: approvedFinal.design_version, focus: undefined })}>승인된 최종본 보기</Button>
        </p>
      )}
      {draft.request && (route.page === 'spec' || route.page === 'erd') && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-info/40 bg-info-soft px-4 py-3 text-label text-info">
          <PaperPlaneTilt size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">{draft.request.by.name}님이 수정 완료 승인을 요청했습니다</strong> ({formatDate(draft.request.at)})
            {draft.request.note && <span className="block text-fg">{draft.request.note}</span>}
            <span className="block text-small text-fg-3">
              {(route.page === 'spec' ? perm.specConfirm : perm.erdConfirm)
                ? `오른쪽 '변경 내역'과 고친 항목을 확인하고 ${route.page === 'spec' ? "'내보내기 → ERD 만들기'" : "'ERD 최종 확정하기'"}를 누르세요.`
                : '파트장이 확인하고 확정합니다. 지금 다시 고치면 요청이 취소됩니다.'}
            </span>
          </span>
        </p>
      )}
      {request && (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-label text-warn">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">팀장 수정 지시</strong> (최종본 v{request.version} · {request.by.name} · {formatDate(request.at)})
            {request.comment && <span className="block text-fg">{request.comment}</span>}
            {request.items.length > 0 && (
              <span className="mt-1 flex flex-col gap-0.5">
                {request.items.map((i) => (
                  <button key={i.target_id} type="button" onClick={() => setFocus(i.target_id)}
                    className="text-left text-small text-fg underline decoration-warn/40 underline-offset-4 hover:decoration-warn">
                    <span className="font-mono text-micro text-fg-3">{i.target_id}</span> {i.label}{i.note && ` — ${i.note}`}
                  </button>
                ))}
              </span>
            )}
            <span className="block text-small text-fg-3">
              {route.page === 'spec' ? "기능 명세를 고친 뒤 '내보내기 → ERD 만들기'로 새 버전을 만들고 다시 최종 확정하세요."
                : "ERD를 고친 뒤 'ERD 저장하고 새 버전 만들기' → 'ERD 최종 확정하기'로 새 최종본을 만드세요."}
            </span>
          </span>
        </p>
      )}
      {center}
      {dialog && (
        <SaveVersionDialog
          mode={dialog === 'erd' ? 'erd' : 'spec'}
          aiAnswers={dialog === 'answers'}
          redo={dialog === 'redo'}
          open
          onClose={() => setDialog(null)}
          draft={draft}
          design={design}
          project={route.project}
          version={route.version}
          // 내보내기를 시작한 순간 기능 명세를 확정한다 (다음 단계로 넘어가므로 취소 없음)
          onStarted={(kind) => { if (dialog === 'spec' && kind === 'erd') { draft.finalize('spec'); open('erd') } }}
          onFinished={shell.onReloadProjects}
        />
      )}
    </Shell>
  )
}

/** 파트원의 '수정 완료 승인 요청': 필수 항목을 다 하면 켜지고, 메모(선택)를 붙여 파트장에게 보낸다. 요청한 뒤 다시 고치면 서버가 취소한다 */
function RequestButton({ draft, ready, reason }: { draft: Draft; ready: boolean; reason: string }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const send = async () => {
    setSending(true)
    setError('')
    try {
      await draft.requestReview(note)
      setOpen(false)
      setNote('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }
  if (open) {
    return (
      <span role="group" aria-label="승인 요청 보내기" className="flex flex-wrap items-center gap-1.5 rounded-md border border-ok/40 bg-ok-soft py-1 pr-1 pl-2">
        <input aria-label="파트장에게 남길 메모 (선택)" placeholder="메모 (선택)" value={note} maxLength={500}
          onChange={(e) => setNote(e.target.value)} className="min-h-8 w-48 rounded-sm border border-control bg-card px-2 text-small" />
        <Button size="sm" variant="ok" disabled={sending} onClick={() => void send()}>{sending ? '보내는 중…' : '요청 보내기'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
        {error && <span role="alert" className="text-small text-danger">{error}</span>}
      </span>
    )
  }
  return (
    <Button variant={ready ? 'ok' : 'secondary'} icon={<PaperPlaneTilt />} disabled={!ready} onClick={() => setOpen(true)}
      title={ready ? (draft.request ? `${draft.request.by.name}님이 이미 요청했습니다. 다시 보내면 새 요청으로 바뀝니다` : '파트장에게 이 수정을 확인하고 확정해 달라고 요청합니다') : reason}>
      {draft.request ? '승인 요청됨 · 다시 보내기' : '수정 완료 승인 요청'}
    </Button>
  )
}

/**
 * ERD 화면의 'ERD 최종 확정하기': 필수 항목(의미 검토 지적 처리 포함)을 다 해결하면 초록색으로 켜진다.
 * 누르면 한 번 더 묻고 최종본(v<ERD>.1)을 만든다 (POST /projects/review). 확정은 취소할 수 없다.
 */
function ConfirmErdButton({ ready, left, unsaved, onConfirm, denied }: { ready: boolean; left: number; unsaved: number; onConfirm: () => void; denied?: string }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <span role="group" aria-label="ERD 최종 확정 확인" className="flex items-center gap-1.5 rounded-md border border-ok/40 bg-ok-soft py-1 pr-1 pl-3 text-small text-ok">
        확정하면 취소할 수 없고 최종본을 만듭니다. 확정할까요?
        <Button size="sm" variant="ok" onClick={() => { setConfirming(false); onConfirm() }}>확정하기</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>취소</Button>
      </span>
    )
  }
  return (
    <Button variant={ready ? 'ok' : 'secondary'} icon={<SealCheck />} disabled={!ready} onClick={() => setConfirming(true)}
      title={denied ?? (ready ? 'DDL을 검증하고 최종본(ERD·DDL·산출물·개발 스펙)을 만듭니다'
        : unsaved ? `저장하지 않은 테이블 수정 ${unsaved}건을 먼저 저장하세요` : `필수 확인 항목 ${left}개를 먼저 해결하세요`)}>
      ERD 최종 확정하기
    </Button>
  )
}

/** 다른 버전의 확정 여부는 그 버전의 초안 기록에서 읽는다 (지금 버전은 화면의 상태를 쓴다) */
/** 단계 버전의 확인 항목 요약. 지금 보는 버전이면 편집 중인 항목, 아니면 그 버전의 design.json과 이 브라우저에 저장된 초안으로 센다 */
function useStageSummary(stage: 'spec' | 'erd', project: string, version: string, current: string, currentItems: ReviewItem[], pulled: number) {
  const other = useDesign(project, version)
  return useMemo(() => {
    if (version === current) return summarize(currentItems)
    if (other.state !== 'ready') return null
    const saved = readDraft(project, version)
    return summarize(stage === 'spec'
      ? specReview(other.data, mergedFunctions(other.data, saved), saved)
      : erdReview(other.data, mergedEntities(other.data, saved), saved))
    // pulled: 서버에서 다른 버전 초안을 받아 온 뒤 다시 센다
  }, [stage, project, version, current, currentItems, other, pulled])
}

function finalizedOf(project: string, version: string, page: ConfirmStage, current: string, draft: Draft): string | undefined {
  if (version === current) return draft.finalizedAt(page)
  return readStore<DraftState>(`draft:${project}@v${version}`)?.finalized?.find((f) => f.page === page)?.at
}

/** 저장 상태: 이 브라우저 사본과 서버(함께 고치는 초안). 다른 사람이 먼저 저장했으면 다시 불러오기 */
function SaveIndicator({ status, edited, note, sync, onReload }: {
  status: SaveStatus; edited: number; note?: string; sync: DraftSync; onReload: () => void
}) {
  const by = sync.by ? ` · ${sync.by}${sync.at ? ` ${formatDate(sync.at).slice(-5)}` : ''}` : ''
  if (sync.status === 'conflict') {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-1.5 text-danger">
        <WarningCircle size={14} aria-hidden="true" />{sync.message}
        <Button size="sm" onClick={onReload}>다시 불러오기</Button>
      </p>
    )
  }
  return (
    <p aria-live="polite" className="flex items-center gap-1.5">
      {note && status === 'saved' && <span className="mr-1 font-medium text-ok">{note} ·</span>}
      {(status === 'saving' || sync.status === 'saving') && <><CircleNotch size={14} className="animate-spin" aria-hidden="true" />저장 중…</>}
      {status === 'saved' && sync.status !== 'saving' && (
        sync.status === 'readonly' ? <span className="text-fg-3">보기 전용 (이 단계를 고칠 권한 없음){edited ? ` · 수정 ${edited}건${by}` : ''}</span>
        : sync.status === 'error' ? <span className="flex items-center gap-1.5 text-warn"><WarningCircle size={14} aria-hidden="true" />서버에 저장 못 함 — 이 브라우저에만 있음 ({sync.message})</span>
        : sync.status === 'loading' ? <span className="text-fg-3">서버 초안을 읽는 중…</span>
        : edited ? <><CheckCircle size={14} className="text-ok" aria-hidden="true" />수정 {edited}건 · 서버에 저장됨{by}</>
        : <>원본 초안 그대로</>)}
      {status === 'unsaved' && <span className="flex items-center gap-1.5 text-danger"><WarningCircle size={14} aria-hidden="true" />이 브라우저에 저장 안 됨</span>}
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
