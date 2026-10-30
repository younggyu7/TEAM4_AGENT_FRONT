import { useMemo, useState } from 'react'
import { Segmented, Toolbar } from '../components/ui'
import { useDesign, type Links } from '../context'
import type { Design } from '../types'

type Column = 'req' | 'func' | 'entity'
interface Node { column: Column; id: string; name: string; gap?: string }
type Show = 'all' | 'gaps'

/** 선택한 항목과 이어진 요구사항·기능·테이블 (기능을 거쳐 양쪽으로 따라간다) */
function connected(sel: Node, links: Links, includeNfr: boolean): Set<string> {
  const ids = new Set([sel.id])
  const reqsOf = (f: string) => [...(links.reqsOfFunc.get(f) ?? []), ...(includeNfr ? links.nfrsOfFunc.get(f) ?? [] : [])]
  let funcs: string[] = []
  if (sel.column === 'func') funcs = [sel.id]
  if (sel.column === 'req') funcs = links.funcsOfReq.get(sel.id) ?? []
  if (sel.column === 'entity') funcs = links.funcsOfEntity.get(sel.id) ?? []
  for (const f of funcs) {
    ids.add(f)
    reqsOf(f).forEach((r) => ids.add(r))
    ;(links.entitiesOfFunc.get(f) ?? []).forEach((e) => ids.add(e))
  }
  // 요구사항을 고르면 그 기능을 쓰는 다른 요구사항까지 넓히지 않는다
  if (sel.column === 'req') for (const f of funcs) reqsOf(f).forEach((r) => r !== sel.id && ids.delete(r))
  return ids
}

function nodes(design: Design, links: Links, includeNfr: boolean): Record<Column, Node[]> {
  const reqs = design.requirements
    .filter((r) => r.scope === 'SYSTEM' && (includeNfr || r.type === 'FUNCTIONAL'))
    .map((r): Node => ({
      column: 'req', id: r.requirement_id, name: r.title,
      gap: r.type === 'FUNCTIONAL' && !links.funcsOfReq.get(r.requirement_id)?.length ? '기능 없음' : undefined,
    }))
  const funcs = design.functions.map((f): Node => ({
    column: 'func', id: f.function_id, name: f.name,
    gap: !links.entitiesOfFunc.get(f.function_id)?.length ? '테이블 없음' : undefined,
  }))
  const entities = design.data_model.entities.map((e): Node => ({
    column: 'entity', id: e.entity_id, name: e.label,
    gap: !links.funcsOfEntity.get(e.entity_id)?.length ? '쓰는 기능 없음' : undefined,
  }))
  return { req: reqs, func: funcs, entity: entities }
}

const COLUMNS: { key: Column; title: string }[] = [
  { key: 'req', title: '요구사항' },
  { key: 'func', title: '기능' },
  { key: 'entity', title: '테이블' },
]

export function Trace() {
  const { design, links, go } = useDesign()
  const [includeNfr, setIncludeNfr] = useState(false)
  const [show, setShow] = useState<Show>('all')
  const [selected, setSelected] = useState<Node | null>(null)

  const columns = useMemo(() => nodes(design, links, includeNfr), [design, links, includeNfr])
  const lit = useMemo(() => (selected ? connected(selected, links, includeNfr) : null), [selected, links, includeNfr])
  const gaps = columns.req.filter((n) => n.gap).length + columns.func.filter((n) => n.gap).length + columns.entity.filter((n) => n.gap).length

  const tabOf: Record<Column, 'requirements' | 'functions' | 'data'> = { req: 'requirements', func: 'functions', entity: 'data' }

  return (
    <div>
      <Toolbar summary={gaps === 0 ? '연결 누락 없음' : `연결 누락 ${gaps}건`}>
        <Segmented<Show>
          label="보기"
          value={show}
          onChange={setShow}
          options={[{ value: 'all', label: '전체' }, { value: 'gaps', label: '누락만', count: gaps }]}
        />
        <label className="check">
          <input type="checkbox" checked={includeNfr} onChange={(e) => { setIncludeNfr(e.target.checked); setSelected(null) }} />
          비기능 요구사항 포함
        </label>
      </Toolbar>
      <p className="note">
        {selected
          ? <>
              <strong>{selected.id}</strong>와 이어진 항목을 표시했습니다.{' '}
              <button type="button" className="textbutton" onClick={() => go(tabOf[selected.column], selected.id)}>자세히 보기</button>{' '}
              <button type="button" className="textbutton" onClick={() => setSelected(null)}>선택 해제</button>
            </>
          : '항목을 누르면 요구사항 → 기능 → 테이블로 이어진 것만 밝게 표시합니다.'}
      </p>
      <div className="trace">
        {COLUMNS.map(({ key, title }) => {
          const list = columns[key].filter((n) => show === 'all' || n.gap || lit?.has(n.id))
          return (
            <section key={key} className="trace__col" aria-label={title}>
              <h2 className="trace__title">{title} <span className="muted">{columns[key].length}</span></h2>
              <ul className="trace__list">
                {list.map((n) => {
                  const state = !lit ? '' : n.id === selected?.id ? 'is-selected' : lit.has(n.id) ? 'is-lit' : 'is-dim'
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`trace__node ${state}`}
                        aria-pressed={n.id === selected?.id}
                        onClick={() => setSelected(n.id === selected?.id ? null : n)}
                      >
                        <span className="trace__id">{n.id}</span>
                        <span className="trace__name">{n.name}</span>
                        {n.gap && <span className="trace__gap">{n.gap}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
