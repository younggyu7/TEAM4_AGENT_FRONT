import { ArrowRight, CheckCircle, LockSimple, MagicWand, Wrench } from '@phosphor-icons/react'
import { useId, useMemo, useState } from 'react'
import type { DispositionChoice } from '../../api'
import { formatDate } from '../../labels'
import type { Draft } from '../lib/draft'
import { KIND_LABEL, remarkDisposition, summarize, type ReviewItem, type ReviewKind } from '../lib/review'
import { Badge, Button, Checkbox, cx, Empty, fmt, Segmented, TextInput } from './ui'

type Filter = 'all' | 'required' | ReviewKind
const PAGE = 40

/**
 * 확정 전에 사람이 결정할 항목 목록 + 맨 아래 상태 막대.
 * 확정 버튼은 오른쪽 위에만 둔다 (기능 명세: '내보내기 → ERD 만들기', ERD: 'ERD 최종 확정하기'). 필수를 다 해결하면 초록색으로 켜진다.
 */
export function ReviewPanel({ items, draft, onJump, finalizedAt, subject, blockReason, action }: {
  items: ReviewItem[]
  draft: Draft
  onJump: (targetId: string) => void
  finalizedAt?: string
  subject: string
  /** 필수 항목과 별개로 확정을 막는 이유 (예: 저장 안 한 ERD 수정) */
  blockReason?: string
  /** 오른쪽 위 확정 버튼 이름 (안내 문구용) */
  action: string
}) {
  const [filter, setFilter] = useState<Filter>('required')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [limit, setLimit] = useState(PAGE)

  const counts = useMemo(() => {
    const open = (pred: (i: ReviewItem) => boolean) => items.filter((i) => pred(i) && (!onlyOpen || !i.resolved)).length
    return {
      all: open(() => true),
      required: open((i) => i.required),
      requirement: open((i) => i.kind === 'requirement'),
      question: open((i) => i.kind === 'question'),
      unconfirmed: open((i) => i.kind === 'unconfirmed'),
      assumption: open((i) => i.kind === 'assumption'),
      issue: open((i) => i.kind === 'issue'),
      remark: open((i) => i.kind === 'remark'),
      check: open((i) => i.kind === 'check'),
    }
  }, [items, onlyOpen])

  const shown = items
    .filter((i) => filter === 'all' || (filter === 'required' ? i.required : i.kind === filter))
    .filter((i) => !onlyOpen || !i.resolved)
    // 필수 먼저, 그다음 종류 순
    .sort((a, b) => Number(b.required) - Number(a.required))

  const s = summarize(items)
  const recommendedLeft = s.left - s.requiredLeft
  // 답하지 않은 질문 중 추천안이 있는 것 (초안이 이미 그 답을 가정했으므로 그대로 확정하는 경우가 많다)
  const fillable = items.filter((i) => i.question?.recommended && !i.resolved)
  const fillRecommended = () => fillable.forEach((i) => draft.setAnswer(i.question!.question_id, i.question!.recommended!))

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <Segmented<Filter>
          label="항목 종류"
          value={filter}
          onChange={(v) => { setFilter(v); setLimit(PAGE) }}
          options={[
            { value: 'required', label: '필수', count: counts.required },
            { value: 'all', label: '전체', count: counts.all },
            { value: 'requirement', label: KIND_LABEL.requirement, count: counts.requirement },
            { value: 'question', label: KIND_LABEL.question, count: counts.question },
            { value: 'unconfirmed', label: KIND_LABEL.unconfirmed, count: counts.unconfirmed },
            { value: 'assumption', label: KIND_LABEL.assumption, count: counts.assumption },
            { value: 'issue', label: KIND_LABEL.issue, count: counts.issue },
            { value: 'remark', label: KIND_LABEL.remark, count: counts.remark },
            { value: 'check', label: KIND_LABEL.check, count: counts.check },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          {fillable.length > 0 && (
            <Button size="sm" variant="ghost" icon={<MagicWand />} onClick={fillRecommended}>
              남은 질문 {fmt(fillable.length)}개 추천안으로 답하기
            </Button>
          )}
          <Checkbox checked={onlyOpen} onChange={(v) => { setOnlyOpen(v); setLimit(PAGE) }} label="남은 것만" />
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title={onlyOpen ? '이 분류에는 남은 항목이 없습니다' : '항목이 없습니다'}>
          {onlyOpen && s.left > 0 ? '다른 분류를 보거나 \'남은 것만\'을 끄면 확인한 항목도 볼 수 있습니다.' : undefined}
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {shown.slice(0, limit).map((item) => (
            <ReviewRow key={item.id} item={item} draft={draft} onJump={onJump} />
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <div className="border-t border-line px-5 py-3">
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            {fmt(Math.min(PAGE, shown.length - limit))}개 더 보기 <span className="text-fg-3">({fmt(shown.length - limit)}개 남음)</span>
          </Button>
        </div>
      )}

      {/* 상태 막대: 목록을 내려도 보이도록 카드 아래에 붙는다 (확정 버튼은 오른쪽 위) */}
      <div className="sticky bottom-0 mt-auto rounded-b-lg border-t border-line bg-card px-5 py-3 text-small" aria-live="polite">
        {finalizedAt && !blockReason ? (
          <p className="flex flex-wrap items-center gap-1.5 text-ok">
            <LockSimple size={16} weight="fill" aria-hidden="true" />{subject} 확정 완료 · {formatDate(finalizedAt)}
            <span className="text-fg-3">— 다음 단계로 넘어가 취소할 수 없습니다. 바꾸려면 오른쪽 위에서 새 버전을 만드세요.</span>
          </p>
        ) : blockReason ? (
          <p className="text-warn">{blockReason}</p>
        ) : s.requiredLeft > 0 ? (
          <p className="text-fg-2">필수 항목 <strong className="font-semibold text-warn tabular-nums">{s.requiredLeft}개</strong>를 해결하면 오른쪽 위 '{action}'이 켜집니다.</p>
        ) : (
          <p className="flex flex-wrap items-center gap-1.5 text-ok">
            <CheckCircle size={16} weight="fill" aria-hidden="true" />필수 항목을 모두 해결했습니다. 오른쪽 위 '{action}'을 누르세요.
            {recommendedLeft > 0 && <span className="text-fg-3">권장 항목 {fmt(recommendedLeft)}개는 남아 있어도 됩니다.</span>}
          </p>
        )}
      </div>
    </div>
  )
}

function ReviewRow({ item, draft, onJump }: { item: ReviewItem; draft: Draft; onJump: (id: string) => void }) {
  const detailId = useId()
  const tone = item.kind === 'check' || item.issue?.severity === 'ERROR' ? 'danger' : item.question ? 'info' : 'warn'

  return (
    <li className={cx('grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]', item.resolved && 'bg-sunken/60')}>
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={tone}>{KIND_LABEL[item.kind]}{item.issue && ` · ${item.issue.severity === 'ERROR' ? '오류' : item.issue.severity === 'WARNING' ? '경고' : '참고'}`}</Badge>
          {item.required && <Badge tone="neutral">필수</Badge>}
          {item.resolved && <Badge tone="ok" icon={<CheckCircle weight="fill" aria-hidden="true" />}>해결</Badge>}
          {item.question?.blocking && <Badge tone="danger">진행 막음</Badge>}
        </div>
        <p className={cx('text-label', item.resolved ? 'text-fg-3' : 'text-fg')}>{item.title}</p>
        {item.detail && <p id={detailId} className="mt-1 text-small whitespace-pre-line text-fg-3">{item.detail}</p>}
        {item.targetId && (
          <button
            type="button"
            onClick={() => onJump(item.targetId!)}
            className="mt-2 inline-flex min-h-8 items-center gap-1 rounded-sm text-small text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-fg"
          >
            <span className="font-mono text-micro">{item.targetId}</span>
            {item.targetLabel && <span className="truncate">{item.targetLabel}</span>}
            <ArrowRight size={14} aria-hidden="true" />
            <span className="sr-only">로 이동해 고치기</span>
          </button>
        )}
        {item.question && <QuestionAnswer item={item} draft={draft} />}
        {item.kind === 'remark' && <RemarkDisposition item={item} draft={draft} />}
      </div>

      <div className="sm:pt-6">
        {item.kind === 'remark' ? null : item.auto ? (
          <span className="inline-flex items-center gap-1.5 text-small text-fg-3"><Wrench size={14} aria-hidden="true" />고치면 저절로 해결</span>
        ) : !item.question && (
          <Checkbox
            checked={item.resolved}
            onChange={(v) => draft.setChecked(item.id, v)}
            label={item.kind === 'assumption' ? '가정 맞음' : item.kind === 'unconfirmed' ? '추천안 맞음' : '반영함'}
            describedBy={item.detail ? detailId : undefined}
          />
        )}
      </div>
    </li>
  )
}

const CHOICES: { value: DispositionChoice; label: string; hint: string }[] = [
  { value: 'applied', label: '반영함', hint: "ERD를 고쳐 반영했습니다 (테이블을 고친 뒤 'ERD 저장하고 새 버전 만들기')" },
  { value: 'not_issue', label: '문제 아님', hint: '지금 설계가 맞습니다' },
  { value: 'later', label: '미해결로 둠', hint: '고객 확인 등으로 나중에 정합니다' },
]

/** 의미 검토 지적 처리: 셋 중 하나를 반드시 고른다 (메모는 선택). ERD 저장·최종 확정 때 서버에 남는다 */
function RemarkDisposition({ item, draft }: { item: ReviewItem; draft: Draft }) {
  const issue = item.issue!
  const current = draft.state.dispositions?.[issue.issue_id]
  const kept = !current && remarkDisposition(issue, draft.state) === 'kept'
  const noteId = useId()
  return (
    <fieldset className="mt-3">
      <legend className="mb-1.5 text-micro text-fg-3">
        처리{kept && ` — 이전 ERD 버전에서 정함: ${issue.resolution} (바꾸려면 다시 고르세요)`}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {CHOICES.map((c) => {
          const chosen = current?.choice === c.value
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={chosen}
              title={c.hint}
              onClick={() => draft.setDisposition(issue.issue_id, chosen ? null : c.value)}
              className={cx(
                'min-h-8 rounded-sm border px-2.5 text-small transition-colors duration-150',
                chosen ? 'border-fg bg-primary text-on-primary' : 'border-line-strong bg-card text-fg-2 hover:border-control hover:text-fg',
              )}
            >
              {c.label}
            </button>
          )
        })}
      </div>
      {current && (
        <>
          <label htmlFor={noteId} className="mt-2 block text-micro text-fg-3">메모 (선택)</label>
          <TextInput id={noteId} dense className="mt-1 max-w-xl" placeholder="예: 임시저장·제출 두 경로라 정상"
            value={current.note} onChange={(e) => draft.setDisposition(issue.issue_id, current.choice, e.target.value)} />
        </>
      )}
    </fieldset>
  )
}

function QuestionAnswer({ item, draft }: { item: ReviewItem; draft: Draft }) {
  const q = item.question!
  const answer = draft.state.answers[q.question_id] ?? ''
  const isOption = q.options.includes(answer)
  const inputId = useId()
  return (
    <fieldset className="mt-3">
      <legend className="sr-only">답 고르기</legend>
      {q.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {q.options.map((o) => {
            const chosen = answer === o
            return (
              <button
                key={o}
                type="button"
                aria-pressed={chosen}
                onClick={() => draft.setAnswer(q.question_id, chosen ? '' : o)}
                className={cx(
                  'min-h-8 rounded-sm border px-2.5 text-left text-small transition-colors duration-150',
                  chosen ? 'border-fg bg-primary text-on-primary' : 'border-line-strong bg-card text-fg-2 hover:border-control hover:text-fg',
                )}
              >
                {o}{o === q.recommended && <span className={cx('ml-1.5 text-micro', chosen ? 'text-on-primary' : 'text-fg-3')}>추천</span>}
              </button>
            )
          })}
        </div>
      )}
      <label htmlFor={inputId} className="mt-2 block text-micro text-fg-3">직접 입력</label>
      <TextInput
        id={inputId}
        dense
        className="mt-1 max-w-xl"
        placeholder="보기에 없으면 답을 적으세요"
        value={isOption ? '' : answer}
        onChange={(e) => draft.setAnswer(q.question_id, e.target.value)}
      />
    </fieldset>
  )
}
