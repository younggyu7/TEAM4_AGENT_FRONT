// 코드값 → 화면 표기. 보고서(req_agent/tools/exporter.py)와 같은 말을 쓴다.

export const REQ_TYPE: Record<string, string> = { FUNCTIONAL: '기능', NON_FUNCTIONAL: '비기능' }
export const REQ_SCOPE: Record<string, string> = { SYSTEM: '시스템', PROJECT: '수행 의무' }
export const REQ_STATUS: Record<string, string> = { CONFIRMED: '확정', ASSUMED: '가정', OPEN: '미확정' }
export const PRIORITY: Record<string, string> = { MUST: '필수', SHOULD: '권장', COULD: '선택', UNSPECIFIED: '미정(원문에 없음)' }

export const QUESTION_KIND: Record<string, string> = { AMBIGUITY: '모호함', MISSING: '정보 누락', CONFLICT: '충돌' }
export const QUESTION_STATUS: Record<string, string> = { PENDING: '답변 대기', ANSWERED: '답변함', DEFERRED: '보류 (가정으로 진행)' }

export const SEVERITY: Record<string, string> = { ERROR: '오류', WARNING: '경고', INFO: '참고' }
export const ISSUE_STATUS: Record<string, string> = { OPEN: '열림', RESOLVED: '해결', UNRESOLVED: '미해결' }

export const ENTITY_KIND: Record<string, string> = {
  MASTER: '기준', TRANSACTION: '거래', HISTORY: '이력', MAPPING: '연결', CODE: '코드',
}

export const AGENT: Record<string, string> = {
  document_analyst: '문서분석 Agent',
  requirements_analyst: '요구사항 Agent',
  requirement_reviewer: '요구사항 검토 Agent',
  function_designer: '기능 명세 Agent',
  data_modeler: '데이터 모델 Agent',
  api_designer: 'API 설계 Agent',
  trace_reviewer: '추적 검토 Agent',
  semantic_reviewer: '의미 검토 Agent',
  ask_user: '확인 질문',
  check_completion: '완료 조건 검사',
  inspect_result: '결과 검사',
  db_validate: 'DB 검증',
  none: '보고만',
}

/** 의미 검토 지적 종류와 확인 담당 (exporter.py와 같음) */
export const SEMANTIC_KIND: Record<string, [string, string]> = {
  SEM_FUNC_GAP: ['기능 누락', '기능 설계 담당'],
  SEM_FUNC_CONFLICT: ['기능·요구사항 불일치', '기능 설계 담당'],
  SEM_FUNC_UNMARKED_ASSUMPTION: ['표시 없는 가정', '기능 설계 담당 → 고객 확인'],
  SEM_MODEL_GAP: ['데이터 누락', '데이터 설계 담당'],
  SEM_MODEL_INTEGRITY: ['제약 누락', '데이터 설계 담당'],
}

export const label = (map: Record<string, string>, key: string) => map[key] ?? key

export function issueKindLabel(kind: string): string {
  return SEMANTIC_KIND[kind]?.[0] ?? kind
}

export function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
