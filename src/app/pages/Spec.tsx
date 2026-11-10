import { ArrowCounterClockwise, CaretDown, Check, FileText, MagicWand, MagnifyingGlass } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { FunctionSpec } from '../../types'
import { ExceptionEditor, IOEditor, ListEditor } from '../components/editors'
import { useDraftSave } from '../components/DraftSave'
import { ReviewPanel, ReviewRow } from '../components/ReviewPanel'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, fmt, Label, Segmented, TextArea, TextInput } from '../components/ui'
import type { Draft } from '../lib/draft'
import { assumptionId, bulkPlans, KIND_LABEL, ruleMark, summarize, type BulkPlan, type ReviewItem } from '../lib/review'

type Tab = 'draft' | 'review' | 'overview'

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
  const saving = useDraftSave('spec', draft)
  const [query, setQuery] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const open = useMemo(() => openItemsByTarget(items), [items])
  const done = useMemo(() => checkedItemsByTarget(items), [items])
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
        eyebrow={`Spec · v${version}`}
        title="기능 명세서"
        titleId="spec-title"
        actions={saving.button}
      >
        <p className="mt-1 text-label text-fg-3">
          기능 {fmt(draft.functions.length)}개 · 수정 {fmt(draft.editedFunctions)}개 · 확인 필요 {fmt(s.left)}개
        </p>
      </CardHeader>

      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3">
        <Segmented<Tab>
          label="보기"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'draft', label: '초안 편집', count: draft.functions.length },
            { value: 'review', label: '확인 필요', count: s.left },
            { value: 'overview', label: '전체 보기' },
          ]}
        />
        {saving.result}
      </div>

      {tab === 'overview' ? (
        <FunctionOverview draft={draft} items={items} open={open} done={done} onPick={(id) => { setTab('draft'); onFocus(id) }} />
      ) : tab === 'review' ? (
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
                      openItems={open.get(f.function_id) ?? []}
                      doneItems={done.get(f.function_id) ?? []}
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

/** 기능 ID별 아직 해결하지 않은 확인 항목 (목록 배지·펼침 안 목록·전체 보기) */
function openItemsByTarget(items: ReviewItem[]): Map<string, ReviewItem[]> {
  const m = new Map<string, ReviewItem[]>()
  for (const i of items) if (!i.resolved && i.targetId) m.set(i.targetId, [...(m.get(i.targetId) ?? []), i])
  return m
}

/** 기능 ID별 사람이 처리한 확인 항목 (체크·질문 답. 편집으로 저절로 풀리는 항목은 뺀다) */
function checkedItemsByTarget(items: ReviewItem[]): Map<string, ReviewItem[]> {
  const m = new Map<string, ReviewItem[]>()
  for (const i of items) if (i.resolved && !i.auto && i.targetId) m.set(i.targetId, [...(m.get(i.targetId) ?? []), i])
  return m
}

/** 확인 항목을 처리한 사람 (변경 내역: 질문은 질문 ID, 체크는 항목 ID로 남는다).
 * 예전 기록은 체크를 'n건 바꿈'으로만 남겨 누가 어느 것을 했는지 모른다 → 그때 체크한 사람들 중 하나로 보여 준다.
 * 변경 내역이 생기기 전에 넣은 답·체크는 기록이 없다 → 비워 두지 않고 그렇다고 적는다 */
function checkedBy(draft: Draft, item: ReviewItem): string {
  const by = draft.lastChange[item.id.startsWith('q:') ? item.id.slice(2) : item.id]?.by
  if (by) return by
  const legacy = item.question ? [] : [...new Set(draft.log.filter((e) => e.changes.some((c) => c.label === '확인 표시' && !c.target)).map((e) => e.by.name))]
  return legacy.length ? `${legacy.join('·')} 중 한 명 (이전 기록)` : `누가 ${item.question ? '답했는지' : '확인했는지'} 기록 없음`
}

/** '확인 3' 대신 종류별로: '확인 질문 1 · 확인 필요 규칙 2' */
function kindsText(items: ReviewItem[]): string {
  const counts = new Map<string, number>()
  for (const i of items) counts.set(KIND_LABEL[i.kind], (counts.get(KIND_LABEL[i.kind]) ?? 0) + 1)
  return [...counts].map(([k, n]) => `${k} ${n}`).join(' · ')
}

const RULE_KINDS = new Set(['unconfirmed', 'assumption'])

function FunctionRow({ fn, expanded, openItems, doneItems, edited, onToggle, draft }: {
  fn: FunctionSpec
  expanded: boolean
  openItems: ReviewItem[]
  doneItems: ReviewItem[]
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
          {edited && <Badge tone="info">수정됨{draft.editors[fn.function_id] ? ` · ${draft.editors[fn.function_id]}` : ''}</Badge>}
          {openItems.length > 0 && <span title={kindsText(openItems)}><Badge tone="warn">확인 {openItems.length}</Badge></span>}
          {doneItems.length > 0 && <span title={`사람이 확인함: ${kindsText(doneItems)}`}><Badge tone="ok">확인함 {doneItems.length}</Badge></span>}
          <CaretDown size={16} aria-hidden="true" className={cx('text-fg-3 transition-transform duration-200', expanded && 'rotate-180')} />
        </span>
      </button>
      {expanded && (
        <div id={bodyId} className="border-t border-line px-3 py-4 sm:px-4">
          {/* 고칠 권한이 없으면 입력칸을 모두 끈다 (보기 전용) */}
          {/* 배지 '확인 n'이 무엇인지: 이 기능의 남은 확인 항목을 모두 여기서 보고 바로 처리한다 (질문 답·체크) */}
          {openItems.length > 0 && (
            <section aria-label={`${fn.function_id} 확인할 것`} className="mb-5 rounded-lg border border-warn/40 bg-warn-soft/40">
              <p className="px-3 pt-2.5 text-label font-medium text-warn">이 기능에서 확인할 것 {openItems.length}건 <span className="font-normal text-fg-3">({kindsText(openItems)})</span></p>
              {openItems.some((i) => RULE_KINDS.has(i.kind)) && (
                <p className="px-3 text-micro text-fg-3">확인 필요 규칙·가정은 아래 '업무 규칙'에도 같은 표시가 있습니다. 한쪽에서 체크하면 둘 다 해결됩니다.</p>
              )}
              <ul className="divide-y divide-line">
                {openItems.map((i) => <ReviewRow key={i.id} item={i} draft={draft} compact />)}
              </ul>
            </section>
          )}
          {/* 사람이 이미 처리한 것도 감추지 않는다: 무엇을 누가 체크·답했는지, 기능을 어떻게 고쳤는지 (체크를 풀면 다시 '확인할 것'으로) */}
          {(doneItems.length > 0 || edited) && (
            <section aria-label={`${fn.function_id} 사람이 확인·수정한 것`} className="mb-5 rounded-lg border border-ok/40 bg-ok-soft/30">
              <p className="px-3 pt-2.5 text-label font-medium text-ok">
                이 기능에서 사람이 확인·수정한 것{doneItems.length > 0 && <> · 확인 {doneItems.length}건 <span className="font-normal text-fg-3">({kindsText(doneItems)})</span></>}
              </p>
              {edited && (
                <p className="px-3 pt-1 text-small text-info">
                  기능 수정{draft.editors[fn.function_id] ? ` · ${draft.editors[fn.function_id]}` : ''}{draft.lastChange[fn.function_id] ? ` — ${draft.lastChange[fn.function_id].what}` : ''}
                </p>
              )}
              <ul className="mt-1 divide-y divide-line">
                {doneItems.map((i) => <ReviewRow key={i.id} item={i} draft={draft} by={checkedBy(draft, i)} compact />)}
              </ul>
              {doneItems.length === 0 && <div className="pb-2.5" />}
            </section>
          )}
          <fieldset disabled={draft.readOnly} className="min-w-0">
            <FunctionForm fn={fn} draft={draft} edited={edited} />
          </fieldset>
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

/** 한꺼번에 처리한 결과와 되돌리기 (한 번만: 바로 앞의 처리) */
interface BulkNote { text: string; undo: () => void }

/**
 * 묶음(또는 전체)의 남은 확인 항목을 한꺼번에 처리하는 버튼: 필수 추천대로 · 가정 맞음 · 요구사항 확인 추천대로.
 * 처리할 것이 있는 버튼만 보인다. 누르기 전 답·체크를 기억해 두었다가 '되돌리기'로 돌린다.
 */
function BulkActions({ items, draft, scope, onDone }: { items: ReviewItem[]; draft: Draft; scope: string; onDone: (note: BulkNote) => void }) {
  const plans = bulkPlans(items)
  const buttons: { plan: BulkPlan; label: string; hint: string; icon: typeof Check }[] = [
    { plan: plans.required, label: '필수 추천대로', icon: MagicWand,
      hint: "필수 항목을 추천안으로 처리합니다 (질문은 추천안으로 답, 확인 필요 규칙은 '추천안 맞음')" },
    { plan: plans.assumption, label: '가정 맞음', icon: Check, hint: "가정을 모두 '가정 맞음'으로 표시합니다" },
    { plan: plans.requirement, label: '요구사항 확인 추천대로', icon: MagicWand, hint: '요구사항 확인 질문을 추천안으로 답합니다' },
  ].filter((b) => b.plan.count > 0)
  if (!buttons.length) return null
  const run = (plan: BulkPlan, label: string) => {
    const before = {
      answers: Object.fromEntries(Object.keys(plan.answers).map((q) => [q, draft.state.answers[q]])),
      checked: Object.fromEntries(plan.checked.map((id) => [id, Boolean(draft.state.checked[id])])),
    }
    draft.applyMany(plan.answers, Object.fromEntries(plan.checked.map((id) => [id, true])))
    onDone({ text: `${scope} · ${label} ${fmt(plan.count)}건을 처리했습니다.`, undo: () => draft.applyMany(before.answers, before.checked) })
  }
  return (
    <>
      {buttons.map(({ plan, label, hint, icon: Icon }) => (
        <Button key={label} size="sm" variant="ghost" icon={<Icon />} disabled={draft.readOnly} onClick={() => run(plan, label)}
          title={draft.readOnly ? '이 단계를 고칠 권한이 없거나 이미 확정한 버전입니다'
            : `${scope}: ${hint} — ${fmt(plan.count)}건${plan.manual ? ` (추천안이 없는 ${fmt(plan.manual)}건은 직접 처리)` : ''}`}>
          {label} <span className="tabular-nums text-fg-3">{fmt(plan.count)}</span>
        </Button>
      ))}
    </>
  )
}

/**
 * '전체 보기': 모든 기능을 묶음(group)별 작은 칸으로 한눈에. 칸에는 기능 이름만, 마우스를 올리면(또는 키보드로 고르면) 세부가 뜨고
 * 누르면 초안 편집에서 그 기능을 연다. 사람이 고친 기능은 파란 테두리와 고친 사람·고친 칸, 확인할 것이 남은 기능은
 * 필수 수(주황 채움)와 권장 수(연한 주황)를 따로,
 * 사람이 체크하거나 답한 항목은 초록 표시(무엇을 누가 확인했는지는 세부에).
 * 묶음 제목 옆(과 맨 위 '전체')의 버튼으로 그 묶음의 남은 항목을 한꺼번에 처리한다 (필수 추천대로 · 가정 맞음 · 요구사항 확인 추천대로).
 */
function FunctionOverview({ draft, items, open, done, onPick }: {
  draft: Draft
  items: ReviewItem[]
  open: Map<string, ReviewItem[]>
  done: Map<string, ReviewItem[]>
  onPick: (id: string) => void
}) {
  const [note, setNote] = useState<BulkNote | null>(null)
  const groups = useMemo(() => {
    const m = new Map<string, FunctionSpec[]>()
    for (const f of draft.functions) m.set(f.group, [...(m.get(f.group) ?? []), f])
    return [...m.entries()]
  }, [draft.functions])
  const edited = draft.functions.filter((f) => draft.state.functions[f.function_id]).length
  const left = [...open.values()].flat()
  const requiredLeft = left.filter((i) => i.required).length
  const checked = draft.functions.filter((f) => done.has(f.function_id)).length
  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-3">
        <span>기능 {fmt(draft.functions.length)}개</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm border-2 border-info" />사람이 고침 {fmt(edited)}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-warn" />필수 확인 남음 {fmt(requiredLeft)}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-warn-soft ring-1 ring-warn/40" />권장 확인 남음 {fmt(left.length - requiredLeft)}</span>
        <span className="inline-flex items-center gap-1.5"><Check size={12} weight="bold" aria-hidden="true" className="text-ok" />사람이 확인함 {fmt(checked)}</span>
        <span className="ml-auto">마우스를 올리면 세부 · 누르면 편집</span>
      </div>
      {Object.values(bulkPlans(items)).some((p) => p.count > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md bg-sunken px-3 py-2">
          <span className="mr-1 text-small font-medium">전체 한꺼번에</span>
          <BulkActions items={items} draft={draft} scope="전체" onDone={setNote} />
        </div>
      )}
      {note && (
        <p role="status" className="mb-3 flex flex-wrap items-center gap-2 text-small text-ok">
          <Check size={14} weight="bold" aria-hidden="true" />{note.text}
          <Button size="sm" variant="ghost" icon={<ArrowCounterClockwise />} disabled={draft.readOnly}
            onClick={() => { note.undo(); setNote(null) }}>되돌리기</Button>
        </p>
      )}
      <div className="space-y-4">
        {groups.map(([group, fns]) => (
          <section key={group} aria-label={`${group} 기능`}>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-mono text-small text-fg-3">{group} <span className="tabular-nums">({fns.length})</span></h2>
              <div className="ml-auto flex flex-wrap gap-1">
                <BulkActions items={fns.flatMap((f) => open.get(f.function_id) ?? [])} draft={draft} scope={group} onDone={setNote} />
              </div>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-1.5">
              {fns.map((f) => <OverviewTile key={f.function_id} fn={f} draft={draft} items={open.get(f.function_id) ?? []} done={done.get(f.function_id) ?? []} onPick={onPick} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function OverviewTile({ fn, draft, items, done, onPick }: {
  fn: FunctionSpec
  draft: Draft
  items: ReviewItem[]
  done: ReviewItem[]
  onPick: (id: string) => void
}) {
  const tipId = `ov-${fn.function_id}`
  const edited = Boolean(draft.state.functions[fn.function_id])
  const editor = draft.editors[fn.function_id]
  const editWhat = draft.lastChange[fn.function_id]?.what
  const required = items.filter((i) => i.required).length
  const optional = items.length - required
  // 오른쪽 끝 칸이면 세부 칸을 왼쪽으로 펼친다 (화면 밖으로 나가지 않게)
  const [flip, setFlip] = useState(false)
  const place = (el: HTMLElement) => setFlip(el.getBoundingClientRect().left + 336 > window.innerWidth)
  return (
    <li className="group/tile relative" onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)}>
      <button type="button" onClick={() => onPick(fn.function_id)} aria-describedby={tipId}
        className={cx('flex h-full min-h-14 w-full flex-col justify-center rounded-md border bg-card px-2.5 py-1.5 text-left transition-colors duration-150 hover:bg-sunken',
          edited ? 'border-2 border-info' : 'border-line')}>
        <span className="flex items-start gap-1.5">
          <span className="line-clamp-2 min-w-0 flex-1 text-small font-medium">{fn.name || <span className="text-danger">이름 없음</span>}</span>
          {required > 0 && (
            <span className="shrink-0 rounded-sm bg-warn px-1 text-micro font-semibold text-on-primary tabular-nums" aria-label={`필수 확인 ${required}건`}>
              {required}
            </span>
          )}
          {optional > 0 && (
            <span className="shrink-0 rounded-sm bg-warn-soft px-1 text-micro font-semibold text-warn tabular-nums" aria-label={`권장 확인 ${optional}건`}>
              {optional}
            </span>
          )}
          {done.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-ok-soft px-1 text-micro font-semibold text-ok tabular-nums" aria-label={`사람이 확인함 ${done.length}건`}>
              <Check size={10} weight="bold" aria-hidden="true" />{done.length}
            </span>
          )}
        </span>
        <span className="mt-0.5 truncate text-micro text-fg-3">
          <span className="font-mono">{fn.function_id}</span>{edited && <span className="text-info"> · {editor ? `${editor} 수정` : '수정됨'}</span>}
        </span>
      </button>
      {/* 세부: 마우스를 올리거나 키보드로 고르면 보인다 */}
      <div id={tipId} role="tooltip"
        className={cx(flip ? 'right-0' : 'left-0', 'pointer-events-none invisible absolute top-full z-40 mt-1 w-80 max-w-[80vw] rounded-lg border border-line bg-card p-3 text-small opacity-0 shadow-lg transition-opacity duration-150 group-hover/tile:visible group-hover/tile:opacity-100 group-hover/tile:delay-200 group-focus-within/tile:visible group-focus-within/tile:opacity-100')}>
        <p className="font-medium">{fn.name} <span className="font-mono text-micro text-fg-3">{fn.function_id}</span></p>
        {fn.description && <p className="mt-1 line-clamp-4 text-fg-2">{fn.description}</p>}
        <p className="mt-1.5 text-micro text-fg-3">
          행위자 {fn.actors.filter(Boolean).join(', ') || '없음'} · 요구사항 {fn.requirement_ids.length} · 규칙 {fn.business_rules.length} · 처리 순서 {fn.normal_flow.length}단계
        </p>
        {edited && <p className="mt-1.5 text-micro text-info">사람이 고침{editor ? ` · ${editor}` : ''}{editWhat ? ` — ${editWhat}` : ''}</p>}
        {done.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <p className="text-micro font-medium text-ok">사람이 확인함 {done.length}건</p>
            <ul className="mt-1 space-y-1">
              {done.slice(0, 5).map((i) => {
                const by = checkedBy(draft, i)
                return (
                  <li key={i.id} className="text-micro text-fg-2">
                    <span className="text-fg-3">{KIND_LABEL[i.kind]}</span> · <span className="line-clamp-2 inline">{i.title}</span>
                    {i.question && draft.state.answers[i.question.question_id] && <span className="text-fg-3"> → 답: {draft.state.answers[i.question.question_id]}</span>}
                    <span className="text-ok"> · {by}</span>
                  </li>
                )
              })}
              {done.length > 5 && <li className="text-micro text-fg-3">외 {done.length - 5}건</li>}
            </ul>
          </div>
        )}
        {items.length > 0 ? (
          <div className="mt-2 border-t border-line pt-2">
            <p className="text-micro font-medium text-warn">확인할 것 {items.length}건 · 필수 {required} · 권장 {optional}</p>
            <ul className="mt-1 space-y-1">
              {[...items].sort((a, b) => Number(b.required) - Number(a.required)).slice(0, 5).map((i) => (
                <li key={i.id} className="text-micro text-fg-2">
                  <span className={i.required ? 'font-semibold text-warn' : 'text-fg-3'}>{i.required ? '필수' : '권장'}</span>
                  {' · '}<span className="text-fg-3">{KIND_LABEL[i.kind]}</span> · <span className="line-clamp-2 inline">{i.title}</span>
                </li>
              ))}
              {items.length > 5 && <li className="text-micro text-fg-3">외 {items.length - 5}건</li>}
            </ul>
          </div>
        ) : <p className="mt-2 text-micro text-ok">확인할 것 없음</p>}
      </div>
    </li>
  )
}
