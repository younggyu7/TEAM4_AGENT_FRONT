import { ArrowCounterClockwise, MagnifyingGlass, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { ENTITY_KIND, label as labelOf } from '../../labels'
import type { Attribute, CheckRule, Entity, FunctionSpec } from '../../types'
import { ErdDiagram } from '../components/ErdDiagram'
import { useDraftSave } from '../components/DraftSave'
import { ReviewPanel } from '../components/ReviewPanel'
import { Badge, Button, Card, CardHeader, Checkbox, cx, Empty, fmt, IconButton, Label, Segmented, TextArea, TextInput } from '../components/ui'
import type { Draft } from '../lib/draft'
import { DATA_TYPES, fullErd, neighborhoodErd, relationsOf } from '../lib/erd'
import { openCountByTarget, summarize } from '../lib/review'
import { scrollToId, type EditorProps } from './Spec'

type Tab = 'tables' | 'all' | 'review'

export function ErdEditor({ draft, items, focus, onFocus, finalizedAt, version, onOpenFunction, blockReason }: EditorProps & {
  onOpenFunction: (id: string) => void
}) {
  const [tab, setTab] = useState<Tab>('tables')
  const [query, setQuery] = useState('')
  const [searchIn, setSearchIn] = useState<'title' | 'all'>('title')
  const saving = useDraftSave('erd', draft)
  const entities = draft.entities
  const open = useMemo(() => openCountByTarget(items), [items])
  const s = summarize(items)
  const selected = entities.find((e) => e.entity_id === focus) ?? entities[0]

  useEffect(() => {
    if (focus) { setTab('tables'); scrollToId('erd-editor') }
  }, [focus])

  const q = query.trim().toLowerCase()
  // 검색: 제목(테이블 ID·이름)만 / 제목 + 내용(설명·컬럼 이름·설명까지)
  const shown = entities.filter((e) => !q || (searchIn === 'title' ? [e.entity_id, e.label]
    : [e.entity_id, e.label, e.description, ...e.attributes.flatMap((a) => [a.name, a.label ?? '', a.description ?? ''])])
    .some((t) => (t ?? '').toLowerCase().includes(q)))

  return (
    <Card aria-labelledby="erd-title" className="flex flex-col">
      <CardHeader level={1} eyebrow={`Draft · v${version}`} title="ERD 초안" titleId="erd-title"
        actions={saving.button}>
        <p className="mt-1 text-label text-fg-3">
          테이블 {fmt(entities.length)}개 · 관계 {fmt(relationsOf(entities).length)}개 · 수정 {fmt(draft.editedEntities)}개 · 확인 필요 {fmt(s.left)}개
        </p>
      </CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3">
        <Segmented<Tab>
          label="보기"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'tables', label: '테이블 편집', count: entities.length },
            { value: 'all', label: '전체 ERD' },
            { value: 'review', label: '확인 필요', count: s.left },
          ]}
        />
        {saving.result}
      </div>

      {tab === 'review' ? (
        <div className="border-t border-line">
          <ReviewPanel
            items={items}
            draft={draft}
            // 의미 검토 지적은 기능을 가리키기도 한다 → 테이블이 아니면 기능 명세 화면에서 연다
            onJump={(id) => (entities.some((e) => e.entity_id === id) ? onFocus(id) : onOpenFunction(id))}
            finalizedAt={finalizedAt}
            subject="ERD"
            action="ERD 최종 확정하기"
            blockReason={blockReason}
          />
        </div>
      ) : tab === 'all' ? (
        <FullErd entities={entities} functions={draft.functions} onPick={(id) => { onFocus(id); setTab('tables') }} />
      ) : entities.length === 0 ? (
        <Empty title={`v${version}에는 ERD가 없습니다`}>
          {version.includes('.') ? '데이터 모델 Agent가 실패했는지 산출물 보기의 판단 기록을 확인하세요.' : "기능 명세 화면에서 '내보내기 → ERD 만들기'를 하면 이 기능 명세로 ERD를 만듭니다."}
        </Empty>
      ) : (
        <div className="grid border-t border-line md:grid-cols-[232px_minmax(0,1fr)]">
          <nav aria-label="테이블 목록" className="border-b border-line p-3 md:border-r md:border-b-0">
            <div className="relative">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
              <TextInput dense type="search" aria-label="테이블 검색" placeholder="테이블 검색" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
            </div>
            <Segmented<'title' | 'all'> label="검색 범위" value={searchIn} onChange={setSearchIn} className="mt-1.5"
              options={[{ value: 'title', label: '제목' }, { value: 'all', label: '제목 + 내용' }]} />
            <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto md:max-h-[640px]">
              {shown.map((e) => {
                const active = e.entity_id === selected?.entity_id
                const count = open.get(e.entity_id) ?? 0
                return (
                  <li key={e.entity_id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => onFocus(e.entity_id)}
                      className={cx(
                        'grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors duration-150',
                        active ? 'bg-sunken ring-1 ring-line' : 'hover:bg-sunken',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-small">{e.entity_id}</span>
                        <span className="block truncate text-micro text-fg-3">{e.label}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        {draft.state.entities[e.entity_id] && (
                          <span className="size-1.5 rounded-full bg-info" title={`수정됨${draft.editors[e.entity_id] ? ` · ${draft.editors[e.entity_id]}` : ''}`}
                            aria-label={`수정됨${draft.editors[e.entity_id] ? ` · ${draft.editors[e.entity_id]}` : ''}`} />
                        )}
                        {count > 0 && <Badge tone={count ? 'warn' : 'neutral'}>{count}</Badge>}
                      </span>
                    </button>
                  </li>
                )
              })}
              {shown.length === 0 && <li className="px-2.5 py-3 text-small text-fg-3">검색 결과가 없습니다.</li>}
            </ul>
          </nav>
          {selected && (
            <fieldset disabled={draft.readOnly} className="min-w-0">
            <EntityForm
              key={selected.entity_id}
              entity={selected}
              entities={entities}
              draft={draft}
              edited={Boolean(draft.state.entities[selected.entity_id])}
              onOpenEntity={onFocus}
              onOpenFunction={onOpenFunction}
            />
            </fieldset>
          )}
        </div>
      )}
    </Card>
  )
}

