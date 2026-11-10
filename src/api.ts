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
export type Permission = 'upload' | 'spec_edit' | 'spec_confirm' | 'erd_edit' | 'erd_confirm' | 'final_decide' | 'develop' | 'preview_stop' | 'repo_write' | 'app_accounts' | 'assign_members' | 'project_delete' | 'project_rename'

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

/** 끝나지 않은 수정 지시와 진행 (서버 services/directives.py가 계산). 기능 명세가 대상이면 기능 명세 먼저,
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
  /** 상태 알림(수정 지시·대기·승인 요청·승인 대기·개발 대기·반려) / 일 알림(업로드 분석 완료·기능 명세 다시 만듦·ERD 초안·개발 초안) */
  kind: 'directive' | 'waiting' | 'request' | 'decide' | 'develop' | 'rejected' | 'uploaded' | 'spec_redone' | 'erd_draft' | 'developed'
    | 'merge_request' | 'merged' | 'merge_rejected' | 'task_assigned' | 'released' | 'develop_failed'
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

export interface LayoutChoice { id: string; name: string; note: string }
export interface ThemeOptions { themes: ThemeChoice[]; default: string; layouts: LayoutChoice[]; current: { theme: string; layout: string } }

export async function getThemes(project: string): Promise<ThemeOptions> {
  return (await (await request(`/develop/themes?project=${encodeURIComponent(project)}`)).json()) as ThemeOptions
}

/** build: 기능 전체 AI · logic: 빈 로직만 AI · 둘 다 false: AI 안 씀. theme·layout: 화면 색·형태 */
export async function startDevelop(project: string, version: string,
  ai: { build: boolean; logic?: boolean; model?: string; effort?: string; theme?: string; layout?: string }): Promise<Job> {
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
  /** 밖에서 여는 앱 주소 (백엔드 PREVIEW_PUBLIC_HOST가 있을 때). 없으면 appUrl(port) */
  url?: string | null
}

/** 앱이 처음 뜰 때 만든 시연 계정 (PM·개발자) */
export interface PreviewAccount { loginId: string; role: string; password: string }

export async function getPreviewAccounts(project: string): Promise<PreviewAccount[]> {
  return ((await (await request(`/preview/${encodeURIComponent(project)}/accounts`)).json()) as { accounts: PreviewAccount[] }).accounts
}

/** 실행 중인 앱 주소: 백엔드가 준 주소, 없으면 우리 도구에 들어온 주소에 앱 포트 (팀원 PC에서도 같은 주소로 연다).
 * 화면을 Vercel처럼 백엔드와 다른 곳에 두면 화면 주소에 포트를 붙여서는 앱에 닿지 않으므로 백엔드 주소(url)를 쓴다 */
export const appUrl = (port: number, url?: string | null) => url || `${window.location.protocol}//${window.location.hostname}:${port}/`

export async function getPreviewStatus(project: string): Promise<PreviewStatus> {
  return (await (await request(`/preview/${encodeURIComponent(project)}/status`)).json()) as PreviewStatus
}

export async function stopPreview(project: string): Promise<PreviewStatus> {
  return (await (await post(`/preview/${encodeURIComponent(project)}/stop`, {})).json()) as PreviewStatus
}

/** 최종 개발물 코드 폴더의 파일 (빈 업무 로직·사람이 고친 파일 표시) */
export interface AppFile { path: string; size: number; generated: boolean; edited: boolean; holes: number; empty_holes: number
  /** 빈 로직만 AI가 채운 자리 수, 기능 전체 AI(또는 AI 뼈대)가 쓴 파일인지 */
  ai_holes: number; ai_file: boolean
  /** 그 브랜치 작업 폴더에서 커밋하지 않은 변경 (고침·새 파일·지움) */
  changed: 'M' | 'A' | 'D' | null }
export interface AppFileTree { branch: string; changes: number; deleted: string[]; files: AppFile[]; holes: number; empty_holes: number; edited: number; ai_holes: number; ai_files: number }
export interface AppFileContent extends AppFile { content: string; hole_list: { name: string; line: number; empty: boolean; ai: boolean }[] }

