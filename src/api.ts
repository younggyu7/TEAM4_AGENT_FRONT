import type { Design, FunctionSpec, Project } from './types'

export type Version = string | number

// FastAPI 백엔드(TEAM4_AGENT/backend)의 /api/v1. 개발 중에는 Vite proxy가 로컬 서버(127.0.0.1:8000)로 넘긴다.
// 백엔드를 다른 주소에 두면 VITE_API_BASE에 전체 주소를 적는다 (예: https://api.example.com/api/v1).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api/v1'

/** API 경로 → 요청 주소 (링크·다운로드처럼 fetch 밖에서 쓸 때) */
export const apiUrl = (path: string) => BASE + path

/** API 오류: 상태 코드도 함께 (401 = 로그인 필요, 403 = 권한 없음, 409 = 다른 사람이 먼저 저장 등) */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/** 로그인 세션이 끝났을 때(401) 화면이 로그인으로 돌아가도록 알린다 (로그인 요청 자체는 빼고) */
export const AUTH_EXPIRED = 'auth:expired'

async function request(path: string, init?: RequestInit): Promise<Response> {
  // 세션은 httpOnly 쿠키라 같은 출처 요청에 저절로 실린다 (Vite proxy). 다른 주소의 백엔드면 credentials가 필요하다
  const res = await fetch(apiUrl(path), { credentials: 'include', ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: string } | null
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(AUTH_EXPIRED))
    throw new ApiError(body?.detail ?? `요청 실패 (${res.status})`, res.status)
  }
  return res
}

/* ------------------------------------------------------------ 회원·권한 */
/** 역할 권한 (백엔드 app/core/auth.py PERMISSIONS와 같은 이름) */
export type Permission = 'upload' | 'spec_edit' | 'spec_confirm' | 'erd_edit' | 'erd_confirm' | 'final_decide' | 'develop' | 'code_edit'

export interface Member {
  id: number
  email: string
  name: string
  role: string
  role_label: string
  requested_role: string
  is_admin: boolean
  status: 'pending' | 'active' | 'disabled'
  created_at: string
  /** Slack 멤버 ID (U…). 프로젝트 Slack 채널에 초대하고 알림에서 @멘션할 때 쓴다 (비우면 초대·멘션 안 함) */
  slack_id: string
  permissions: Permission[]
}

/** 끝나지 않은 팀장 수정 지시와 진행 (서버 services/directives.py가 계산). 기능 명세가 대상이면 기능 명세 먼저,
 * ERD 항목은 새 기능 명세의 ERD(erd_version)가 생긴 뒤 그 ERD에서 처리한다. 그동안 옛 ERD는 잠긴다 */
export interface Directive {
  project: string
  final: string
  at: string
  by: { id: number; name: string; role: string } | null
  comment: string
  targets: ('spec' | 'erd')[]
  items: (ChangeItem & { resolution: { choice: 'applied' | 'kept'; note: string; by: { name: string }; at: string } | null })[]
  spec_version: string
  spec_done: boolean
  new_spec: string | null
  erd_version: string | null
  erd_waiting: boolean
}

/** 나에게 온 알림: 수정 지시·기능 명세 대기·승인 요청·승인 대기 (역할별), 반려 (내가 요청했거나 고친 초안, 다시 요청할 때까지) */
export interface Notice {
  /** 확인할 때 쓰는 ID */
  id: string
  project: string
  /** 상태 알림(수정 지시·대기·승인 요청·승인 대기·개발 대기·반려) / 일 알림(업로드 분석 완료·ERD 초안·개발 초안) */
  kind: 'directive' | 'waiting' | 'request' | 'decide' | 'develop' | 'rejected' | 'uploaded' | 'erd_draft' | 'developed'
  at: string
  page: 'spec' | 'erd' | 'final' | 'develop'
  version: string
  title: string
  detail: string
}