function EntityForm({ entity, entities, draft, edited, onOpenEntity, onOpenFunction }: {
  entity: Entity
  entities: Entity[]
  draft: Draft
  edited: boolean
  onOpenEntity: (id: string) => void
  onOpenFunction: (id: string) => void
}) {
  const id = entity.entity_id
  const [removed, setRemoved] = useState<{ attr: Attribute; index: number } | null>(null)
  const { code, neighbors, drawn } = useMemo(() => neighborhoodErd(id, entities), [id, entities])

  const setAttr = (i: number, patch: Partial<Attribute>) =>
    draft.updateAttributes(id, (attrs) => attrs.map((a, j) => (j === i ? { ...a, ...patch } : a)))
  const addAttr = () => draft.updateAttributes(id, (attrs) => [...attrs, {
    name: '', label: '', data_type: 'varchar', length: 0, nullable: true, primary_key: false, unique: false,
    references: '', allowed_values: [], description: '',
  }])
  const removeAttr = (i: number) => {
    setRemoved({ attr: entity.attributes[i], index: i })
    draft.updateAttributes(id, (attrs) => attrs.filter((_, j) => j !== i))
  }
  const undoRemove = () => {
    if (!removed) return
    draft.updateAttributes(id, (attrs) => [...attrs.slice(0, removed.index), removed.attr, ...attrs.slice(removed.index)])
    setRemoved(null)
  }

  return (
    <article id="erd-editor" aria-labelledby="entity-title" className="min-w-0 scroll-mt-20 space-y-5 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="entity-title" className="flex flex-wrap items-center gap-2 text-subtitle font-medium">
            <span className="font-mono">{id}</span>
            <Badge>{labelOf(ENTITY_KIND, entity.kind)}</Badge>
          </h2>
          <p className="mt-1 text-small text-fg-3">테이블 ID는 다른 테이블이 참조하므로 여기서 바꾸지 않습니다.</p>
        </div>
        {edited && <Button size="sm" variant="ghost" icon={<ArrowCounterClockwise />} onClick={() => draft.revertEntity(id)}>이 테이블만 원본으로</Button>}
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div>
          <Label htmlFor={`${id}-label`}>표시 이름</Label>
          <TextInput id={`${id}-label`} value={entity.label} onChange={(e) => draft.updateEntity(id, { label: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-desc`}>설명</Label>
          <TextArea id={`${id}-desc`} value={entity.description} onChange={(e) => draft.updateEntity(id, { description: e.target.value })} />
        </div>
      </div>

      <section aria-labelledby={`${id}-erd`}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={`${id}-erd`} className="eyebrow">Relations · 연결된 테이블</h3>
          <p className="text-micro text-fg-3">
            {neighbors.length > drawn.length
              ? `연결 ${neighbors.length}개 중 ${drawn.length}개만 그림 · 나머지는 아래 목록`
              : '편집하면 0.3초 뒤 다시 그립니다'}
          </p>
        </div>
        <ErdDiagram code={code} centerId={id} label={`${id}와 연결된 테이블 ${drawn.length}개의 ERD`} />
        {neighbors.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="연결된 테이블로 이동">
            {neighbors.map((other) => (
              <li key={other}>
                <button type="button" onClick={() => onOpenEntity(other)} className="min-h-8 rounded-sm border border-line px-2 font-mono text-micro text-fg-2 hover:border-control hover:text-fg">
                  {other}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${id}-cols`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${id}-cols`} className="eyebrow">Columns · 컬럼 {entity.attributes.length}개</h3>
          <Button size="sm" icon={<Plus />} onClick={addAttr}>컬럼 추가</Button>
        </div>
        {removed && (
          <p role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-sunken px-3 py-1.5 text-small">
            컬럼 <span className="font-mono">{removed.attr.name || '(이름 없음)'}</span>을 삭제했습니다.
            <Button size="sm" variant="ghost" onClick={undoRemove}>되돌리기</Button>
          </p>
        )}
        {/* relative: 표 안의 sr-only(absolute)가 스크롤 상자 밖으로 나가 페이지가 가로로 밀리지 않게 */}
        <div className="relative overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[1040px] text-left text-small">
            <caption className="sr-only">{id} 컬럼 편집</caption>
            <thead className="bg-sunken text-micro text-fg-3">
              <tr>
                <th scope="col" className="px-2 py-2 font-medium">컬럼</th>
                <th scope="col" className="px-2 py-2 font-medium">이름</th>
                <th scope="col" className="px-2 py-2 font-medium">타입</th>
                <th scope="col" className="px-2 py-2 font-medium">길이</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">필수</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">PK</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">UK</th>
                <th scope="col" className="px-2 py-2 font-medium">참조 테이블 (FK)</th>
                <th scope="col" className="px-2 py-2 font-medium">설명</th>
                <th scope="col" className="px-2 py-2"><span className="sr-only">삭제</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entity.attributes.map((a, i) => {
                const name = a.name || `${i + 1}번째 컬럼`
                return (
                  <tr key={i} className="align-top">
                    <td className="px-2 py-1.5"><TextInput dense aria-label={`${name} 컬럼 이름`} aria-invalid={!a.name.trim()} value={a.name} onChange={(e) => setAttr(i, { name: e.target.value })} className="min-w-48 font-mono" /></td>
                    <td className="px-2 py-1.5"><TextInput dense aria-label={`${name} 표시 이름`} value={a.label} onChange={(e) => setAttr(i, { label: e.target.value })} className="min-w-28" /></td>
                    <td className="px-2 py-1.5">
                      <TextInput dense aria-label={`${name} 타입`} list="erd-types" value={a.data_type} onChange={(e) => setAttr(i, { data_type: e.target.value })} className="min-w-28 font-mono" />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput dense type="number" min={0} inputMode="numeric" aria-label={`${name} 길이`} value={a.length || ''} onChange={(e) => setAttr(i, { length: Number(e.target.value) || 0 })} className="w-20 tabular-nums" />
                    </td>
                    <td className="px-2 py-1.5 text-center"><CellCheck label={`${name} 필수`} checked={!a.nullable} onChange={(v) => setAttr(i, { nullable: !v })} /></td>
                    <td className="px-2 py-1.5 text-center"><CellCheck label={`${name} 기본키`} checked={a.primary_key} onChange={(v) => setAttr(i, { primary_key: v, ...(v ? { nullable: false } : {}) })} /></td>
                    <td className="px-2 py-1.5 text-center"><CellCheck label={`${name} 유일`} checked={a.unique} onChange={(v) => setAttr(i, { unique: v })} /></td>
                    <td className="px-2 py-1.5">
                      <select
                        aria-label={`${name} 참조 테이블`}
                        value={a.references}
                        onChange={(e) => setAttr(i, { references: e.target.value })}
                        aria-invalid={Boolean(a.references) && !entities.some((x) => x.entity_id === a.references)}
                        className="min-h-8 w-full min-w-36 rounded-md border border-control bg-card px-2 font-mono text-small text-fg aria-[invalid=true]:border-danger"
                      >
                        <option value="">없음</option>
                        {a.references && !entities.some((x) => x.entity_id === a.references) && <option value={a.references}>{a.references} (없는 테이블)</option>}
                        {entities.map((x) => <option key={x.entity_id} value={x.entity_id}>{x.entity_id}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5"><TextInput dense aria-label={`${name} 설명`} value={a.description} onChange={(e) => setAttr(i, { description: e.target.value })} className="min-w-40" /></td>
                    <td className="px-1 py-1.5"><IconButton label={`${name} 삭제`} icon={<Trash />} className="size-8" onClick={() => removeAttr(i)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="erd-types">{DATA_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </section>

      <ChecksEditor id={id} entity={entity} draft={draft} />

      {entity.function_ids.length > 0 && (
        <section aria-labelledby={`${id}-fns`}>
          <h3 id={`${id}-fns`} className="eyebrow mb-2">Used by · 이 테이블을 쓰는 기능</h3>
          <ul className="flex flex-wrap gap-1.5">
            {entity.function_ids.map((f) => (
              <li key={f}>
                <button type="button" onClick={() => onOpenFunction(f)} className="min-h-8 rounded-sm border border-line px-2 font-mono text-micro text-fg-2 hover:border-control hover:text-fg">
                  {f}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

const OPS: CheckRule['op'][] = ['>', '>=', '<', '<=', '<>']
// 시간 순서 검사 (서버 model_validator와 같은 낱말): 나중 일이 먼저 일어나야 한다는 조건이면 거꾸로일 수 있다
const EARLY = new Set(['created', 'requested', 'submitted', 'applied', 'registered', 'start', 'started', 'begin'])
const LATE = new Set(['approved', 'rejected', 'completed', 'finished', 'closed', 'end', 'ended', 'expired', 'expires', 'until', 'confirmed', 'cancelled', 'canceled'])
const stageOf = (name: string) => { const t = name.split('_'); return t.some((x) => LATE.has(x)) ? 'late' : t.some((x) => EARLY.has(x)) ? 'early' : '' }
function reversedTime(rule: CheckRule, attrs: Attribute[]): boolean {
  const type = (n: string) => attrs.find((a) => a.name === n)?.data_type ?? ''
  if (!['date', 'timestamp'].includes(type(rule.column)) || !['date', 'timestamp'].includes(type(rule.value))) return false
  const [a, b] = [stageOf(rule.column), stageOf(rule.value)]
  return (a === 'late' && b === 'early' && (rule.op === '<' || rule.op === '<=')) || (a === 'early' && b === 'late' && (rule.op === '>' || rule.op === '>='))
}

/** 값 조건 (DDL CHECK): 고치면 ERD 최종 확정 때 schema.sql·예시 데이터가 이 조건으로 다시 만들어진다 */
function ChecksEditor({ id, entity, draft }: { id: string; entity: Entity; draft: Draft }) {
  const checks = entity.checks ?? []
  const names = entity.attributes.map((a) => a.name).filter(Boolean)
  const set = (next: CheckRule[]) => draft.updateEntity(id, { checks: next })
  const change = (i: number, patch: Partial<CheckRule>) => set(checks.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <section aria-labelledby={`${id}-checks`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-checks`} className="eyebrow">Checks · 값 조건 {checks.length}개</h3>
        <Button size="sm" icon={<Plus />} disabled={!names.length} onClick={() => set([...checks, { column: names[0], op: '>', value: '0' }])}>조건 추가</Button>
      </div>
      {checks.length === 0 ? <p className="text-small text-fg-3">값 조건이 없습니다 (예: 금액 &gt; 0, 종료일 &gt;= 시작일).</p> : (
        <ul className="space-y-1.5">
          {checks.map((c, i) => {
            const bad = reversedTime(c, entity.attributes)
            const label = `${i + 1}번째 값 조건`
            return (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                <select aria-label={`${label} 컬럼`} value={c.column} onChange={(e) => change(i, { column: e.target.value })}
                  className="min-h-8 rounded-md border border-control bg-card px-2 font-mono text-small">
                  {!names.includes(c.column) && <option value={c.column}>{c.column} (없는 컬럼)</option>}
                  {names.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select aria-label={`${label} 비교`} value={c.op} onChange={(e) => change(i, { op: e.target.value as CheckRule['op'] })}
                  className="min-h-8 rounded-md border border-control bg-card px-2 font-mono text-small">
                  {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <TextInput dense aria-label={`${label} 값 (다른 컬럼 이름 또는 숫자)`} list={`${id}-check-cols`} value={c.value}
                  onChange={(e) => change(i, { value: e.target.value.trim() })} className="w-48 font-mono"
                  aria-invalid={!names.includes(c.value) && Number.isNaN(Number(c.value))} />
                <IconButton label={`${label} 삭제`} icon={<Trash />} className="size-8" onClick={() => set(checks.filter((_, j) => j !== i))} />
                {bad && <Badge tone="warn">시간 순서가 거꾸로일 수 있음 — 원문 근거를 확인하세요</Badge>}
              </li>
            )
          })}
        </ul>
      )}
      <datalist id={`${id}-check-cols`}>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <p className="mt-1 text-micro text-fg-3">값은 같은 테이블의 다른 컬럼 이름이나 숫자입니다. 고친 조건은 ERD 최종 확정 때 schema.sql과 예시 데이터에 반영됩니다.</p>
    </section>
  )
}

function CellCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex size-8 cursor-pointer items-center justify-center">
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer accent-[var(--fg)]" />
    </label>
  )
}

/** 전체 테이블을 한 그림으로. 편집한 내용이 그대로 반영되고, 테이블을 누르면 편집 탭에서 연다.
 *  테이블이 많으면 읽기 어려우므로 업무 그룹(그 테이블을 쓰는 기능의 원문 번호)으로 좁혀 볼 수 있다. */
export function FullErd({ entities, functions, onPick, defaultView }: {
  entities: Entity[]
  functions: FunctionSpec[]
  onPick: (id: string) => void
  defaultView?: 'map' | 'diagram'
}) {
  const [allColumns, setAllColumns] = useState(false)
  const [group, setGroup] = useState('')
  // 테이블이 많으면 다이어그램이 읽기 어려워 지도부터, 적으면 관계도부터 보여준다
  const [view, setView] = useState<'map' | 'diagram'>(defaultView ?? (entities.length > 40 ? 'map' : 'diagram'))
  const groupId = useId()

  const groups = useMemo(() => {
    const groupOf = new Map(functions.map((f) => [f.function_id, f.group]))
    const m = new Map<string, Set<string>>()
    for (const e of entities) {
      for (const f of e.function_ids) {
        const g = groupOf.get(f)
        if (g) m.set(g, (m.get(g) ?? new Set()).add(e.entity_id))
      }
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [entities, functions])

  // 그룹을 고르면 그 테이블 + 그 테이블이 참조하는 부모 테이블 (관계선이 끊기지 않게)
  const shown = useMemo(() => {
    if (!group) return entities
    const own = groups.find(([g]) => g === group)?.[1] ?? new Set<string>()
    const parents = new Set(entities.filter((e) => own.has(e.entity_id)).flatMap((e) => e.attributes.map((a) => a.references)).filter(Boolean))
    return entities.filter((e) => own.has(e.entity_id) || parents.has(e.entity_id))
  }, [entities, groups, group])

  const code = useMemo(() => fullErd(shown, allColumns), [shown, allColumns])
  const ids = useMemo(() => shown.map((e) => e.entity_id), [shown])
  // 원래 크기로 열면 왼쪽 위가 빈 곳일 수 있어, 관계가 가장 많은 테이블(회원 등)로 스크롤한다
  const hub = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of relationsOf(shown)) count.set(r.parent, (count.get(r.parent) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }, [shown])

  return (
    <div className="border-t border-line p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor={groupId} className="mb-1 block text-small text-fg-3">업무 그룹</label>
          <select
            id={groupId}
            value={group}
            onChange={(e) => { setGroup(e.target.value); setView(e.target.value ? 'diagram' : 'map') }}
            className="min-h-10 rounded-md border border-control bg-card px-3 text-label text-fg"
          >
            <option value="">전체 · 테이블 {entities.length}개</option>
            {groups.map(([g, set]) => <option key={g} value={g}>{g} · 테이블 {set.size}개</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {view === 'diagram' && <Checkbox checked={allColumns} onChange={setAllColumns} label="모든 컬럼 보기" />}
          <Segmented
            label="전체 ERD 보기 방식"
            value={view}
            onChange={setView}
            options={[{ value: 'map', label: '테이블 지도' }, { value: 'diagram', label: '다이어그램' }]}
          />
        </div>
      </div>
      <p className="mb-3 text-small text-fg-3" aria-live="polite">
        테이블 {fmt(shown.length)}개 · 관계 {fmt(relationsOf(shown).filter((r) => ids.includes(r.parent)).length)}개
        {group && ' (이 그룹이 참조하는 부모 테이블 포함)'}
        {view === 'diagram' && shown.length > 40 && ' · 테이블이 많아 그림이 큽니다. 업무 그룹을 고르면 읽기 쉽습니다'}
      </p>
      {view === 'map' ? <TableMap entities={shown} onPick={onPick} /> : <ErdDiagram
        key={group}
        code={code}
        label={`${group || '전체'} ERD: 테이블 ${shown.length}개`}
        centerId={hub}
        height={680}
        onPick={onPick}
        entityIds={ids}
        defaultZoom={shown.length > 30 ? 'full' : 'fit'}
      />}
    </div>
  )
}

const KIND_ORDER: Entity['kind'][] = ['MASTER', 'TRANSACTION', 'HISTORY', 'MAPPING', 'CODE']

/** 테이블 지도: 테이블이 많을 때 다이어그램 대신 종류별 카드로 한눈에 본다. 누르면 그 테이블을 편집한다. */
function TableMap({ entities, onPick }: { entities: Entity[]; onPick: (id: string) => void }) {
  const edges = useMemo(() => relationsOf(entities), [entities])
  const childCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of edges) m.set(r.parent, (m.get(r.parent) ?? 0) + 1)
    return m
  }, [edges])
  return (
    <div className="space-y-6">
      {KIND_ORDER.map((kind) => {
        const list = entities.filter((e) => e.kind === kind)
        if (list.length === 0) return null
        return (
          <section key={kind} aria-label={`${labelOf(ENTITY_KIND, kind)} 테이블`}>
            <h3 className="eyebrow mb-2">{labelOf(ENTITY_KIND, kind)} · {list.length}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((e) => {
                const parents = [...new Set(e.attributes.map((a) => a.references).filter(Boolean))]
                return (
                  <li key={e.entity_id}>
                    <button
                      type="button"
                      onClick={() => onPick(e.entity_id)}
                      className="h-full w-full rounded-lg border border-line px-3 py-2.5 text-left transition-colors duration-150 hover:border-control hover:bg-sunken"
                    >
                      <span className="block truncate font-mono text-small font-medium">{e.entity_id}</span>
                      <span className="block truncate text-small text-fg-2">{e.label}</span>
                      <span className="mt-1.5 block text-micro text-fg-3 tabular-nums">
                        컬럼 {e.attributes.length} · 참조 {parents.length} · 참조됨 {childCount.get(e.entity_id) ?? 0}
                      </span>
                      {parents.length > 0 && (
                        <span className="mt-1 block truncate font-mono text-micro text-fg-3" title={parents.join(', ')}>→ {parents.join(', ')}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}


