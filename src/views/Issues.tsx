import { useEffect, useMemo, useState } from 'react'
import { Badge, Empty, IdList, SearchBox, Segmented, Toolbar, matches, type Tone } from '../components/ui'
import { useDesign, useFocusTarget } from '../context'
import { AGENT, ISSUE_STATUS, SEMANTIC_KIND, SEVERITY, issueKindLabel, label } from '../labels'
import type { Issue } from '../types'

type Source = 'ALL' | 'semantic' | 'check'
type Status = 'ACTIVE' | 'ALL' | 'RESOLVED'

const SEVERITY_TONE: Record<Issue['severity'], Tone> = { ERROR: 'fail', WARNING: 'warn', INFO: 'muted' }

export function Issues() {
  const { design, focus } = useDesign()
  const issues = design.issues
  const [source, setSource] = useState<Source>('ALL')
  const [status, setStatus] = useState<Status>('ACTIVE')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (focus) { setSource('ALL'); setStatus('ALL'); setQuery('') }
  }, [focus])

  const shown = useMemo(() => issues.filter((i) =>
    (source === 'ALL' || (source === 'semantic') === i.kind.startsWith('SEM_'))
    && (status === 'ALL' || (status === 'RESOLVED') === (i.status === 'RESOLVED'))
    && matches(query, i.issue_id, i.kind, issueKindLabel(i.kind), i.message, i.target_id)), [issues, source, status, query])

  return (
    <div>
      <Toolbar summary={`${shown.length} / ${issues.length}건`}>
        <Segmented<Source>
          label="출처"
          value={source}
          onChange={setSource}
          options={[
            { value: 'ALL', label: '전체' },
            { value: 'semantic', label: '의미 검토 지적', count: issues.filter((i) => i.kind.startsWith('SEM_')).length },
            { value: 'check', label: '규칙 검사', count: issues.filter((i) => !i.kind.startsWith('SEM_')).length },
          ]}
        />
        <Segmented<Status>
          label="상태"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ACTIVE', label: '남은 것' },
            { value: 'RESOLVED', label: '해결됨' },
            { value: 'ALL', label: '모두' },
          ]}
        />
        <SearchBox value={query} onChange={setQuery} placeholder="내용·대상 ID 검색" />
      </Toolbar>
      {shown.length === 0 ? <Empty>해당하는 이슈가 없습니다.</Empty> : (
        <ul className="list">{shown.map((i) => <IssueItem key={i.issue_id} issue={i} />)}</ul>
      )}
    </div>
  )
}

/** 의미 검토 메시지는 '문제\n근거: …\n제안: …' 형태라 나눠서 보여준다. */
function splitMessage(message: string) {
  const [summary, ...rest] = message.split('\n')
  const parts = rest.map((line) => {
    const m = /^(근거|제안):\s*(.*)$/.exec(line)
    return m ? { term: m[1], text: m[2] } : { term: '', text: line }
  })
  return { summary, parts }
}

function IssueItem({ issue }: { issue: Issue }) {
  const { ref, focused } = useFocusTarget<HTMLLIElement>(issue.issue_id)
  const { summary, parts } = splitMessage(issue.message)
  const targets = issue.target_id ? issue.target_id.split(/,\s*/) : []
  const owner = SEMANTIC_KIND[issue.kind]?.[1] ?? label(AGENT, issue.target_agent)
  const resolved = issue.status === 'RESOLVED'

  return (
    <li ref={ref} className={`item item--static${focused ? ' item--focused' : ''}${resolved ? ' item--resolved' : ''}`}>
      <div className="item__head item__head--static">
        <span className="id">{issue.issue_id}</span>
        <span className="item__title">{summary}</span>
        <span className="item__badges">
          <Badge tone={SEVERITY_TONE[issue.severity]}>{label(SEVERITY, issue.severity)}</Badge>
          <Badge tone="muted" title={issue.kind}>{issueKindLabel(issue.kind)}</Badge>
          {issue.status !== 'OPEN' && <Badge tone={resolved ? 'pass' : 'fail'}>{label(ISSUE_STATUS, issue.status)}</Badge>}
        </span>
      </div>
      <div className="item__body">
        {parts.length > 0 && (
          <dl className="remark">
            {parts.map((p, i) => (
              <div key={i} className="remark__row">
                {p.term && <dt>{p.term}</dt>}
                <dd>{p.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="meta">
          <span>대상 <IdList ids={targets} empty="—" /></span>
          <span>확인 담당 {owner}</span>
          {issue.raised_by && <span>발견 {label(AGENT, issue.raised_by)}</span>}
          {issue.attempts > 0 && <span>수정 시도 {issue.attempts}회</span>}
        </p>
      </div>
    </li>
  )
}
