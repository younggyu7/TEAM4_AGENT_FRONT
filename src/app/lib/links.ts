import { buildLinks, type Links } from '../../context'
import type { Design } from '../../types'
import type { Page } from './route'

export { buildLinks, type Links }

/** ID → 그 항목을 보여주는 화면 (ID를 누르면 그 화면의 그 항목으로 간다) */
export function buildIdPages(design: Design): Map<string, Page> {
  const index = new Map<string, Page>()
  design.requirements.forEach((r) => index.set(r.requirement_id, 'requirements'))
  design.questions.forEach((q) => index.set(q.question_id, 'questions'))
  design.functions.forEach((f) => index.set(f.function_id, 'spec'))
  design.data_model.entities.forEach((e) => index.set(e.entity_id, 'erd'))
  design.issues.forEach((i) => index.set(i.issue_id, 'issues'))
  return index
}
