import { useEffect, useMemo, useState } from 'react'
import { AssumptionText, Empty, Field, IdList, SearchBox, Toolbar, matches } from '../components/ui'
import { useDesign, useFocusTarget } from '../context'
import type { FunctionIO, FunctionSpec } from '../types'

export function Functions() {
  const { design, focus } = useDesign()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (focus) setQuery('')
  }, [focus])

  // 기능 명세는 원문 요구사항 번호(group) 단위로 만들어지므로 그 단위로 묶어 보여준다
  const groups = useMemo(() => {
    const shown = design.functions.filter((f) =>
      matches(query, f.function_id, f.name, f.description, f.group, ...f.actors, ...f.business_rules))
    const byGroup = new Map<string, FunctionSpec[]>()
    for (const f of shown) byGroup.set(f.group, [...(byGroup.get(f.group) ?? []), f])
    return [...byGroup.entries()]
  }, [design.functions, query])

  const total = groups.reduce((n, [, fs]) => n + fs.length, 0)

  return (
    <div>
      <Toolbar summary={`${total} / ${design.functions.length}개`}>
        <SearchBox value={query} onChange={setQuery} placeholder="ID·이름·행위자·업무 규칙 검색" />
      </Toolbar>
      {groups.length === 0 ? <Empty>조건에 맞는 기능이 없습니다.</Empty> : groups.map(([group, fs]) => (
        <section key={group} className="group" aria-label={`${group} 기능`}>
          <h2 className="group__title">{group}</h2>
          <ul className="list">{fs.map((f) => <FunctionItem key={f.function_id} fn={f} />)}</ul>
        </section>
      ))}
    </div>
  )
}

function FunctionItem({ fn }: { fn: FunctionSpec }) {
  const { links } = useDesign()
  const { ref, focused } = useFocusTarget<HTMLLIElement>(fn.function_id)
  const [open, setOpen] = useState(false)
  const expanded = open || focused
  const assumptions = fn.business_rules.filter((r) => r.includes('(가정)')).length
  const unconfirmed = fn.business_rules.filter((r) => r.includes('(확인 필요)')).length

  return (
    <li ref={ref} className={focused ? 'item item--focused' : 'item'}>
      <button type="button" className="item__head" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
        <span className="id">{fn.function_id}</span>
        <span className="item__title">{fn.name}</span>
        <span className="item__badges">
          {unconfirmed > 0 && <span className="unconfirmed-count">확인 필요 {unconfirmed}</span>}
          {assumptions > 0 && <span className="assumed-count">가정 {assumptions}</span>}
        </span>
      </button>
      {expanded && (
        <div className="item__body">
          <p className="prose">{fn.description}</p>
          <dl className="fields">
            <Field term="행위자">{fn.actors.join(', ') || '—'}</Field>
            <Field term="근거 요구사항"><IdList ids={fn.requirement_ids} /></Field>
            <Field term="적용 비기능"><IdList ids={links.nfrsOfFunc.get(fn.function_id) ?? fn.nfr_ids} /></Field>
            <Field term="사용 테이블"><IdList ids={links.entitiesOfFunc.get(fn.function_id) ?? []} empty="연결된 테이블 없음" /></Field>
          </dl>
          {fn.preconditions.length > 0 && (
            <>
              <h3 className="subhead">사전 조건</h3>
              <ul className="bullets">{fn.preconditions.map((p) => <li key={p}>{p}</li>)}</ul>
            </>
          )}
          <div className="io">
            <IoTable title="입력" rows={fn.inputs} />
            <IoTable title="출력" rows={fn.outputs} />
          </div>
          {fn.business_rules.length > 0 && (
            <>
              <h3 className="subhead">업무 규칙</h3>
              <ul className="bullets">{fn.business_rules.map((r) => <li key={r}><AssumptionText text={r} /></li>)}</ul>
            </>
          )}
          {fn.normal_flow.length > 0 && (
            <>
              <h3 className="subhead">처리 순서</h3>
              <ol className="flow">{fn.normal_flow.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </>
          )}
          {fn.exception_flows.length > 0 && (
            <>
              <h3 className="subhead">예외 처리</h3>
              <dl className="exceptions">
                {fn.exception_flows.map((e) => (
                  <div key={e.condition} className="exceptions__row">
                    <dt>{e.condition}</dt>
                    <dd>{e.handling}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function IoTable({ title, rows }: { title: string; rows: FunctionIO[] }) {
  return (
    <div className="io__col">
      <h3 className="subhead">{title}</h3>
      {rows.length === 0 ? <p className="muted">없음</p> : (
        <ul className="io__list">
          {rows.map((r) => (
            <li key={r.name}>
              <span className="io__name">{r.name}{!r.required && <span className="muted"> (선택)</span>}</span>
              {r.description && <span className="io__desc">{r.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
