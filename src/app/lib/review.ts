import type { Directive } from '../../api'
import type { Design, Entity, FunctionSpec, Issue, Question } from '../../types'
import type { DraftState } from './draft'

// '확인 필요' 항목: 초안을 최종 확정하기 전에 사람이 보고 결정해야 하는 것들.
// - requirement: 요구사항 확인 질문 (요구사항 Agent의 질문, 분류 확인 RC-…, 요구사항 충돌 CF-…). 초안은 추천안·가정으로 만들었다
//               → 답을 고르면 해결. 답은 '답 반영'으로 백엔드에 넘겨 분류·결정을 고치고 바뀐 기능만 다시 설계한다
// - question  : 기능 명세 확인 질문 (FQ-…) → 답을 고르거나 적으면 해결
// - unconfirmed: '(가정)' 한도를 넘어 질문하지도 가정하지도 않은 '(확인 필요)' 업무 규칙 (문장은 추천안)
//               → 확정 전에 '추천안 맞음' 표시, 또는 규칙을 고쳐 '(확인 필요)'를 지우거나 '(가정)'으로 바꾸면 사라짐
// - assumption: 원문에 없어 '(가정)'으로 넣은 업무 규칙 → '확인함' 표시, 또는 규칙을 고쳐 '(가정)'을 지우면 사라짐
// - issue     : 규칙 검사가 남긴 열린 지적 → 반영했으면 '확인함' 표시
// - remark    : ERD를 만들 때 의미 검토가 남긴 지적 (데이터 누락 등, Agent가 한 번 고친 뒤에도 남은 것)
//               → ERD 화면에서 '반영함·문제 아님·미해결로 둠' 중 하나를 반드시 고른다 (최종 확정 때 서버에 남는다)
// - check     : 편집 결과를 화면에서 바로 검사한 것 (PK 없음 등) → 고치면 저절로 해결

export type ReviewKind = 'requirement' | 'question' | 'unconfirmed' | 'assumption' | 'issue' | 'remark' | 'directive' | 'check'

export interface ReviewItem {
  id: string
  kind: ReviewKind
  title: string
  detail?: string
  targetId?: string        // 이동할 기능·테이블 ID
  targetLabel?: string
  required: boolean        // 확정 전에 반드시 해결
  resolved: boolean
  auto: boolean            // 편집으로만 해결 (체크 불가)
  question?: Question
  issue?: Issue
  /** 팀장 수정 지시 항목: 반영함 / 그대로 둠(이유)을 서버에 남긴다 (LLM 없음) */
  directive?: { project: string; final: string; stage: 'spec' | 'erd'; target_id: string; resolution: Directive['items'][number]['resolution'] }
}

/** 이 화면(단계·버전)에서 처리할 팀장 지시 항목 → 필수 확인 항목 */
export function directiveItems(directives: Directive[], page: 'spec' | 'erd', version: string): ReviewItem[] {
  return directives
    .filter((d) => page === 'spec' ? d.targets.includes('spec') && d.spec_version === version && !d.spec_done
      : d.erd_version === version && !d.erd_waiting)
    .flatMap((d) => d.items.filter((i) => i.stage === page).map((i) => ({
      id: `directive:${d.final}:${i.stage}:${i.target_id}`,
      kind: 'directive' as const,
      title: `팀장 지시: ${i.note || d.comment || '고칠 것'}`,
      detail: `${d.by?.name ?? '팀장'} · 최종본 v${d.final}${i.resolution ? ` · ${i.resolution.choice === 'applied' ? '반영함' : '그대로 둠'} (${i.resolution.by.name})${i.resolution.note ? ` — ${i.resolution.note}` : ''}` : ''}`,
      targetId: i.target_id,
      targetLabel: i.label,
      required: true,
      resolved: Boolean(i.resolution),
      auto: false,
      directive: { project: d.project, final: d.final, stage: i.stage, target_id: i.target_id, resolution: i.resolution },
    })))
}

export const KIND_LABEL: Record<ReviewKind, string> = {
  requirement: '요구사항 확인',
  question: '확인 질문',
  unconfirmed: '확인 필요 규칙',
  assumption: '가정',
  issue: '검토 지적',
  remark: '의미 검토 지적',
  directive: '팀장 지시',
  check: '자동 검사',
}

const QUESTION_ID = /(?:FQ|RC|CF)-\d+/

/**
 * 업무 규칙의 표시: 앞 괄호('(가정) …', '(공통 P4, 확인 필요) …')나 문장 속 '(가정)'·'(확인 필요)'.
 * 질문 ID가 붙은 것('(확인 필요 FQ-001) …')은 그 질문 항목이 맡으므로 표시 없음으로 본다.
 */
