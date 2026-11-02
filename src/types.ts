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
  /** 팀장이 최종 산출물 화면에서 고른 기술 스택 (이것이 있어야 '확정') */
  tech_stack?: { stack: string; basis: string }
  /** 화면 요청으로 만든 사람 */
  created_by?: { id: number; name: string; role: string }
  /** 최종본: 팀장의 마지막 결정(승인·수정 지시)과 그 기록 */
  approval?: import('./api').Approval
  approvals?: import('./api').Approval[]
  db_errors?: string[]
}

export interface Project {
  id: string
  name: string
  versions: VersionRecord[]
}
