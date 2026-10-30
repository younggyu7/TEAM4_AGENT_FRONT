import type { ReactNode } from 'react'
import { useDesign } from '../context'

export type Tone = 'neutral' | 'pass' | 'fail' | 'warn' | 'info' | 'muted'

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`badge badge--${tone}`} title={title}>{children}</span>
}

/** 요구사항·기능·엔티티·질문·이슈 ID. 해당 탭이 있으면 눌러서 이동한다. */
export function IdLink({ id }: { id: string }) {
  const { index, go } = useDesign()
  const tab = index.get(id)
  if (!tab) return <span className="id">{id}</span>
  return (
    <button type="button" className="id id--link" onClick={() => go(tab, id)} title={`${id}로 이동`}>
      {id}
    </button>
  )
}

export function IdList({ ids, empty = '없음' }: { ids: string[]; empty?: string }) {
  if (ids.length === 0) return <span className="muted">{empty}</span>
  return <span className="idlist">{ids.map((id) => <IdLink key={id} id={id} />)}</span>
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  count?: number
}

/** 목록 필터용 선택 버튼 묶음 */
export function Segmented<T extends string>(
  { label, value, options, onChange }: { label: string; value: T; options: SegmentOption<T>[]; onChange: (v: T) => void },
) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className="segmented__item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="segmented__count">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="search"
      type="search"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function Toolbar({ children, summary }: { children: ReactNode; summary?: ReactNode }) {
  return (
    <div className="toolbar">
      <div className="toolbar__controls">{children}</div>
      {summary && <div className="toolbar__summary">{summary}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

/** 키·값 한 줄 (dl 안에서 사용) */
export function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** 검색어가 텍스트 묶음 중 하나에라도 들어 있는지 (대소문자 무시) */
export function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return texts.some((t) => t?.toLowerCase().includes(q))
}

/** '(가정)'(원문에 없는 규칙)과 '(확인 필요)'(고객 확인이 필요한 규칙)를 눈에 띄게 표시한다. */
export function AssumptionText({ text }: { text: string }) {
  const parts = text.split(/(\(가정\)|\(확인 필요\))/)
  if (parts.length === 1) return <>{text}</>
  return <>{parts.map((p, i) => (p === '(가정)' ? <mark key={i} className="assumed">가정</mark>
    : p === '(확인 필요)' ? <mark key={i} className="unconfirmed">확인 필요</mark> : p))}</>
}
