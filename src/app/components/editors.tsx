import { Plus, Trash } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { FunctionIO } from '../../types'
import { Button, Checkbox, IconButton, TextArea, TextInput } from './ui'

/** 문자열 목록 편집 (선행 조건, 업무 규칙, 처리 순서 …) */
export function ListEditor({ idPrefix, legend, items, onChange, ordered, placeholder, addLabel = '항목 추가', aside }: {
  idPrefix: string
  legend: string
  items: string[]
  onChange: (next: string[]) => void
  ordered?: boolean
  placeholder?: string
  addLabel?: string
  aside?: (text: string, index: number) => ReactNode
}) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)))
  return (
    <fieldset>
      <legend className="eyebrow mb-2">{legend}</legend>
      {items.length === 0 && <p className="mb-2 text-small text-fg-3">없음</p>}
      <ol className="space-y-1.5">
        {items.map((text, i) => (
          <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-2">
            <span className="pt-1.5 text-right text-micro tabular-nums text-fg-3" aria-hidden="true">{ordered ? `${i + 1}.` : '·'}</span>
            <div className="min-w-0">
              <label htmlFor={`${idPrefix}-${i}`} className="sr-only">{legend} {i + 1}</label>
              <TextArea id={`${idPrefix}-${i}`} dense value={text} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
              {aside?.(text, i)}
            </div>
            <IconButton label={`${legend} ${i + 1} 삭제`} icon={<Trash />} className="size-8" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ol>
      <Button size="sm" variant="ghost" className="mt-1.5 ml-6" icon={<Plus />} onClick={() => onChange([...items, ''])}>{addLabel}</Button>
    </fieldset>
  )
}

/** 입력·출력 항목 편집 */
export function IOEditor({ idPrefix, legend, items, onChange }: {
  idPrefix: string
  legend: string
  items: FunctionIO[]
  onChange: (next: FunctionIO[]) => void
}) {
  const set = (i: number, patch: Partial<FunctionIO>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <fieldset>
      <legend className="eyebrow mb-2">{legend}</legend>
      {items.length === 0 && <p className="mb-2 text-small text-fg-3">없음</p>}
      <ul className="space-y-2">
        {items.map((io, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-md bg-sunken p-2">
            <div className="grid gap-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
              <div>
                <label htmlFor={`${idPrefix}-${i}-name`} className="sr-only">{legend} {i + 1} 이름</label>
                <TextInput id={`${idPrefix}-${i}-name`} dense value={io.name} placeholder="이름" onChange={(e) => set(i, { name: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`${idPrefix}-${i}-desc`} className="sr-only">{legend} {i + 1} 설명</label>
                <TextInput id={`${idPrefix}-${i}-desc`} dense value={io.description} placeholder="설명" onChange={(e) => set(i, { description: e.target.value })} />
              </div>
              <Checkbox checked={io.required} onChange={(v) => set(i, { required: v })} label="필수" className="sm:col-span-2" />
            </div>
            <IconButton label={`${legend} ${i + 1} 삭제`} icon={<Trash />} className="size-8" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-1.5" icon={<Plus />} onClick={() => onChange([...items, { name: '', description: '', required: false }])}>
        {legend} 추가
      </Button>
    </fieldset>
  )
}

/** 예외 처리 (조건 → 처리) 편집 */
export function ExceptionEditor({ idPrefix, items, onChange }: {
  idPrefix: string
  items: { condition: string; handling: string }[]
  onChange: (next: { condition: string; handling: string }[]) => void
}) {
  const set = (i: number, patch: Partial<{ condition: string; handling: string }>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <fieldset>
      <legend className="eyebrow mb-2">예외 처리</legend>
      {items.length === 0 && <p className="mb-2 text-small text-fg-3">없음</p>}
      <ul className="space-y-2">
        {items.map((ex, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div>
                <label htmlFor={`${idPrefix}-${i}-c`} className="mb-1 block text-micro text-fg-3">조건</label>
                <TextArea id={`${idPrefix}-${i}-c`} dense value={ex.condition} onChange={(e) => set(i, { condition: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`${idPrefix}-${i}-h`} className="mb-1 block text-micro text-fg-3">처리</label>
                <TextArea id={`${idPrefix}-${i}-h`} dense value={ex.handling} onChange={(e) => set(i, { handling: e.target.value })} />
              </div>
            </div>
            <IconButton label={`예외 ${i + 1} 삭제`} icon={<Trash />} className="mt-5 size-8" onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-1.5" icon={<Plus />} onClick={() => onChange([...items, { condition: '', handling: '' }])}>예외 추가</Button>
    </fieldset>
  )
}
