import { ArrowCounterClockwise, CaretDown, FileText, MagnifyingGlass } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { FunctionSpec } from '../../types'
import { ExceptionEditor, IOEditor, ListEditor } from '../components/editors'
import { ReviewPanel } from '../components/ReviewPanel'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, fmt, Label, Segmented, TextArea, TextInput } from '../components/ui'
import type { Draft } from '../lib/draft'
import { assumptionId, openCountByTarget, ruleMark, summarize, type ReviewItem } from '../lib/review'

type Tab = 'draft' | 'review'

export interface EditorProps {
  draft: Draft
  items: ReviewItem[]
  focus?: string
  onFocus: (id?: string) => void
  finalizedAt?: string
  version: string
  blockReason?: string
}

/** 이동해 온 항목을 화면에 보이게 한다 (움직임 줄이기 설정이면 바로 이동) */
export function scrollToId(id: string) {
  window.requestAnimationFrame(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  })
}

export function SpecEditor({ draft, items, focus, onFocus, finalizedAt, version, blockReason }: EditorProps) {
  const [tab, setTab] = useState<Tab>('draft')
  const [query, setQuery] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const open = useMemo(() => openCountByTarget(items), [items])
  const s = summarize(items)

  useEffect(() => {
    if (focus) { setTab('draft'); scrollToId(`fn-${focus}`) }
  }, [focus])

  const q = query.trim().toLowerCase()
  const shown = draft.functions.filter((f) =>
    (!q || [f.function_id, f.name, f.description, f.group].some((t) => t.toLowerCase().includes(q)))
    && (!flaggedOnly || open.has(f.function_id)))

  const groups = useMemo(() => {
    const m = new Map<string, FunctionSpec[]>()
    for (const f of shown) m.set(f.group, [...(m.get(f.group) ?? []), f])
    return [...m.entries()]
  }, [shown])

  return (
    <Card aria-labelledby="spec-title" className="flex flex-col">
      <CardHeader
        level={1}
        eyebrow={`Draft · v${version}`}
        title="기능 명세서 초안"
        titleId="spec-title"
      >
        <p className="mt-1 text-label text-fg-3">
          기능 {fmt(draft.functions.length)}개 · 수정 {fmt(draft.editedFunctions)}개 · 확인 필요 {fmt(s.left)}개
        </p>
      </CardHeader>

      <div className="px-5 pb-3">
        <Segmented<Tab>
          label="보기"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'draft', label: '초안 편집', count: draft.functions.length },
            { value: 'review', label: '확인 필요', count: s.left },
          ]}
        />
      </div>

      {tab === 'review' ? (
        <div className="border-t border-line">
          <ReviewPanel
            items={items}
            draft={draft}
            onJump={(id) => onFocus(id)}
            finalizedAt={finalizedAt}
            subject="기능 명세서"
            action="내보내기 → ERD 만들기"
            blockReason={blockReason}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <TextInput dense type="search" aria-label="기능 검색" placeholder="기능 이름·ID 검색" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
            </div>
            <Checkbox checked={flaggedOnly} onChange={setFlaggedOnly} label="확인 필요한 기능만" />
            <span className="ml-auto text-small text-fg-3 tabular-nums" aria-live="polite">{fmt(shown.length)}개 표시</span>
          </div>

          {shown.length === 0 && <Empty title="조건에 맞는 기능이 없습니다">검색어를 지우거나 '확인 필요한 기능만'을 끄세요.</Empty>}

          <div className="px-5 pb-5">
            {groups.map(([group, fns]) => (
              <section key={group} aria-label={`${group} 기능`} className="mt-3 first:mt-0">
                <h2 className="py-2 font-mono text-small text-fg-3">{group}</h2>
                <ul className="space-y-2">
                  {fns.map((f) => (
                    <FunctionRow
                      key={f.function_id}
                      fn={f}
                      expanded={focus === f.function_id}
                      openCount={open.get(f.function_id) ?? 0}
                      edited={Boolean(draft.state.functions[f.function_id])}
                      onToggle={() => onFocus(focus === f.function_id ? undefined : f.function_id)}
                      draft={draft}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

function FunctionRow({ fn, expanded, openCount, edited, onToggle, draft }: {
  fn: FunctionSpec
  expanded: boolean
  openCount: number
  edited: boolean
  onToggle: () => void
  draft: Draft
}) {
  const bodyId = `fn-body-${fn.function_id}`
  return (
    <li id={`fn-${fn.function_id}`} className={cx('scroll-mt-20 rounded-lg border', expanded ? 'border-line-strong' : 'border-line')}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-150 hover:bg-sunken"
      >
        <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-md bg-sunken text-fg-2">
          <FileText size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-body font-medium">{fn.name || <span className="text-danger">이름 없음</span>}</span>
          <span className="block truncate text-small text-fg-3">
            <span className="font-mono text-micro">{fn.function_id}</span> · 요구사항 {fn.requirement_ids.length} · 규칙 {fn.business_rules.length}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {edited && <Badge tone="info">수정됨</Badge>}
          {openCount > 0 && <Badge tone="warn">확인 {openCount}</Badge>}
          <CaretDown size={16} aria-hidden="true" className={cx('text-fg-3 transition-transform duration-200', expanded && 'rotate-180')} />
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="border-t border-line px-3 py-4 sm:px-4">
          <FunctionForm fn={fn} draft={draft} edited={edited} />
        </div>
      )}
    </li>
  )
}

function FunctionForm({ fn, draft, edited }: { fn: FunctionSpec; draft: Draft; edited: boolean }) {
  const id = fn.function_id
  const set = (patch: Partial<FunctionSpec>) => draft.updateFunction(id, patch)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <div>
          <Label htmlFor={`${id}-name`}>기능 이름</Label>
          <TextInput id={`${id}-name`} value={fn.name} aria-invalid={!fn.name.trim()} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-actors`} hint="쉼표로 구분">행위자</Label>
          <TextInput id={`${id}-actors`} value={fn.actors.join(', ')} onChange={(e) => set({ actors: e.target.value.split(',').map((a) => a.trim()) })} />
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-desc`}>설명</Label>
        <TextArea id={`${id}-desc`} value={fn.description} onChange={(e) => set({ description: e.target.value })} />
      </div>

      <ListEditor idPrefix={`${id}-pre`} legend="선행 조건" items={fn.preconditions} onChange={(v) => set({ preconditions: v })} />

      <div className="grid gap-6 lg:grid-cols-2">
        <IOEditor idPrefix={`${id}-in`} legend="입력" items={fn.inputs} onChange={(v) => set({ inputs: v })} />
        <IOEditor idPrefix={`${id}-out`} legend="출력" items={fn.outputs} onChange={(v) => set({ outputs: v })} />
      </div>

      <ListEditor
        idPrefix={`${id}-rule`}
        legend="업무 규칙"
        items={fn.business_rules}
        onChange={(v) => set({ business_rules: v })}
        addLabel="규칙 추가"
        aside={(text) => {
          const mark = ruleMark(text)
          if (!mark) return null
          const unconfirmed = mark.kind === 'unconfirmed'
          return (
            <div className={cx('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1', unconfirmed ? 'bg-danger-soft' : 'bg-warn-soft')}>
              <Badge tone={unconfirmed ? 'danger' : 'warn'} className="!bg-transparent !px-0">{unconfirmed ? '고객 확인 필요' : '원문에 없는 가정'}</Badge>
              <Checkbox
                checked={Boolean(draft.state.checked[assumptionId(id, text)])}
                onChange={(v) => draft.setChecked(assumptionId(id, text), v)}
                label={unconfirmed ? '추천안 맞음' : '가정 맞음'}
              />
              <span className={cx('text-micro', unconfirmed ? 'text-danger' : 'text-warn')}>
                {unconfirmed ? "'(확인 필요)'를 지우면 확정, '(가정)'으로 바꾸면 가정 규칙이 됩니다" : "'(가정)'을 지우면 확정 규칙이 됩니다"}
              </span>
            </div>
          )
        }}
      />

      <ListEditor idPrefix={`${id}-flow`} legend="처리 순서" ordered items={fn.normal_flow} onChange={(v) => set({ normal_flow: v })} addLabel="단계 추가" />

      <ExceptionEditor idPrefix={`${id}-ex`} items={fn.exception_flows} onChange={(v) => set({ exception_flows: v })} />

      <dl className="grid gap-3 rounded-md bg-sunken px-3 py-3 text-small sm:grid-cols-2">
        <div>
          <dt className="eyebrow">연결 요구사항</dt>
          <dd className="mt-1 font-mono text-micro text-fg-2">{[...fn.requirement_ids, ...fn.nfr_ids].join(', ') || '없음'}</dd>
        </div>
        <div>
          <dt className="eyebrow">사용 데이터</dt>
          <dd className="mt-1 font-mono text-micro text-fg-2">{fn.data_objects.join(', ') || '없음'}</dd>
        </div>
      </dl>

      {edited && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" icon={<ArrowCounterClockwise />} onClick={() => draft.revertFunction(id)}>이 기능만 원본으로</Button>
        </div>
      )}
    </div>
  )
}
