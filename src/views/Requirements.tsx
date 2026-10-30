import { useEffect, useMemo, useState } from 'react'
import { Badge, Empty, Field, IdList, SearchBox, Segmented, Toolbar, matches } from '../components/ui'
import { useDesign, useFocusTarget } from '../context'
import { PRIORITY, REQ_SCOPE, REQ_STATUS, REQ_TYPE, label } from '../labels'
import type { Requirement } from '../types'

type Kind = 'ALL' | 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'PROJECT'
type Status = 'ALL' | Requirement['status']

const kindOf = (r: Requirement): Exclude<Kind, 'ALL'> => (r.scope === 'PROJECT' ? 'PROJECT' : r.type)

export function Requirements() {
  const { design, focus } = useDesign()
  const reqs = design.requirements
  const [kind, setKind] = useState<Kind>('ALL')
  const [status, setStatus] = useState<Status>('ALL')
  const [query, setQuery] = useState('')

  // 다른 탭에서 특정 요구사항으로 왔으면 필터 때문에 안 보이는 일이 없게 푼다
  useEffect(() => {
    if (focus) { setKind('ALL'); setStatus('ALL'); setQuery('') }
  }, [focus])

  const shown = useMemo(() => reqs.filter((r) =>
    (kind === 'ALL' || kindOf(r) === kind)
    && (status === 'ALL' || r.status === status)
    && matches(query, r.requirement_id, r.title, r.description, r.category, r.source_ref)), [reqs, kind, status, query])

  const count = (k: Kind) => reqs.filter((r) => k === 'ALL' || kindOf(r) === k).length

  return (
    <div>
      <Toolbar summary={`${shown.length} / ${reqs.length}건`}>
        <Segmented<Kind>
          label="요구사항 구분"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: '전체', count: count('ALL') },
            { value: 'FUNCTIONAL', label: '기능', count: count('FUNCTIONAL') },
            { value: 'NON_FUNCTIONAL', label: '비기능', count: count('NON_FUNCTIONAL') },
            { value: 'PROJECT', label: '수행 의무', count: count('PROJECT') },
          ]}
        />
        <Segmented<Status>
          label="확정 여부"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: '모두' },
            { value: 'CONFIRMED', label: '확정' },
            { value: 'ASSUMED', label: '가정' },
            { value: 'OPEN', label: '미확정' },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="ID·이름·내용 검색" />
      </Toolbar>
      {shown.length === 0 ? <Empty>조건에 맞는 요구사항이 없습니다. 필터를 바꿔 보세요.</Empty> : (
        <ul className="list">
          {shown.map((r) => <RequirementItem key={r.requirement_id} req={r} />)}
        </ul>
      )}
    </div>
  )
}

function RequirementItem({ req }: { req: Requirement }) {
  const { links } = useDesign()
  const { ref, focused } = useFocusTarget<HTMLLIElement>(req.requirement_id)
  const [open, setOpen] = useState(false)
  const expanded = open || focused
  const funcs = links.funcsOfReq.get(req.requirement_id) ?? []
  const designed = req.scope === 'SYSTEM'

  return (
    <li ref={ref} className={focused ? 'item item--focused' : 'item'}>
      <button type="button" className="item__head" aria-expanded={expanded} onClick={() => setOpen(!expanded)}>
        <span className="id">{req.requirement_id}</span>
        <span className="item__title">{req.title}</span>
        <span className="item__badges">
          <Badge>{label(REQ_TYPE, req.type)}</Badge>
          {req.scope === 'PROJECT' && <Badge tone="muted">{label(REQ_SCOPE, req.scope)}</Badge>}
          {req.category !== label(REQ_TYPE, req.type) && <Badge tone="muted">{req.category}</Badge>}
          {req.status !== 'CONFIRMED' && <Badge tone="warn">{label(REQ_STATUS, req.status)}</Badge>}
        </span>
      </button>
      {expanded && (
        <div className="item__body">
          <p className="prose">{req.description}</p>
          {req.evidence.length > 0 && (
            <div className="evidence">
              <h3 className="subhead">원문 근거</h3>
              {req.evidence.map((e) => (
                <blockquote key={e.source_block_id + e.quote} className="quote">
                  <mark className={e.verified ? 'quote__text' : 'quote__text quote__text--unverified'}>{e.quote}</mark>
                  <footer className="quote__meta">
                    블록 {e.source_block_id}
                    {!e.verified && <Badge tone="fail">원문에서 확인 안 됨</Badge>}
                  </footer>
                </blockquote>
              ))}
            </div>
          )}
          {req.acceptance_criteria.length > 0 && (
            <>
              <h3 className="subhead">검수 기준</h3>
              <ul className="bullets">{req.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          {req.decisions.length > 0 && (
            <>
              <h3 className="subhead">반영된 사용자 결정</h3>
              <ul className="bullets">{req.decisions.map((d) => <li key={d}>{d}</li>)}</ul>
            </>
          )}
          <dl className="fields">
            <Field term="원문 번호">{req.source_ref || req.source_key || '—'}</Field>
            <Field term="우선순위">{label(PRIORITY, req.priority)}</Field>
            <Field term={req.type === 'FUNCTIONAL' ? '구현 기능' : '적용 기능'}>
              {designed ? <IdList ids={funcs} empty="연결된 기능 없음" /> : <span className="muted">수행 의무라 설계 대상이 아님</span>}
            </Field>
          </dl>
        </div>
      )}
    </li>
  )
}