export async function getDirectives(project: string): Promise<Directive[]> {
  return ((await (await request(`/projects/directives?${query({ project })}`)).json()) as { directives: Directive[] }).directives
}

export async function resolveDirective(body: { project: string; final: string; stage: 'spec' | 'erd'; target_id: string; choice: 'applied' | 'kept' | ''; note: string }): Promise<void> {
  await post('/projects/directives/resolve', body)
}

export async function getNotices(): Promise<Notice[]> {
  return ((await (await request('/notices')).json()) as { notices: Notice[] }).notices
}

/** 알림 확인: 나에게서만 지운다 */
export async function dismissNotice(project: string, id: string): Promise<void> {
  await post('/notices/dismiss', { project, id })
}

/* ------------------------------------------------------------ 최종 개발하기·미리보기·git (승인한 최종본) */
/** 개발 전 예상: 화면·파일 수, 백엔드를 만드는지, AI로 업무 로직까지 채울 때 예상 토큰·비용 (LLM 없음) */
export interface DevelopPlan {
  version: string
  stack: string
  backend: boolean
  menus: number
  screens: number
  autos: number
  files: number
  logic: { functions: number; cached: number; stale: number; input_tokens: number; output_tokens: number; cost: Record<string, number> }
  /** 개발할 세 층과 개발 틀이 없는 층 (있으면 AI가 뼈대부터 → 비용 더 듦) */
  parts: Record<StackLayer, string>
  /** 최종 개발하기를 하지 않는 스택이면 그 안내 (예: Oracle — 설계 산출물까지만) */
  blocked: string
  untemplated: { layer: StackLayer; name: string; label: string }[]
  warning: string
  /** AI 업무 기능 구현(--build) 예상: 구현할 기능 수, 이미 만든 기능(0원), 입력 토큰, effort별 출력 토큰 */
  build: { functions: number; cached: number; input_tokens: number; output_tokens: Record<string, number>
    /** 개발 틀이 없는 층을 AI가 뼈대부터 만들 때 (위 합계에 포함, 뼈대 출력은 실측 전 가정) */
    scratch?: { layers: string[]; skeletons: number; functions: number; input_tokens: number; output_tokens: number } }
}

export async function getDevelopPlan(project: string, version: string): Promise<DevelopPlan> {
  return (await (await request(`/develop/plan?${query({ project, version })}`)).json()) as DevelopPlan
}

export interface ThemeChoice { id: string; name: string; note: string
  preview: { bg: string; side: string; side_ink: string; accent: string; accent_ink: string; cover: string; mark: string } }

export async function getThemes(): Promise<{ themes: ThemeChoice[]; default: string }> {
  return (await (await request('/develop/themes')).json()) as { themes: ThemeChoice[]; default: string }
}

/** build: 기능 전체 AI · logic: 빈 로직만 AI · 둘 다 false: AI 안 씀. theme: 화면 스타일 */
export async function startDevelop(project: string, version: string,
  ai: { build: boolean; logic?: boolean; model?: string; effort?: string; theme?: string }): Promise<Job> {
  return ((await (await post('/develop', { project, version, ...ai })).json()) as { job: Job }).job
}

/** 미리보기 안내 페이지 주소 (새 탭으로 연다: 실행 미리보기를 켜고 준비되면 앱 화면으로) */
export const previewUrl = (project: string) => apiUrl(`/preview/${encodeURIComponent(project)}/`)

export interface PreviewStatus {
  status: 'stopped' | 'building' | 'starting' | 'running' | 'failed' | 'no_backend'
  message: string
  port: number | null
  stale: boolean
  backend: boolean
  mock: boolean
  docker: boolean
  log: string[]
  /** 실행 중일 때 마지막으로 쓴 뒤 지난 초 (idle_limit이 되면 꺼짐) */
  idle_seconds: number | null
  idle_limit: number
}

/** 앱이 처음 뜰 때 만든 시연 계정 (개발 파트원·파트장·팀장만) */
export interface PreviewAccount { loginId: string; role: string; password: string }