export function ruleMark(rule: string): { kind: 'assumption' | 'unconfirmed'; text: string } | undefined {
  const head = rule.match(/^\(([^)]*)\)\s*/)
  if (head && QUESTION_ID.test(head[1])) return undefined
  const text = (head ? rule.slice(head[0].length) : rule).replace(/\s*\((?:가정|확인 필요)\)\s*/g, ' ').trim()
  const tag = head?.[1] ?? ''
  if (tag.includes('확인 필요') || rule.includes('(확인 필요)')) return { kind: 'unconfirmed', text }
  if (tag.includes('가정') || rule.includes('(가정)')) return { kind: 'assumption', text }
  return undefined
}
/** 기능 명세 전에 요구사항 단계에서 낸 질문 (요구사항 Agent · 요구사항 검토 Agent) */
const REQUIREMENT_STAGES = new Set(['requirements', 'requirement_reviewer'])
export const isRequirementQuestion = (q: Question) => REQUIREMENT_STAGES.has(q.stage ?? 'requirements')

/**
 * 데이터 설계(DQ-…) 질문: 화면에서 답하지 않는다 (ERD 만들기는 질문에서 멈추지 않고 추천안으로 가정).
 * 기술 스택(TQ-001)은 기능 명세 초안에서 코드가 낸 필수 질문이라 기능 명세 화면에서 답한다 (답은 최종본의 개발 스펙에만).
 */
export const isErdQuestion = (q: Question) => q.stage === 'data_modeler'
/** 개발 스펙의 기술 스택 질문: 답해도 기능 명세 규칙·ERD는 바뀌지 않는다 */
export const isStackQuestion = (q: Question) => q.stage === 'api_designer'

/** 기능 명세 화면에서 새로 답한 질문 (질문 ID → 답). 내보내기 때 코드로 반영하거나 'AI로 답 반영'으로 넘긴다 */
export function newAnswers(design: Design, draft: DraftState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const q of design.questions) {
    if (isErdQuestion(q)) continue
    const a = draft.answers[q.question_id]?.trim()
    if (a && q.status !== 'ANSWERED') out[q.question_id] = a
  }
  return out
}

const isOpen = (i: Issue) => i.status !== 'RESOLVED'
const splitTargets = (target: string) => target.split(/\s*,\s*/).filter(Boolean)

export function specReview(design: Design, functions: FunctionSpec[], draft: DraftState): ReviewItem[] {
  const items: ReviewItem[] = []
  const byReq = new Map<string, FunctionSpec[]>()
  for (const f of functions) {
    for (const r of [...f.requirement_ids, ...f.nfr_ids]) byReq.set(r, [...(byReq.get(r) ?? []), f])
  }

  for (const q of design.questions) {
    if (q.status === 'ANSWERED' || isErdQuestion(q)) continue
    // 질문 표시((확인 필요 FQ-001) …)가 붙은 기능을 먼저, 없으면 관련 요구사항의 기능
    const fn = functions.find((f) => f.business_rules.some((r) => r.includes(q.question_id)))
      ?? q.requirement_ids.flatMap((r) => byReq.get(r) ?? [])[0]
    const requirement = isRequirementQuestion(q)
    const answer = draft.answers[q.question_id]?.trim()
    const differs = Boolean(answer && q.recommended && answer !== q.recommended.trim())
    const notes = [
      q.context,
      requirement && q.requirement_ids.length ? `관련 요구사항: ${q.requirement_ids.join(', ')}` : '',
      q.recommended ? `지금 초안은 추천안 '${q.recommended}'을(를) 가정해 만들었습니다.` : '',
      // 내보낼 때 코드는 표시가 붙은 규칙만 답으로 바꾼다. 흐름·입력·데이터 등 다른 칸은 사람이 확인한다
      isStackQuestion(q) ? '화면·서버·DB를 하나씩 고릅니다. 기능 명세를 확정하면 스택도 확정되어 개발 스펙과 최종 개발하기에 쓰입니다. 기능 명세·ERD는 바뀌지 않습니다 (LLM 사용 없음).' : '',
      differs && !isStackQuestion(q) ? `⚠ 추천안과 다른 답입니다. 내보낼 때 해당 규칙은 이 답으로 바뀝니다. 관련 기능의 흐름·입력·데이터도 확인하세요 (필요하면 오른쪽 위 'AI로 답 반영').` : '',
    ].filter(Boolean)
    items.push({
      id: `q:${q.question_id}`,
      kind: requirement ? 'requirement' : 'question',
      title: q.question,
      detail: notes.join('\n'),
      targetId: fn?.function_id,
      targetLabel: fn?.name,
      required: q.blocking,
      resolved: Boolean(draft.answers[q.question_id]?.trim()),
      auto: false,
      question: q,
    })
  }

  for (const f of functions) {
    f.business_rules.forEach((rule) => {
      const mark = ruleMark(rule)
      if (!mark) return
      const id = assumptionId(f.function_id, rule)
      items.push({
        id,
        kind: mark.kind,
        title: mark.text,
        detail: mark.kind === 'unconfirmed'
          ? "고객 확인이 필요한 규칙입니다 (추천안을 정하지 못했거나, 서버가 '(가정)' 한도 방식일 때 한도를 넘은 규칙). 지금 초안은 이 문장으로 설계했습니다. '추천안 맞음'이면 내보낼 때 '(결정)'으로 바뀝니다 (LLM 없음)." : undefined,
        targetId: f.function_id,
        targetLabel: f.name,
        required: mark.kind === 'unconfirmed',   // 가정은 권장, 확인 필요는 확정 전에 반드시 본다
        resolved: Boolean(draft.checked[id]),
        auto: false,
      })
    })
    if (!f.name.trim()) items.push(autoCheck(`${f.function_id}:name`, '기능 이름이 비어 있습니다', f))
    if (f.normal_flow.filter((s) => s.trim()).length === 0) items.push(autoCheck(`${f.function_id}:flow`, '처리 순서가 없습니다', f))
  }

  for (const issue of design.issues.filter(isOpen)) {
    const targets = splitTargets(issue.target_id)
    const fn = targets.map((t) => functions.find((f) => f.function_id === t) ?? byReq.get(t)?.[0]).find(Boolean)
    if (!fn) continue
    items.push(issueItem(issue, fn.function_id, fn.name, draft))
  }
  return items
}