export async function getAppFiles(project: string, branch = 'dev'): Promise<AppFileTree> {
  return (await (await request(`/develop/files?${query({ project, branch })}`)).json()) as AppFileTree
}

export async function getAppFile(project: string, path: string, branch = 'dev'): Promise<AppFileContent> {
  return (await (await request(`/develop/file?${query({ project, path, branch })}`)).json()) as AppFileContent
}

/** 브랜치 작업 폴더의 파일을 고쳐 저장 (main은 서버가 거부). 커밋은 commitBranch('저장하기') */
export async function saveAppFile(project: string, path: string, content: string, branch: string): Promise<AppFileContent> {
  const res = await request('/develop/file', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, path, content, branch }) })
  return (await res.json()) as AppFileContent
}

/* ------------------------------------------------------------ 최종 개발물 코드 저장소 (브랜치·커밋·합치기 요청, 서버 services/repo.py) */
export interface RepoBranch {
  name: string; head: string; author: string; date: string; subject: string
  /** dev에 없는 커밋 수 / dev에만 있는 커밋 수 (main은 behind = 릴리스할 dev 커밋 수) */
  ahead: number; behind: number
  /** 커밋하지 않은 변경 수 */
  changes: number
  protected: boolean
  owner: { id: number; name: string } | null
  /** 열린 합치기 요청 ID */
  request: number | null
}
export interface MergeRequest {
  id: number; branch: string; target?: string; note: string; by: { id: number; name: string }; at: string
  status: 'open' | 'merged' | 'rejected'; head: string; ahead: number
  /** 다시 개발한 결과(gen → dev) — 최종 개발하기가 낸 요청 */
  generated?: boolean
  /** 마지막 합치기에서 충돌한 파일 */
  conflicts: string[]
  commit?: string; reason?: string; done_by?: { id: number; name: string }; done_at?: string
}
export interface RepoOverview {
  branches: RepoBranch[]; requests: MergeRequest[]; version: string; main: string
  /** main(고객 납품)이 있는지 — 첫 릴리스 때 생긴다 */
  released?: boolean
  /** 릴리스할 dev 커밋 수 (main이 없으면 dev 전체) */
  pending_release?: number
}
export interface RepoRef { type: 'branch' | 'tag' | 'remote' | 'head'; name: string }
export interface RepoCommit { sha: string; parents: string[]; author: string; email: string; date: string; subject: string; refs: RepoRef[]; ai: boolean }
export interface DiffFile { path: string; status: 'A' | 'M' | 'D' | string; diff: string; truncated: boolean }
export interface CommitDetail extends Omit<RepoCommit, 'refs'> { body: string; files: DiffFile[] }

export async function getRepo(project: string): Promise<RepoOverview> {
  return (await (await request(`/develop/repo?${query({ project })}`)).json()) as RepoOverview
}

export async function getRepoLog(project: string, limit = 80): Promise<RepoCommit[]> {
  return ((await (await request(`/develop/repo/log?${query({ project, limit })}`)).json()) as { commits: RepoCommit[] }).commits
}

export async function getRepoCommit(project: string, sha: string): Promise<CommitDetail> {
  return (await (await request(`/develop/repo/commit?${query({ project, sha })}`)).json()) as CommitDetail
}

export interface AdoptPlan { branch: string; target: string; human: number; active_work: string[]
  /** dev와 달라지는 파일. status A(후보에 새로)·M·D(후보에서 지움), human: 후보가 갈라진 뒤 dev에서 사람이 고친 파일 */
  files: { path: string; status: 'A' | 'M' | 'D'; human: boolean }[] }

export async function getAdoptPlan(project: string, branch: string): Promise<AdoptPlan> {
  return (await (await request(`/develop/repo/adopt?${query({ project, branch })}`)).json()) as AdoptPlan
}

/** 후보 브랜치로 dev를 바꾼다. keep: dev 것을 살릴 파일 */
export async function adoptBranch(project: string, branch: string, keep: string[]): Promise<{ commit: string; kept: string[]; seed_dropped: string[] }> {
  return (await (await post('/develop/repo/adopt', { project, branch, keep })).json()) as { commit: string; kept: string[]; seed_dropped: string[] }
}