export async function getPreviewAccounts(project: string): Promise<PreviewAccount[]> {
  return ((await (await request(`/preview/${encodeURIComponent(project)}/accounts`)).json()) as { accounts: PreviewAccount[] }).accounts
}

/** 실행 중인 앱 주소: 우리 도구에 들어온 주소에 앱 포트 (팀원 PC에서도 같은 주소로 연다) */
export const appUrl = (port: number) => `${window.location.protocol}//${window.location.hostname}:${port}/`

export async function getPreviewStatus(project: string): Promise<PreviewStatus> {
  return (await (await request(`/preview/${encodeURIComponent(project)}/status`)).json()) as PreviewStatus
}

export async function stopPreview(project: string): Promise<PreviewStatus> {
  return (await (await post(`/preview/${encodeURIComponent(project)}/stop`, {})).json()) as PreviewStatus
}

/** 최종 개발물 코드 폴더의 파일 (빈 업무 로직·사람이 고친 파일 표시) */
export interface AppFile { path: string; size: number; generated: boolean; edited: boolean; holes: number; empty_holes: number
  /** 빈 로직만 AI가 채운 자리 수, 기능 전체 AI(또는 AI 뼈대)가 쓴 파일인지 */
  ai_holes: number; ai_file: boolean }
export interface AppFileTree { files: AppFile[]; holes: number; empty_holes: number; edited: number; ai_holes: number; ai_files: number }
export interface AppFileContent extends AppFile { content: string; hole_list: { name: string; line: number; empty: boolean; ai: boolean }[] }

export async function getAppFiles(project: string): Promise<AppFileTree> {
  return (await (await request(`/develop/files?${query({ project })}`)).json()) as AppFileTree
}

export async function getAppFile(project: string, path: string): Promise<AppFileContent> {
  return (await (await request(`/develop/file?${query({ project, path })}`)).json()) as AppFileContent
}