export function erdReview(design: Design, entities: Entity[], draft: DraftState): ReviewItem[] {
  const items: ReviewItem[] = []
  const ids = new Set(entities.map((e) => e.entity_id))

  for (const e of entities) {
    const target = { targetId: e.entity_id, targetLabel: e.label || e.entity_id }
    if (!e.attributes.some((a) => a.primary_key)) {
      items.push({ id: `${e.entity_id}:pk`, kind: 'check', title: '기본키(PK) 컬럼이 없습니다', ...target, required: true, resolved: false, auto: true })
    }
    const seen = new Set<string>()
    e.attributes.forEach((a, i) => {
      const name = a.name.trim()
      if (!name) {
        items.push({ id: `${e.entity_id}:empty:${i}`, kind: 'check', title: `${i + 1}번째 컬럼 이름이 비어 있습니다`, ...target, required: true, resolved: false, auto: true })
      } else if (seen.has(name)) {
        items.push({ id: `${e.entity_id}:dup:${name}`, kind: 'check', title: `컬럼 이름 '${name}'이 중복됩니다`, ...target, required: true, resolved: false, auto: true })
      }
      seen.add(name)
      if (a.references && !ids.has(a.references)) {
        items.push({ id: `${e.entity_id}:fk:${a.name}`, kind: 'check', title: `${a.name}이 참조하는 테이블 '${a.references}'이 없습니다`, ...target, required: true, resolved: false, auto: true })
      }
    })
  }

  for (const issue of design.issues.filter(isOpen)) {
    const targets = splitTargets(issue.target_id)
    const entity = targets.map((t) => entities.find((e) => e.entity_id === t)).find(Boolean)
    if (issue.kind.startsWith('SEM_')) {
      // 의미 검토 지적은 기능을 가리키기도 한다 (그 기능의 데이터가 빠짐). 테이블이 없으면 기능으로 이동한다
      items.push(remarkItem(issue, entity?.entity_id ?? targets[0], entity?.label, draft))
    } else if (entity) items.push(issueItem(issue, entity.entity_id, entity.label, draft))
  }
  return items
}

/** 의미 검토 지적의 처리: 화면에서 고른 것, 없으면 이전 ERD 버전에서 이어받은 처리('kept') */
export function remarkDisposition(issue: Issue, draft: DraftState): string | undefined {
  return draft.dispositions?.[issue.issue_id]?.choice ?? (issue.resolution ? 'kept' : undefined)
}

function remarkItem(issue: Issue, targetId: string | undefined, targetLabel: string | undefined, draft: DraftState): ReviewItem {
  const [title, ...rest] = issue.message.split('\n')
  return {
    id: `r:${issue.issue_id}`,
    kind: 'remark',
    title,
    detail: [...rest, issue.attempts > 0 ? '데이터 모델 Agent가 이 지적으로 한 번 고친 뒤에도 남은 지적입니다.' : ''].filter(Boolean).join('\n'),
    targetId,
    targetLabel,
    required: true,
    resolved: Boolean(remarkDisposition(issue, draft)),
    auto: false,
    issue,
  }
}

export function assumptionId(functionId: string, rule: string) {
  return `a:${functionId}:${rule}`
}

function autoCheck(id: string, title: string, f: FunctionSpec): ReviewItem {
  return { id, kind: 'check', title, targetId: f.function_id, targetLabel: f.name || f.function_id, required: true, resolved: false, auto: true }
}

function issueItem(issue: Issue, targetId: string | undefined, targetLabel: string | undefined, draft: DraftState): ReviewItem {
  const id = `i:${issue.issue_id}`
  return {
    id,
    kind: 'issue',
    title: issue.message,
    targetId,
    targetLabel,
    required: issue.severity === 'ERROR',
    resolved: Boolean(draft.checked[id]),
    auto: false,
    issue,
  }
}

export function summarize(items: ReviewItem[]) {
  const done = items.filter((i) => i.resolved).length
  const requiredLeft = items.filter((i) => i.required && !i.resolved).length
  return { total: items.length, done, left: items.length - done, requiredLeft }
}

/** 기능·테이블 ID별 남은 항목 수 (목록 배지용) */
export function openCountByTarget(items: ReviewItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const i of items) if (!i.resolved && i.targetId) m.set(i.targetId, (m.get(i.targetId) ?? 0) + 1)
  return m
}