export async function getBranchDiff(project: string, branch: string): Promise<{ branch: string; ahead: number; behind: number; files: DiffFile[] }> {
  return (await (await request(`/develop/repo/diff?${query({ project, branch })}`)).json()) as { branch: string; ahead: number; behind: number; files: DiffFile[] }
}

export async function createBranch(project: string, name: string, from = 'dev'): Promise<RepoBranch> {
  return (await (await post('/develop/repo/branch', { project, name, from })).json()) as RepoBranch
}

export async function deleteBranch(project: string, name: string): Promise<void> {
  await request(`/develop/repo/branch?${query({ project, name })}`, { method: 'DELETE' })
}

export async function commitBranch(project: string, branch: string, message: string, paths?: string[]): Promise<{ commit: string; files: string[] }> {
  return (await (await post('/develop/repo/commit', { project, branch, message, paths })).json()) as { commit: string; files: string[] }
}

export async function updateBranch(project: string, branch: string): Promise<{ merged: boolean; message: string }> {
  return (await (await post('/develop/repo/update-branch', { project, branch })).json()) as { merged: boolean; message: string }
}

export async function requestMerge(project: string, branch: string, note: string): Promise<MergeRequest> {
  return (await (await post('/develop/repo/request', { project, branch, note })).json()) as MergeRequest
}

export async function mergeRequest(project: string, request_id: number): Promise<MergeRequest> {
  return (await (await post('/develop/repo/merge', { project, request_id })).json()) as MergeRequest
}

export async function rejectRequest(project: string, request_id: number, reason: string): Promise<MergeRequest> {
  return (await (await post('/develop/repo/reject', { project, request_id, reason })).json()) as MergeRequest
}

export async function checkRemote(project: string): Promise<GitSettings> {
  return (await (await post('/develop/repo/fetch', { project })).json()) as GitSettings
}

/** 실행 미리보기 터미널: 빌드·실행 명령과 출력 + 앱 서버 로그 */
export interface PreviewTerminal { status: PreviewStatus['status']; message: string; log: string[]; app_log: string[] }

export async function getPreviewTerminal(project: string): Promise<PreviewTerminal> {
  return (await (await request(`/preview/${encodeURIComponent(project)}/terminal`)).json()) as PreviewTerminal
}

/** 원격 하나 (화면·백엔드·DB를 한 저장소에). ahead·behind는 마지막으로 받은(원격 확인·올리기) origin 기준, 없으면 null */
export interface GitSettings { url: string; branch: string; has_token: boolean; ahead: number | null; behind: number | null; exists: boolean
  checked_at?: string; error?: string
  /** 브랜치(dev·main)별 원격 비교. missing: 서버에 그 브랜치가 없음 (main은 첫 릴리스 전) */
  targets?: Record<string, { ahead: number | null; behind: number | null; exists: boolean; missing?: boolean }> }

export async function getGitSettings(project: string): Promise<GitSettings> {
  return (await (await request(`/develop/git?${query({ project })}`)).json()) as GitSettings
}

export async function deleteGitSettings(project: string): Promise<void> {
  await request(`/develop/git?${query({ project })}`, { method: 'DELETE' })
}

export async function saveGitSettings(project: string, body: { url: string; branch: string; token: string }): Promise<GitSettings> {
  return (await (await post('/develop/git', { project, ...body })).json()) as GitSettings
}

/** 자동 확인 다시 하기: 지금 dev를 Docker로 켜고 admin 로그인·조회 API 검사 (LLM 없음) */
export async function startCheck(project: string, version: string): Promise<Job> {
  return ((await (await post('/develop/check', { project, version })).json()) as { job: Job }).job
}

/** 고른 브랜치를 원격에 올린다: dev(테스트 배포 신호) · main(릴리스한 고객 납품본) */
export async function pushGit(project: string, version: string, target: 'dev' | 'main' = 'dev'): Promise<Job> {
  return ((await (await post('/develop/git/push', { project, version, target })).json()) as { job: Job }).job
}

