// design.json 형태. 원본 계약은 req_agent/schemas.py (Pydantic)이며 바뀌면 여기도 맞춘다.

export interface Evidence {
  source_block_id: string
  quote: string
  verified: boolean
}

export interface Requirement {
  requirement_id: string
  source_key: string
  source_ref: string
  type: 'FUNCTIONAL' | 'NON_FUNCTIONAL'
  scope: 'SYSTEM' | 'PROJECT'
  category: string
  title: string
  description: string
  priority: 'MUST' | 'SHOULD' | 'COULD' | 'UNSPECIFIED'   // UNSPECIFIED: 원문에 우선순위 근거가 없음
  acceptance_criteria: string[]
  evidence: Evidence[]
  status: 'CONFIRMED' | 'ASSUMED' | 'OPEN'
  decisions: string[]
  // 요구사항 검토 Agent 표시. question_id가 있으면 고객 확인 대기 (분류 판단 필요·원문 외 추가·충돌), SUPPLEMENTED는 빠져서 보충함
  review?: { kind: 'CLASSIFICATION' | 'ADDED' | 'CONFLICT' | 'SUPPLEMENTED'; note: string; question_id: string }[]
}

export interface Question {
  question_id: string
  kind: 'AMBIGUITY' | 'MISSING' | 'CONFLICT'
  question: string
  context: string
  options: string[]
  requirement_ids: string[]
  evidence_block_ids: string[]
  blocking: boolean
  status: 'PENDING' | 'ANSWERED' | 'DEFERRED'
  answer: string
  stage?: string            // 질문을 낸 단계: requirements(요구사항·충돌) · requirement_reviewer(분류) · function_designer · data_modeler · api_designer(기술 스택)
  recommended?: string      // 추천 선택지 (초안은 이 답을 가정해 만들었다)
  entity_ids?: string[]     // 데이터 설계 질문이 가리키는 테이블
}

export interface FunctionIO {
  name: string
  description: string
  required: boolean
}

export interface FunctionSpec {
  function_id: string
  group: string
  name: string
  description: string
  requirement_ids: string[]
  nfr_ids: string[]
  actors: string[]
  preconditions: string[]
  inputs: FunctionIO[]
  outputs: FunctionIO[]
  business_rules: string[]
  normal_flow: string[]
  exception_flows: { condition: string; handling: string }[]
  data_objects: string[]
}

export interface Attribute {
  name: string
  label: string
  data_type: string
  length: number
  nullable: boolean
  primary_key: boolean
  unique: boolean
  references: string
  allowed_values: string[]
  description: string
}

export interface Entity {
  entity_id: string
  label: string
  description: string
  kind: 'MASTER' | 'TRANSACTION' | 'HISTORY' | 'MAPPING' | 'CODE'
  attributes: Attribute[]
  function_ids: string[]
  requirement_ids: string[]
  user_edited?: boolean   // 사용자가 고친 엔티티 (rerun에서 고정됨)
}

export interface Relation {
  relation_id: string
  parent: string
  child: string
  fk_attribute: string
  cardinality: '1:1' | '1:N'
  optional: boolean
}

export interface Issue {
  issue_id: string
  kind: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  target_agent: string
  target_id: string
  status: 'OPEN' | 'RESOLVED' | 'UNRESOLVED'
  attempts: number
  raised_by: string
  resolution?: string   // 사람이 ERD 화면에서 정한 처리 (반영함 / 문제 아님 / 미해결로 둠: 메모)
}

export interface TraceLink {
  from_id: string
  to_id: string
  link_type: 'REQ_FUNC' | 'NFR_FUNC' | 'FUNC_ENTITY'
}

export interface Decision {
  step: number
  action: string
  scope: string[]
  mode: string
  reason: string
  result: string
}

export interface CompletionCheck {
  name: string
  passed: boolean
  detail: string
}

