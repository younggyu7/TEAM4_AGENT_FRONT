import type { Design, FunctionSpec, Project } from './types'

export type Version = string | number

// FastAPI 백엔드(TEAM4_AGENT/backend)의 /api/v1. 개발 중에는 Vite proxy가 로컬 서버(127.0.0.1:8000)로 넘긴다.
// 백엔드를 다른 주소에 두면 VITE_API_BASE에 전체 주소를 적는다 (예: https://api.example.com/api/v1).
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '/api/v1'

/** API 경로 → 요청 주소 (링크·다운로드처럼 fetch 밖에서 쓸 때) */
export const apiUrl = (path: string) => BASE + path

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(apiUrl(path), init)
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? `요청 실패 (${res.status})`)
  }
  return res
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

export interface Job {
  id: string
  project: string
  base: string
  // 기능 명세 → ERD / ERD 저장 / 확인 질문 답 반영 → 기능 명세 새 버전 / 문서 업로드 → 기능 명세 초안 / ERD 최종 확정 → 의미 검토
  source: 'spec' | 'erd' | 'answers' | 'run' | 'review'
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

/** 원본 요구서를 올려 기능 명세 초안까지 실행한다 (확인 질문은 추천안으로 가정). 몇 분 걸리므로 작업 ID를 받고 getJob으로 확인한다. */
export async function startRun(file: File, opts: { project?: string; title?: string; validateDb?: boolean }): Promise<Job> {
  const form = new FormData()
  form.append('file', file)
  if (opts.project?.trim()) form.append('project', opts.project.trim())
  if (opts.title?.trim()) form.append('title', opts.title.trim())
  form.append('validate_db', String(Boolean(opts.validateDb)))
  return ((await (await request('/runs', { method: 'POST', body: form })).json()) as { job: Job }).job
}

export async function getJob(id: string): Promise<Job> {
  return ((await (await request(`/jobs?id=${encodeURIComponent(id)}`)).json()) as { job: Job }).job
}