/** 릴리스: dev를 main으로 앞으로 감고 태그 release-<날짜>-<n> */
export async function releaseRepo(project: string): Promise<{ tag: string; commit: string; commits: number }> {
  return (await (await post('/develop/repo/release', { project })).json()) as { tag: string; commit: string; commits: number }
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
  /** 업로드 문서에 적힌 스택 (parts: 찾은 층만, evidence: 근거 요구사항과 원문 일부). 화면·DB만 적혀 있어도 온다 */
  source?: { stack: string; parts: Partial<Record<StackLayer, string>>; evidence: { id: string; title: string; text: string }[] } | null
  /** 고른 값이 업로드 문서와 다를 때 안내 */
  conflict?: string
  /** 개발 범위 확정에서 사람이 바꾼 값 (원문보다 우선) */
  changed?: boolean
}

export async function getStackStatus(project: string, version: string): Promise<StackStatus> {
  return (await (await request(`/projects/stack?${query({ project, version })}`)).json()) as StackStatus
}

export async function getStackCatalog(): Promise<StackCatalog> {
  return ((await (await request('/tech-stacks')).json()) as { catalog: StackCatalog }).catalog
}

/** 예전 최종본의 빠진 개발 스펙 채우기 (업무 동작 설계 LLM 1회 → BEHAVIOR.md 등 다시 쓰기, PM·개발자) */
export async function fillDevSpec(project: string, version: string): Promise<{ filled: string[]; questions: number; states: number; automations: number }> {
  return ((await (await post('/projects/dev-spec/fill', { project, version })).json()) as { dev_spec: { filled: string[]; questions: number; states: number; automations: number } }).dev_spec
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

/** 담당자 고르기(업로드·프로젝트 화면): 승인된 회원 (Slack 멤버 ID가 있는지만) */
export interface PickMember { id: number; name: string; role: string; role_label: string; has_slack: boolean }

/** 승인된 회원과 Slack 알림이 켜졌는지 (백엔드 .env SLACK_BOT_TOKEN) */
export async function listPickMembers(): Promise<{ members: PickMember[]; slack_enabled: boolean }> {
  const body = (await (await request('/members')).json()) as { members: PickMember[]; slack_enabled?: boolean }
  return { members: body.members, slack_enabled: Boolean(body.slack_enabled) }
}

/** 프로젝트 Slack 채널과 채널에 초대된 회원 (토큰은 서버에만) */
export interface ProjectSlack { team: string; channel_name: string; members: PickMember[] }

/** 프로젝트 담당자 한 명: in_channel = Slack 채널에 들어 있음 (PM을 고른 적이 없는 프로젝트는 PM 모두가 담당자) */
export interface Assignee extends PickMember { in_channel: boolean }

/** 프로젝트 담당자(이 프로젝트를 보는 회원)와 Slack 채널 (채널이 아직 없거나 Slack이 꺼져 있으면 slack: null) */
export interface ProjectMembers { members: Assignee[]; slack: ProjectSlack | null; slack_enabled: boolean }

/** 담당자 바꾸기 결과: 새로 더한 담당자, 뺀 담당자(더는 못 봄, 채널에서 내보냄), 채널 초대·내보내기 못 한 회원 */
export interface MembersResult { added: string[]; removed: string[]; failed: { name: string; reason: string }[] }

export async function getProjectMembers(project: string): Promise<ProjectMembers> {
  return (await (await request(`/projects/members?${query({ project })}`)).json()) as ProjectMembers
}

/** PM: 프로젝트 담당자를 다시 고른다 (members = 새 담당자 전체, PM은 늘 포함). Slack 채널이 있으면 채널도 맞춘다 */
export async function setProjectMembers(project: string, members: number[]): Promise<ProjectMembers & { result: MembersResult }> {
  return (await (await post('/projects/members', { project, members })).json()) as ProjectMembers & { result: MembersResult }
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

/* ------------------------------------------------------------ 수정 초안 공유·최종 결정 */
type Who = { id: number; name: string; role: string }

/** 변경 내역 한 묶음: 누가·언제·무엇을 (서버가 저장할 때 이전 초안과 비교해 남긴다). event: 승인 요청·취소·반려·확정 */
export interface DraftLogEntry {
  by: Who
  at: string
  event?: 'request' | 'request_cancelled' | 'request_rejected' | 'confirm'
  changes: { target: string; label: string; what: string }[]
}

/** 개발자의 기능 명세 수정 완료 승인 요청 (PM은 요청 없이도 확정한다) */
export interface ReviewRequest { by: Who; at: string; note: string }

/** PM의 마지막 반려 (개발자가 다시 요청하거나 확정되면 지운다) */
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

/** PM: 개발자의 승인 요청 반려 (사유 필수, 요청한 개발자에게 Slack으로도 알린다) */
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
  /** 승인: 그때 정한 확인 항목의 답 */
  resolved?: { id: string; title: string; answer: string }[]
  /** 승인 뒤 답을 바꾼 기록 */
  edits?: { at: string; by: { id: number; name: string; role: string } }[]
}

/** 승인한 최종본의 승인 직전 확인 항목 (editable=false: 예전 승인이라 직전 기록이 없어 답을 바꿀 수 없음) */
export async function getApprovedItems(project: string, version: string): Promise<{ items: OpenItem[]; editable: boolean }> {
  return (await (await request(`/projects/open-items?${query({ project, version, approved: 'true' })}`)).json()) as { items: OpenItem[]; editable: boolean }
}

/** 승인한 최종본의 확인 항목 답 바꾸기: 승인은 그대로, 개발 스펙 10개를 다시 쓴다 (LLM 없음) */
export async function reanswerApproval(project: string, version: string, answers: Record<string, string>): Promise<Approval> {
  return ((await (await post('/projects/approval/answers', { project, version, answers })).json()) as { approval: Approval }).approval
}

/** 최종 승인 전에 남은 확인 항목 (recommended가 비면 답을 적어야 승인된다) */
export interface OpenItem { id: string; kind: 'question' | 'rule' | 'automation' | 'state' | 'source'; title: string; detail: string; options: string[]; recommended: string; where: string[] }

export async function getOpenItems(project: string, version: string): Promise<OpenItem[]> {
  return ((await (await request(`/projects/open-items?${query({ project, version })}`)).json()) as { items: OpenItem[] }).items
}

export async function decideFinal(body: { project: string; version: string; decision: 'approve' | 'changes'; targets?: ('spec' | 'erd')[]; items?: ChangeItem[]; comment: string; answers?: Record<string, string> }): Promise<Approval> {
  return ((await (await post('/projects/approval', body)).json()) as { approval: Approval }).approval
}

const query = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()

export async function listProjects(): Promise<{ output_dir: string; projects: Project[] }> {
  return (await request('/projects')).json()
}

/** 프로젝트 삭제 (PM만, 되돌릴 수 없음): confirm에 프로젝트 이름을 그대로 넣어야 한다 */
export async function deleteProject(project: string, confirm: string): Promise<{ project: string; removed: string[] }> {
  return (await request(`/projects?${query({ project, confirm })}`, { method: 'DELETE' })).json()
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

/** PM: 프로젝트 이름 바꾸기 (화면·Slack에 보이는 이름만, 프로젝트 ID·주소는 그대로). 비우면 처음 이름. 바뀐 이름을 돌려준다 */
export async function renameProject(project: string, name: string): Promise<string> {
  return ((await (await post('/projects/name', { project, name })).json()) as { name: string }).name
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
  source: 'spec' | 'erd' | 'answers' | 'run' | 'review' | 'develop' | 'git' | 'check'
  status: 'running' | 'done' | 'failed'
  message: string
  log: string[]
  new_version?: string
  warnings?: string[]
  /** 실패는 아니고 사람이 확인할 것 (충족 못 한 완료 조건) */
  checks?: string[]
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
export type DispositionChoice = 'applied' | 'not_issue' | 'later' | 'confirmed'   // confirmed: 추적 검토 지적을 '반영함'으로 확인 (서버가 다시 열지 않음)
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
 * members(회원 ID) = 새 프로젝트의 담당자 (올린 사람·PM은 늘 포함, 담당자만 이 프로젝트를 봄).
 * Slack이 켜져 있으면(백엔드 .env) 프로젝트 비공개 채널을 만들고 담당자를 초대한다 (Slack이 실패해도 분석은 시작). */
export async function startRun(file: File, opts: { project?: string; title?: string; model?: string; effort?: string; members?: number[] }): Promise<{ job: Job; slack: SlackConnected | null }> {
  const form = new FormData()
  form.append('file', file)
  if (opts.project?.trim()) form.append('project', opts.project.trim())
  if (opts.title?.trim()) form.append('title', opts.title.trim())
  if (opts.model) form.append('model', opts.model)
  if (opts.effort) form.append('effort', opts.effort)
  if (opts.members) form.append('members', opts.members.join(','))
  const body = (await (await request('/runs', { method: 'POST', body: form })).json()) as { job: Job; slack?: SlackConnected | null }
  return { job: body.job, slack: body.slack ?? null }
}

export async function getJob(id: string): Promise<Job> {
  return ((await (await request(`/jobs?id=${encodeURIComponent(id)}`)).json()) as { job: Job }).job
}

/** 프로젝트에서 진행 중인 작업 (없으면 null). 로그아웃·새로고침으로 잃은 진행 창을 다시 띄울 때 */
export async function getRunningJob(project: string): Promise<Job | null> {
  return ((await (await request(`/jobs/running?project=${encodeURIComponent(project)}`)).json()) as { job: Job | null }).job
}

// ---------------------------------------------------------------- 화면 구성·작업 묶음·배정·검토 (FR-049~053)

export interface LayoutSection { id: string; name: string; menus: string[] }

export interface LayoutData {
  format?: number
  home?: { todo?: boolean; notices?: boolean; areas?: boolean }
  /** 업무 영역: 비슷한 메뉴 묶음 (생성 앱 왼쪽 메뉴·홈, 작업 묶음 화면 · / 서버 · <영역>). 메뉴 순서는 영역 순서 */
  sections: LayoutSection[]
  menu: { group: string; name: string; hidden: boolean; pages: { name: string; screens: string[]; hidden: boolean }[] }[]
}

/** locked: 진행 중인 작업 묶음이 있어 메뉴를 넣거나 뺄 수 없는 영역 id */
export interface LayoutInfo { layout: LayoutData; menu: { group: string; name: string }[]; screens: Record<string, string>; path: string; locked: string[] }

export async function getLayout(project: string): Promise<LayoutInfo> {
  return (await (await request(`/develop/layout?${query({ project })}`)).json()) as LayoutInfo
}

export async function saveLayout(project: string, layout: LayoutData): Promise<LayoutInfo & { commit: string | null }> {
  const res = await request('/develop/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project, layout }) })
  return (await res.json()) as LayoutInfo & { commit: string | null }
}

/** 업무 영역 다시 묶기 제안 (저장 안 함): rules 규칙(LLM 없음) · ai LLM 한 번 (실패하면 오류) */
export async function suggestLayout(project: string, mode: 'rules' | 'ai', layout: LayoutData): Promise<{ layout: LayoutData; usage: { input_tokens: number; output_tokens: number; model?: string } | null }> {
  return (await (await post('/develop/layout/suggest', { project, mode, layout })).json()) as { layout: LayoutData; usage: { input_tokens: number; output_tokens: number; model?: string } | null }
}

export type WorkStatus = 'unassigned' | 'assigned' | 'in_progress' | 'review' | 'done' | 'rejected'

export interface WorkItem {
  key: string
  /** 파생된 브랜치: 받을 때 이 브랜치의 최신 내용, 승인하면 여기로 합친다 */
  base?: string
  kind: 'common_ui' | 'ui' | 'common_server' | 'server'
  layer: 'frontend' | 'backend'
  title: string
  /** 화면 · / 서버 · <영역> 묶음의 업무 영역 (공통 묶음은 null) */
  area: WorkArea | null
  summary: string
  functions: string[]
  files: string[]
  file_count: number
  empty_holes: number
  /** 개발 AI가 끝까지 구현하지 못한 항목 (담당자가 채운다) */
  todos: { function: string; rule: string; reason: string }[]
  todo_count: number
  ai_holes: number
  ai_files: number
  edited: number
  status: WorkStatus
  status_label: string
  assignee?: { id: number; name: string }
  branch?: string
  request_id?: number | null
  reason?: string
  ahead?: number
  behind?: number
  self_approved?: boolean
  history: { at: string; by: { id: number; name: string }; what: string }[]
}

export interface WorkArea { id: string; name: string; menus: { group: string; name: string }[] }

export interface WorkOverview {
  items: WorkItem[]
  /** 영역마다 화면 묶음·서버 묶음 키 */
  areas: (WorkArea & { screen: string | null; server: string | null })[]
  counts: Record<WorkStatus, number>
  people: { id: number; name: string; total: number; done: number; review: number }[]
  developers: { id: number; name: string }[]
  labels: Record<WorkStatus, string>
  version: string
  /** 작업을 보낼 수 있는 브랜치 (dev가 맨 앞) */
  bases: string[]
}

export async function getWork(project: string): Promise<WorkOverview> {
  return (await (await request(`/develop/work?${query({ project })}`)).json()) as WorkOverview
}

/** 작업 설명 고치기 (웹·확장 공유). text가 비면 자동 설명으로 되돌린다. base: 고치기 시작한 내용 (그 사이 다른 사람이 고쳤으면 409) */
export async function saveWorkBrief(project: string, key: string, text: string, base: string): Promise<{ brief: string; edit: BriefEdit | null }> {
  return (await (await post('/develop/work/brief', { project, key, text, base })).json()) as { brief: string; edit: BriefEdit | null }
}

export interface BriefEdit { by: { id: number; name: string }; at: string }

export async function getWorkItem(project: string, key: string): Promise<{ item: WorkItem; brief: string; brief_edit: BriefEdit | null; rules: string }> {
  return (await (await request(`/develop/work/item?${query({ project, key })}`)).json()) as { item: WorkItem; brief: string; brief_edit: BriefEdit | null; rules: string }
}

export async function assignWork(project: string, key: string, user_id: number, base: string): Promise<WorkItem> {
  return (await (await post('/develop/work/assign', { project, key, user_id, base })).json()) as WorkItem
}

export interface AssignManyResult { results: { key: string; ok: boolean; title?: string; error?: string }[]; assigned: number; failed: number }

/** 여러 묶음을 한 사람에게 (묶음마다 결과, 하나가 실패해도 나머지는 배정) */
export async function assignMany(project: string, keys: string[], user_id: number, base: string): Promise<AssignManyResult> {
  return (await (await post('/develop/work/assign-many', { project, keys, user_id, base })).json()) as AssignManyResult
}

export async function submitWork(project: string, key: string, note = ''): Promise<WorkItem> {
  return (await (await post('/develop/work/submit', { project, key, note })).json()) as WorkItem
}

export async function approveWork(project: string, key: string): Promise<WorkItem> {
  return (await (await post('/develop/work/approve', { project, key })).json()) as WorkItem
}

export async function rejectWork(project: string, key: string, reason: string): Promise<WorkItem> {
  return (await (await post('/develop/work/reject', { project, key, reason })).json()) as WorkItem
}

export interface MyWork { projects: { project: string; version: string; items: WorkItem[]; reviews: WorkItem[] }[]; labels: Record<WorkStatus, string> }

export async function getMyWork(): Promise<MyWork> {
  return (await (await request('/develop/work/mine')).json()) as MyWork
}

// ---------------------------------------------------------------- 개인 접속 토큰 (VS Code 확장)

export interface AccessTokenInfo { id: number; name: string; prefix: string; created_at: string | null; last_used_at: string | null }

export async function listTokens(): Promise<AccessTokenInfo[]> {
  return ((await (await request('/auth/tokens')).json()) as { tokens: AccessTokenInfo[] }).tokens
}

export async function createToken(name: string): Promise<{ token: string; info: AccessTokenInfo }> {
  return (await (await post('/auth/tokens', { name })).json()) as { token: string; info: AccessTokenInfo }
}

export async function deleteToken(id: number): Promise<void> {
  await request(`/auth/tokens?${query({ id })}`, { method: 'DELETE' })
}