export interface Design {
  meta: {
    project?: string
    run_id: string
    design_version: string | number
    document: { document_id: string; document_version: string; file_name: string }
    generated_at: string
    /** 개발 스펙 문서 (데이터 설계 버전에만): 형식, 파일, 기술 스택과 그 근거(원문·확정·가정) */
    dev_spec?: { format: string; files: string[]; stack: string; stack_basis: '원문' | '확정' | '가정' | '없음'; stack_from_answer?: boolean }
  }
  requirements: Requirement[]
  questions: Question[]
  functions: FunctionSpec[]
  data_model: { entities: Entity[]; relations: Relation[] }
  trace_links: TraceLink[]
  issues: Issue[]
  completion: { satisfied: boolean; forced: boolean; actionable: boolean; checks: CompletionCheck[] }
  decisions: Decision[]
}

/** output/<프로젝트>/versions.json의 버전 기록 한 건 (versions.json이 없으면 design.json meta로 채운 일부) */
export interface VersionRecord {
  design_version: string          // '4', '4.1' (단계만 다시 만든 버전은 기준 번호 아래)
  parent?: string | null
  created_at?: string
  stage?: string                  // 'full' 또는 다시 만든 단계 (예: data_modeler)
  base?: string | null            // 단계만 다시 만든 버전의 기준 버전
  feedback?: string
  title?: string                  // 사용자가 붙인 제목
  run_id?: string
  document?: string
  summary?: string[]
  db_validation?: string
  db_engine?: string
  /** 최종 산출물 화면에서 고른 기술 스택 (이것이 있어야 '확정'). parts: 화면·백엔드·DB를 나눠 고른 값 */
  tech_stack?: { stack: string; basis: string; parts?: Record<'frontend' | 'backend' | 'database', string> }
  /** 최종 개발하기 기록 (승인한 최종본): 누가·언제·AI 사용 여부·미리보기 빌드 여부 */
  develop?: {
    version: string; at: string; by: { id: number; name: string; role: string }; logic: boolean; mock: boolean; backend: boolean; log: string[]
    /** 업무 기능 AI 구현을 했는지와 모델·effort */
    build?: boolean
    ai?: { mode?: 'build' | 'logic'; model?: string; effort?: string }
    /** 이번 개발에 쓴 LLM (AI 안 씀이면 0) */
    /** 코드 저장소 main에 남긴 개발 커밋 (바뀐 것이 없으면 null) */
    commit?: string | null
    usage?: { calls: number; input: number; output: number; model: string; effort: string; mode: 'build' | 'logic' | 'none' }
    /** 기능별 구현 방식과 고객 답 대기 규칙 */
    summary?: { functions: number; with_api: number; ai: string[]; failed: string[]; template: string[]; todo_count: number
      /** 빈 로직만 AI: AI가 채운 기능·자리 수 */
      logic_functions?: string[]; logic_holes?: number
      todos: { function: string; rule: string; reason: string }[] }
    /** 자동 확인: admin 로그인 + 조회 API (서버 코드가 없으면 없음) */
    check?: { ok: boolean; message?: string; apis?: number; counts?: { ok: number; not_implemented: number; errors: number; other: number }
      errors?: string[]; not_implemented?: string[]; other?: string[] } | null
  }
  /** 개발한 회차마다의 develop 기록 (다시 개발할 때마다 쌓인다, 개발 토큰 회차별 막대) */
  developments?: NonNullable<VersionRecord['develop']>[]
  /** 원격 올리기 기록: 원격 하나의 브랜치·커밋 (예전 기록은 화면·백엔드 쪽마다 pushed·urls) */
  git?: { at: string; by: { id: number; name: string }; url?: string; branch?: string; commit?: string
    pushed?: Record<string, string>; urls?: Record<string, string> }
  /** 화면 요청으로 만든 사람 */
  created_by?: { id: number; name: string; role: string }
  /** 최종본: 마지막 결정(승인·수정 지시)과 그 기록 */
  approval?: import('./api').Approval
  approvals?: import('./api').Approval[]
  db_errors?: string[]
}

export interface Project {
  id: string
  name: string
  versions: VersionRecord[]
}
