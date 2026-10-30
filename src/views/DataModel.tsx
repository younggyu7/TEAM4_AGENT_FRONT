import { useEffect, useMemo, useState } from 'react'
import { getFile } from '../api'
import { Mermaid } from '../components/Mermaid'
import { Badge, Empty, Field, IdLink, IdList, SearchBox, Segmented, matches } from '../components/ui'
import { useDesign } from '../context'
import { ENTITY_KIND, label } from '../labels'
import type { Attribute, Entity, Relation } from '../types'

type Mode = 'table' | 'erd'

export function DataModel() {
  const { design, project, versionNumber, focus, go } = useDesign()
  const { entities, relations } = design.data_model
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('table')
  const selectedId = focus && entities.some((e) => e.entity_id === focus) ? focus : entities[0]?.entity_id
  const selected = entities.find((e) => e.entity_id === selectedId)

  useEffect(() => {
    if (focus) setMode('table')
  }, [focus])

  const shown = useMemo(
    () => entities.filter((e) => matches(query, e.entity_id, e.label, e.description)),
    [entities, query],
  )

  if (entities.length === 0) return <Empty>데이터 모델이 없습니다. 데이터 모델 Agent가 실패했는지 판단 기록을 확인하세요.</Empty>

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar__controls">
          <Segmented<Mode>
            label="보기 방식"
            value={mode}
            onChange={setMode}
            options={[{ value: 'table', label: '테이블 정의' }, { value: 'erd', label: '전체 ERD' }]}
          />
        </div>
        <div className="toolbar__summary">테이블 {entities.length} · 관계 {relations.length}</div>
      </div>
      {mode === 'erd' ? <FullErd project={project} version={versionNumber} count={entities.length} /> : (
        <div className="split">
          <nav className="split__nav" aria-label="테이블 목록">
            <SearchBox value={query} onChange={setQuery} placeholder="테이블 검색" />
            <ul className="entities">
              {shown.map((e) => (
                <li key={e.entity_id}>
                  <button
                    type="button"
                    className="entities__item"
                    aria-current={e.entity_id === selectedId ? 'true' : undefined}
                    onClick={() => go('data', e.entity_id)}
                  >
                    <span className="entities__name">{e.entity_id}</span>
                    <span className="entities__label">{e.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {selected && <EntityDetail entity={selected} relations={relations} />}
        </div>
      )}
    </div>
  )
}

function EntityDetail({ entity, relations }: { entity: Entity; relations: Relation[] }) {
  const { links, design } = useDesign()
  const parents = relations.filter((r) => r.child === entity.entity_id)
  const children = relations.filter((r) => r.parent === entity.entity_id)
  const neighborhood = useMemo(() => neighborhoodErd(
    entity,
    relations.filter((r) => r.child === entity.entity_id || r.parent === entity.entity_id),
    design.data_model.entities,
  ), [entity, relations, design.data_model.entities])

  return (
    <article className="split__main" aria-labelledby="entity-title">
      <header className="entity__head">
        <h2 id="entity-title" className="entity__title">
          <span className="code">{entity.entity_id}</span> {entity.label}
        </h2>
        <Badge tone="muted">{label(ENTITY_KIND, entity.kind)}</Badge>
      </header>
      {entity.description && <p className="prose">{entity.description}</p>}

      <div className="tablewrap">
        <table className="columns">
          <caption className="sr-only">{entity.entity_id} 컬럼</caption>
          <thead>
            <tr><th scope="col">컬럼</th><th scope="col">이름</th><th scope="col">타입</th><th scope="col">필수</th><th scope="col">키</th><th scope="col">허용값·설명</th></tr>
          </thead>
          <tbody>
            {entity.attributes.map((a) => (
              <tr key={a.name}>
                <td className="code">{a.name}</td>
                <td>{a.label}</td>
                <td className="code">{a.data_type}{a.length ? `(${a.length})` : ''}</td>
                <td>{a.nullable ? '' : '필수'}</td>
                <td><Keys attr={a} /></td>
                <td>
                  {a.allowed_values.length > 0 && <span className="code values">{a.allowed_values.join(' | ')}</span>}
                  {a.description && <span className="muted">{a.description}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="fields">
        <Field term="참조하는 테이블">
          {parents.length ? <span className="idlist">{parents.map((r) => <span key={r.relation_id}><IdLink id={r.parent} /> <span className="muted code">({r.fk_attribute})</span></span>)}</span> : <span className="muted">없음</span>}
        </Field>
        <Field term="참조받는 테이블">
          {children.length ? <IdList ids={[...new Set(children.map((r) => r.child))]} /> : <span className="muted">없음</span>}
        </Field>
        <Field term="사용하는 기능"><IdList ids={links.funcsOfEntity.get(entity.entity_id) ?? entity.function_ids} /></Field>
      </dl>

      {parents.length + children.length > 0 && (
        <>
          <h3 className="subhead">연결된 테이블 ERD</h3>
          <Mermaid code={neighborhood} label={`${entity.entity_id}와 연결된 테이블의 ERD`} />
        </>
      )}
    </article>
  )
}

function Keys({ attr }: { attr: Attribute }) {
  const keys = [attr.primary_key && 'PK', attr.references && `FK → ${attr.references}`, attr.unique && 'UK'].filter(Boolean)
  return <span className="code">{keys.join(' ')}</span>
}

/** 선택한 테이블과 바로 연결된 테이블만 그린 Mermaid ERD (전체 ERD는 테이블이 많으면 읽기 어렵다) */
function neighborhoodErd(center: Entity, rels: Relation[], entities: Entity[]): string {
  const names = new Set([center.entity_id, ...rels.flatMap((r) => [r.parent, r.child])])
  const lines = ['erDiagram']
  for (const r of rels) {
    const left = r.optional ? '|o' : '||'
    const right = r.cardinality === '1:1' ? 'o|' : 'o{'
    lines.push(`    ${r.parent} ${left}--${right} ${r.child} : "${r.fk_attribute}"`)
  }
  for (const e of entities.filter((x) => names.has(x.entity_id))) {
    // 가운데 테이블은 전체 컬럼, 이웃 테이블은 키 컬럼만
    const attrs = e.entity_id === center.entity_id ? e.attributes : e.attributes.filter((a) => a.primary_key || a.references)
    lines.push(`    ${e.entity_id} {`)
    for (const a of attrs) {
      const keys = [a.primary_key && 'PK', a.references && 'FK', a.unique && 'UK'].filter(Boolean).join(',')
      lines.push(`        ${a.data_type} ${a.name}${keys ? ' ' + keys : ''} "${(a.label || a.name).replace(/"/g, "'")}"`)
    }
    lines.push('    }')
  }
  return lines.join('\n')
}

function FullErd({ project, version, count }: { project: string; version: string; count: number }) {
  const [code, setCode] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    getFile(project, version, 'erd.mmd').then(setCode)
  }, [project, version])
  if (code === undefined) return <p className="muted">ERD 파일을 불러오는 중…</p>
  if (code === null) return <Empty>이 버전에는 erd.mmd 파일이 없습니다.</Empty>
  return (
    <>
      {count > 30 && <p className="note">테이블이 {count}개라 그림이 큽니다. 가로로 스크롤해서 보세요. 테이블 하나씩 보려면 '테이블 정의'를 쓰세요.</p>}
      <div className="diagram-scroll"><Mermaid code={code} label="전체 ERD" /></div>
    </>
  )
}
