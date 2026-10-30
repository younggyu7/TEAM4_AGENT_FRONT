import { useEffect, useState } from 'react'
import { Badge, Empty, Field, IdList, Segmented, Toolbar } from '../components/ui'
import { useDesign, useFocusTarget } from '../context'
import { QUESTION_KIND, QUESTION_STATUS, label } from '../labels'
import type { Question } from '../types'

type Status = 'ALL' | Question['status']

export function Questions() {
  const { design, focus } = useDesign()
  const questions = design.questions
  const [status, setStatus] = useState<Status>('ALL')

  useEffect(() => {
    if (focus) setStatus('ALL')
  }, [focus])

  const shown = questions.filter((q) => status === 'ALL' || q.status === status)
  const count = (s: Status) => questions.filter((q) => s === 'ALL' || q.status === s).length

  return (
    <div>
      <Toolbar summary={`${shown.length} / ${questions.length}건`}>
        <Segmented<Status>
          label="답변 상태"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: '전체', count: count('ALL') },
            { value: 'PENDING', label: '답변 대기', count: count('PENDING') },
            { value: 'ANSWERED', label: '답변함', count: count('ANSWERED') },
            { value: 'DEFERRED', label: '보류', count: count('DEFERRED') },
          ]}
        />
      </Toolbar>
      <p className="note">
        답변은 아직 화면에서 넣을 수 없습니다. 보류는 --defer로 실행해 답을 받지 않고 가정으로 진행한 질문입니다.
      </p>
      {shown.length === 0 ? <Empty>해당하는 질문이 없습니다.</Empty> : (
        <ul className="list">{shown.map((q) => <QuestionItem key={q.question_id} q={q} />)}</ul>
      )}
    </div>
  )
}

function QuestionItem({ q }: { q: Question }) {
  const { ref, focused } = useFocusTarget<HTMLLIElement>(q.question_id)
  const tone = q.status === 'PENDING' ? 'warn' : q.status === 'ANSWERED' ? 'pass' : 'muted'
  return (
    <li ref={ref} className={focused ? 'item item--focused item--static' : 'item item--static'}>
      <div className="item__head item__head--static">
        <span className="id">{q.question_id}</span>
        <span className="item__title">{q.question}</span>
        <span className="item__badges">
          <Badge>{label(QUESTION_KIND, q.kind)}</Badge>
          {q.blocking && <Badge tone="fail">진행 차단</Badge>}
          <Badge tone={tone}>{label(QUESTION_STATUS, q.status)}</Badge>
        </span>
      </div>
      <div className="item__body">
        <p className="prose muted">{q.context}</p>
        {q.options.length > 0 && (
          <ul className="options" aria-label="선택지">
            {q.options.map((o) => (
              <li key={o} className={o === q.answer ? 'options__item options__item--chosen' : 'options__item'}>
                {o}
                {o === q.answer && <span className="sr-only"> (선택한 답)</span>}
              </li>
            ))}
          </ul>
        )}
        {q.answer && !q.options.includes(q.answer) && (
          <p className="prose"><strong>답변</strong> {q.answer}</p>
        )}
        <dl className="fields">
          <Field term="관련 요구사항"><IdList ids={q.requirement_ids} /></Field>
          <Field term="원문 블록">{q.evidence_block_ids.join(', ') || '—'}</Field>
        </dl>
      </div>
    </li>
  )
}
