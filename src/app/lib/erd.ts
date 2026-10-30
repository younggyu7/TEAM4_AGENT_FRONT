import type { Entity } from '../../types'

export interface EdgeInfo {
  parent: string
  child: string
  fk: string
  oneToOne: boolean
  optional: boolean
}

/** 편집한 컬럼의 '참조 테이블'에서 관계를 다시 만든다 (원본 relations는 편집을 따라오지 못한다) */
export function relationsOf(entities: Entity[]): EdgeInfo[] {
  return entities.flatMap((e) => e.attributes
    .filter((a) => a.references)
    .map((a) => ({ parent: a.references, child: e.entity_id, fk: a.name, oneToOne: a.unique, optional: a.nullable })))
}

const quote = (s: string) => `"${s.replace(/"/g, "'")}"`
// Mermaid 식별자에 쓸 수 없는 글자는 밑줄로
export const ident = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_') || '_'

function entityBlock(e: Entity, attrs: Entity['attributes']): string[] {
  const lines = [`    ${ident(e.entity_id)} {`]
  for (const a of attrs) {
    if (!a.name.trim()) continue
    const keys = [a.primary_key && 'PK', a.references && 'FK', a.unique && 'UK'].filter(Boolean).join(',')
    lines.push(`        ${ident(a.data_type || 'unknown')} ${ident(a.name)}${keys ? ' ' + keys : ''} ${quote(a.label || a.name)}`)
  }
  lines.push('    }')
  return lines
}

/** 전체 ERD. 테이블이 많아 기본은 키 컬럼(PK·FK)만, allColumns면 모든 컬럼 */
export function fullErd(entities: Entity[], allColumns: boolean): string {
  const ids = new Set(entities.map((e) => e.entity_id))
  // 대부분이 회원 테이블의 자식이라 위→아래 배치는 한 줄로 아주 길어진다. 왼쪽→오른쪽으로 쌓는다
  const lines = ['erDiagram', '    direction LR']
  for (const r of relationsOf(entities)) {
    if (!ids.has(r.parent) || !ids.has(r.child)) continue   // 없는 테이블을 가리키는 FK는 '확인 필요'에서 따로 알린다
    lines.push(`    ${ident(r.parent)} ${r.optional ? '|o' : '||'}--${r.oneToOne ? 'o|' : 'o{'} ${ident(r.child)} : ${quote(r.fk || '-')}`)
  }
  for (const e of entities) {
    lines.push(...entityBlock(e, allColumns ? e.attributes : e.attributes.filter((a) => a.primary_key || a.references)))
  }
  return lines.join('\n')
}

/** 선택한 테이블과 바로 연결된 테이블만 그린 Mermaid ERD (가운데 테이블은 전체 컬럼, 이웃은 키 컬럼만).
 *  회원 테이블처럼 이웃이 수십 개면 그림이 읽을 수 없을 만큼 작아지므로 limit개까지만 그린다. */
export function neighborhoodErd(centerId: string, entities: Entity[], limit = 8) {
  const all = relationsOf(entities).filter((r) => r.parent === centerId || r.child === centerId)
  const neighbors = [...new Set(all.map((r) => (r.parent === centerId ? r.child : r.parent)))].filter((x) => x !== centerId)
  const drawn = neighbors.slice(0, limit)
  const keep = new Set([centerId, ...drawn])
  const edges = all.filter((r) => keep.has(r.parent) && keep.has(r.child))
  const names = keep
  // 왼쪽→오른쪽 배치: 이웃이 세로로 쌓여 카드 폭에 맞고, 넘치면 세로로 스크롤한다
  const lines = ['erDiagram', '    direction LR']
  for (const r of edges) {
    const left = r.optional ? '|o' : '||'
    const right = r.oneToOne ? 'o|' : 'o{'
    lines.push(`    ${ident(r.parent)} ${left}--${right} ${ident(r.child)} : ${quote(r.fk || '-')}`)
  }
  for (const e of entities.filter((x) => names.has(x.entity_id))) {
    lines.push(...entityBlock(e, e.entity_id === centerId ? e.attributes : e.attributes.filter((a) => a.primary_key || a.references)))
  }
  return { code: lines.join('\n'), neighbors, drawn }
}

export const DATA_TYPES = ['bigint', 'integer', 'varchar', 'text', 'boolean', 'decimal', 'date', 'timestamp', 'jsonb', 'uuid']