export async function saveAppFile(project: string, path: string, content: string): Promise<AppFileContent> {
  const res = await request('/develop/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, path, content }) })
  return (await res.json()) as AppFileContent
}

/** 실행 미리보기 터미널: 빌드·실행 명령과 출력 + 앱 서버 로그 */
export interface PreviewTerminal { status: PreviewStatus['status']; message: string; log: string[]; app_log: string[] }

export async function getPreviewTerminal(project: string): Promise<PreviewTerminal> {
  return (await (await request(`/preview/${encodeURIComponent(project)}/terminal`)).json()) as PreviewTerminal
}

export interface GitSide { url: string; branch: string; has_token: boolean }
export type GitSettings = Record<'frontend' | 'backend', GitSide>

export async function getGitSettings(project: string): Promise<GitSettings> {
  return (await (await request(`/develop/git?${query({ project })}`)).json()) as GitSettings
}

export async function saveGitSettings(project: string, body: Record<'frontend' | 'backend', { url: string; branch: string; token: string }>): Promise<GitSettings> {
  return (await (await post('/develop/git', { project, ...body })).json()) as GitSettings
}

export async function pushGit(project: string, version: string): Promise<Job> {
  return ((await (await post('/develop/git/push', { project, version })).json()) as { job: Job }).job
}

/** 화면 / 백엔드 / DB 고르기 칸 (supported=false는 '지원 예정': 최종 개발하기가 아직 못 만듦) */
export type StackLayer = 'frontend' | 'backend' | 'database'
/** supported = 개발 틀 있음 (없어도 고를 수 있다: 최종 개발 때 AI가 뼈대부터 → 비용 더 듦) */
export type StackCatalog = Record<StackLayer, { id: string; label: string; supported: boolean; develop?: boolean }[]>

/** 버전의 기술 스택 상태: 원문(원문이 정함) · 확정(기능 명세에서 고름) · 미정 · 없음 */
export interface StackStatus {
  basis: '원문' | '확정' | '미정' | '없음'
  stack: string
  parts: Partial<Record<StackLayer, string>>
  untemplated: { layer: StackLayer; name: string; label: string }[]
  warning: string
}

export async function getStackStatus(project: string, version: string): Promise<StackStatus> {
  return (await (await request(`/projects/stack?${query({ project, version })}`)).json()) as StackStatus
}

export async function getStackCatalog(): Promise<StackCatalog> {
  return ((await (await request('/tech-stacks')).json()) as { catalog: StackCatalog }).catalog
}

export async function setTechStackParts(project: string, version: string, parts: Record<'frontend' | 'backend' | 'database', string>): Promise<void> {
  await post('/projects/tech-stack', { project, version, parts })
}

/** 수정 지시가 돌려보낸 단계 (예전 기록은 target 하나) */
export const targetsOf = (a: Approval): ('spec' | 'erd')[] => a.targets?.length ? a.targets : a.target ? [a.target] : []

export async function getMe(): Promise<Member> {
  return ((await (await request('/auth/me')).json()) as { user: Member }).user
}

export async function login(email: string, password: string, remember: boolean): Promise<Member> {
  return ((await (await post('/auth/login', { email, password, remember })).json()) as { user: Member }).user
}

export async function logout(): Promise<void> {
  await post('/auth/logout', {})
}

export async function signup(body: { email: string; name: string; password: string; requested_role?: string; slack_id?: string }): Promise<{ user: Member; pending: boolean }> {
  return (await (await post('/auth/signup', body)).json()) as { user: Member; pending: boolean }
}

export async function getRoles(): Promise<{ id: string; label: string }[]> {
  return ((await (await request('/auth/roles')).json()) as { roles: { id: string; label: string }[] }).roles
}

export async function listMembers(): Promise<Member[]> {
  return ((await (await request('/users')).json()) as { users: Member[] }).users
}

/** 업로드 화면에서 Slack 채널에 초대할 담당자 고르기: 승인된 회원 (Slack 멤버 ID가 있는지만) */
export interface PickMember { id: number; name: string; role: string; role_label: string; has_slack: boolean }

/** 승인된 회원과 Slack 알림이 켜졌는지 (백엔드 .env SLACK_BOT_TOKEN) */
export async function listPickMembers(): Promise<{ members: PickMember[]; slack_enabled: boolean }> {
  const body = (await (await request('/members')).json()) as { members: PickMember[]; slack_enabled?: boolean }
  return { members: body.members, slack_enabled: Boolean(body.slack_enabled) }
}

/** 프로젝트 Slack 채널과 지금 담당자 (토큰은 서버에만, 연결하지 않았으면 null) */
export interface ProjectSlack { team: string; channel_name: string; members: PickMember[] }

/** 담당자 바꾸기 결과: 새로 더한 담당자, 뺀 담당자(채널에서 내보냄), 초대·내보내기 못 한 회원 */
export interface SlackMembersResult { added: string[]; removed: string[]; failed: { name: string; reason: string }[] }

export async function getProjectSlack(project: string): Promise<ProjectSlack | null> {
  return ((await (await request(`/projects/slack?${query({ project })}`)).json()) as { slack: ProjectSlack | null }).slack
}

/** 팀장: 프로젝트 Slack 담당자를 다시 고른다 (members = 새 담당자 전체) */
export async function setSlackMembers(project: string, members: number[]): Promise<{ result: SlackMembersResult; slack: ProjectSlack }> {
  return (await (await post('/projects/slack/members', { project, members })).json()) as { result: SlackMembersResult; slack: ProjectSlack }
}

export async function updateMember(body: { id: number; role?: string; status?: string; is_admin?: boolean; slack_id?: string }): Promise<Member> {
  return ((await (await post('/users/update', body)).json()) as { user: Member }).user
}


export async function createMember(body: { email: string; name: string; password: string; role: string; is_admin?: boolean; slack_id?: string }): Promise<Member> {
  return ((await (await post('/users/create', body)).json()) as { user: Member }).user
}

export async function resetPassword(id: number, password: string): Promise<void> {
  await post('/users/password', { id, password })
}

/* ------------------------------------------------------------ 수정 초안 공유·팀장 결정 */
type Who = { id: number; name: string; role: string }

/** 변경 내역 한 묶음: 누가·언제·무엇을 (서버가 저장할 때 이전 초안과 비교해 남긴다). event: 승인 요청·취소·반려·확정 */
export interface DraftLogEntry {
  by: Who
  at: string
  event?: 'request' | 'request_cancelled' | 'request_rejected' | 'confirm'
  changes: { target: string; label: string; what: string }[]
}

/** 파트원의 수정 완료 승인 요청 (파트장의 확정은 이것이 있어야 한다) */
export interface ReviewRequest { by: Who; at: string; note: string }

/** 파트장·팀장의 마지막 반려 (파트원이 다시 요청하거나 확정되면 지운다) */
export interface ReviewRejection { by: Who; at: string; reason: string; request: ReviewRequest }

export interface ServerDraft<T> {
  state: T | null
  rev: number
  updated_at?: string
  updated_by?: Who
  log: DraftLogEntry[]
  request: ReviewRequest | null
  rejection?: ReviewRejection | null
}

export async function getDraft<T>(project: string, version: string): Promise<ServerDraft<T>> {
  return (await (await request(`/drafts?${query({ project, version })}`)).json()) as ServerDraft<T>
}

export async function requestReview(project: string, version: string, note: string): Promise<{ request: ReviewRequest; log: DraftLogEntry[] }> {
  return (await (await post('/drafts/request', { project, version, note })).json()) as { request: ReviewRequest; log: DraftLogEntry[] }
}

/** 파트장·팀장: 파트원의 승인 요청 반려 (사유 필수, 요청한 파트원에게 Slack으로도 알린다) */
export async function rejectReview(project: string, version: string, reason: string): Promise<{ rejection: ReviewRejection; log: DraftLogEntry[] }> {
  return (await (await post('/drafts/request/reject', { project, version, reason })).json()) as { rejection: ReviewRejection; log: DraftLogEntry[] }
}

export async function saveDraft<T>(project: string, version: string, state: T, rev: number): Promise<Omit<ServerDraft<T>, 'state'>> {
  return (await (await post('/drafts', { project, version, state, rev })).json()) as Omit<ServerDraft<T>, 'state'>
}

/** 수정 지시에서 고른 항목: 어느 단계의 어느 기능·테이블을 어떻게 고칠지 */
export interface ChangeItem { stage: 'spec' | 'erd'; target_id: string; label: string; note: string }

export interface Approval {
  decision: 'approve' | 'changes'
  target: 'spec' | 'erd' | null          // 예전 기록: 돌려보낸 단계 하나
  targets?: ('spec' | 'erd')[]           // 돌려보낸 단계 (둘 다 가능)
  items?: ChangeItem[]
  comment: string
  at: string
  by: { id: number; name: string; role: string }
}

export async function decideFinal(body: { project: string; version: string; decision: 'approve' | 'changes'; targets?: ('spec' | 'erd')[]; items?: ChangeItem[]; comment: string }): Promise<Approval> {
  return ((await (await post('/projects/approval', body)).json()) as { approval: Approval }).approval
}

const query = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

export async function listProjects(): Promise<{ output_dir: string; projects: Project[] }> {
  return (await request('/projects')).json()
}

export async function getDesign(project: string, version: Version): Promise<Design> {
  return normalizeDesign(await (await request(`/design?${query({ project, version })}`)).json())
}

/** 빠진 칸이 있어도 화면이 깨지지 않게 빈 값으로 채운다 (단계가 실패해 데이터 모델이 없는 버전 등) */
export function normalizeDesign(d: Partial<Design> & Pick<Design, 'meta'>): Design {
  return {
    ...d,
    requirements: d.requirements ?? [],
    questions: d.questions ?? [],
    functions: d.functions ?? [],
    data_model: { entities: d.data_model?.entities ?? [], relations: d.data_model?.relations ?? [] },
    trace_links: d.trace_links ?? [],
    issues: d.issues ?? [],
    completion: d.completion ?? { satisfied: false, forced: false, actionable: false, checks: [] },
    decisions: d.decisions ?? [],
  }
}

/** 산출물 원문. 파일이 없으면 null. */
export async function getFile(project: string, version: Version, name: string): Promise<string | null> {
  try {
    return await (await request(`/file?${query({ project, version, name })}`)).text()
  } catch {
    return null
  }
}

/** 개발 스펙 문서의 형식 정의 (backend/SPEC_FORMAT.md, 모든 버전에 같다). 없으면 null. */
export async function getSpecFormat(): Promise<string | null> {
  try {
    return await (await request('/spec-format')).text()
  } catch {
    return null
  }
}

const post = (path: string, body: unknown) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export async function setVersionTitle(project: string, version: string, title: string): Promise<void> {
  await post('/projects/title', { project, version, title })
}

/** 개발 스펙의 기술 스택 선택지 (추천 순서) */
export async function getTechStacks(): Promise<{ stack: string; note: string }[]> {
  return ((await (await request('/tech-stacks')).json()) as { choices: { stack: string; note: string }[] }).choices
}

/** 최종본의 기술 스택 확정: 백엔드가 LLM 없이 개발 스펙 10개를 다시 쓰고 design.json·버전 기록에 남긴다 */
export async function setTechStack(project: string, version: string, stack: string): Promise<void> {
  await post('/projects/tech-stack', { project, version, stack })
}

export interface Job {
  id: string
  project: string
  base: string
  // 기능 명세 → ERD / ERD 저장 / 확인 질문 답 반영 → 기능 명세 새 버전 / 문서 업로드 → 기능 명세 초안 / ERD 최종 확정 → 의미 검토
  source: 'spec' | 'erd' | 'answers' | 'run' | 'review' | 'develop' | 'git'
  status: 'running' | 'done' | 'failed'
  message: string
  log: string[]
  new_version?: string
  warnings?: string[]
  started_at: string
  finished_at?: string
}

/** 기준 버전에서 데이터 설계를 다시 만들어 새 버전(v4.1 …)을 만든다. 오래 걸리므로 작업 ID를 받고 getJob으로 확인한다. */
export interface CreateVersionBody {
  project: string
  base: string
  source: 'spec' | 'answers' | 'erd'    // 기능 명세 내보내기 / 기능 명세 새 버전(답이 없어도 수정·의견으로) / ERD 저장
  data_model?: unknown      // 고친 data_model.json (ERD 저장)
  design?: unknown          // 기능 명세 수정본이 들어간 design.json (기능 명세 내보내기)
  functions_md?: string     // Agent에 넘길 기능 명세 Markdown
  spec_summary?: string     // 백엔드가 수정본을 못 받을 때 의견으로 넘길 변경 요약
  answers?: Record<string, string>   // 기능 명세 화면에서 새로 답한 확인 질문 (있으면 ERD 대신 'AI로 답 반영' → 기능 명세 새 버전)
  confirm_rules?: { function_id: string; rule: string }[]   // '추천안 맞음'으로 확인한 '(확인 필요)' 규칙 (내보내기·AI로 답 반영 모두 LLM 없이 '(결정)')
  functions?: FunctionSpec[]    // 기능 명세 새 버전(answers): 사람이 고친 기능 → 고친 그대로 고정
  dispositions?: Dispositions   // ERD 저장: 의미 검토 지적 처리를 새 ERD 버전에 남긴다
  feedback?: string
  title?: string
}

export async function getCapabilities(): Promise<{ design: boolean; spec_md: boolean; confirm_rules: boolean }> {
  return (await request('/capabilities')).json()
}

export async function createVersion(body: CreateVersionBody): Promise<Job> {
  return ((await (await post('/projects/versions', body)).json()) as { job: Job }).job
}

/** ERD 화면에서 정한 의미 검토 지적 처리 (이슈 ID → 처리·메모) */
export type DispositionChoice = 'applied' | 'not_issue' | 'later'
export type Dispositions = Record<string, { choice: DispositionChoice; note: string }>

/** ERD 최종 확정: 지적 처리를 남기고 DDL 검증·추적 검토·API 설계로 최종본(v<ERD>.1)을 만든다 (의미 검토는 다시 하지 않음). */
export async function startReview(project: string, version: string, dispositions?: Dispositions): Promise<Job> {
  return ((await (await post('/projects/review', { project, version, dispositions })).json()) as { job: Job }).job
}

/** 의미 검토 결과 (semantic_review.json). 아직 검토하지 않았으면 getFile이 null */
export interface SemanticReview {
  reviewed_at: string
  scope: string
  parts: string[]
  failed: string[]
  remarks: { issue_id: string; kind: string; label: string; target: string; message: string; evidence: string; suggestion: string; owner: string; status?: string; resolution?: string }[]
  usage: { calls?: number; input_tokens?: number; output_tokens?: number }
}

/** 업로드에서 고를 LLM 모델·생각 수준 (키가 있는 공급자만). effort: 그 모델이 생각 수준을 받는지 */
export interface LlmOptions {
  models: { id: string; label: string; note: string; provider: 'anthropic' | 'openai'; effort: boolean }[]
  efforts: string[]
  default_model: string
  default_effort: string
}

export async function getLlmOptions(): Promise<LlmOptions> {
  return (await (await request('/llm-options')).json()) as LlmOptions
}

/** 업로드 때 만든 프로젝트 Slack 채널: 초대한 담당자와 초대하지 못한 담당자(이유). existing = 이미 있던 채널,
 * error = Slack이 실패함 (분석은 시작했고 서버가 잠시 뒤 다시 만든다) */
export interface SlackConnected {
  team?: string
  channel_name?: string
  invited?: string[]
  failed?: { name: string; reason: string }[]
  existing?: boolean
  error?: string
}

/** 원본 요구서를 올려 기능 명세 초안까지 실행한다 (확인 질문은 추천안으로 가정). 몇 분 걸리므로 작업 ID를 받고 getJob으로 확인한다.
 * model·effort는 이 프로젝트의 ERD 만들기·최종 확정까지 같이 쓴다 (비우면 백엔드 .env). DDL 검증은 항상 한다.
 * Slack이 켜져 있으면(백엔드 .env) 프로젝트 비공개 채널을 만들고 slackMembers(회원 ID)를 초대한다 (Slack이 실패해도 분석은 시작). */
export async function startRun(file: File, opts: { project?: string; title?: string; model?: string; effort?: string; slackMembers?: number[] }): Promise<{ job: Job; slack: SlackConnected | null }> {
  const form = new FormData()
  form.append('file', file)
  if (opts.project?.trim()) form.append('project', opts.project.trim())
  if (opts.title?.trim()) form.append('title', opts.title.trim())
  if (opts.model) form.append('model', opts.model)
  if (opts.effort) form.append('effort', opts.effort)
  if (opts.slackMembers) form.append('slack_members', opts.slackMembers.join(','))
  const body = (await (await request('/runs', { method: 'POST', body: form })).json()) as { job: Job; slack?: SlackConnected | null }
  return { job: body.job, slack: body.slack ?? null }
}

export async function getJob(id: string): Promise<Job> {
  return ((await (await request(`/jobs?id=${encodeURIComponent(id)}`)).json()) as { job: Job }).job
}
