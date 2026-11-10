import { useState, type ReactNode } from 'react'
import { compact, cx, fmt } from './ui'

/* ------------------------------------------------------------ 눈금 막대 (진행률)
   값 하나를 보여주는 막대. 숫자가 제목처럼 크게 오고, 막대는 보조. */
export function TickMeter({ value, total, label, tone = 'series', ticks = 36 }: {
  value: number
  total: number
  label: string
  tone?: 'series' | 'ok' | 'danger'
  ticks?: number
}) {
  const filled = total === 0 ? 0 : Math.round((value / total) * ticks)
  const fill = tone === 'ok' ? 'bg-ok' : tone === 'danger' ? 'bg-danger' : 'bg-series-1'
  return (
    <div role="img" aria-label={`${label}: ${total}개 중 ${value}개`} className="flex h-7 items-stretch gap-[2px]">
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={cx('flex-1 rounded-[2px]', i < filled ? fill : 'bg-sunken')} />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ 버전별 토큰 사용량 (누적 세로 막대)
   입력·출력 두 계열. 범례 + 막대 사이 2px 간격 + 표 보기로 색에만 기대지 않는다. */
export interface TokenBar {
  key: string
  label: string        // x축 (v1, v2 …)
  sub?: string         // 툴팁 보조 줄
  input: number
  output: number
  calls: number
  current?: boolean
  /** 그 막대의 비용 (마우스를 올리면 보인다) */
  cost?: string
}

export function TokenBars({ bars, height = 132, caption }: { bars: TokenBar[]; height?: number; caption: string }) {
  const [active, setActive] = useState<string | null>(null)
  const max = Math.max(1, ...bars.map((b) => b.input + b.output))
  const shown = bars.find((b) => b.key === active)

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-2">
        <Legend swatch="bg-series-1" label="입력 토큰" />
        <Legend swatch="bg-series-2" label="출력 토큰" />
      </div>

      <div className="relative">
        {/* 툴팁: 막대에 hover하거나 키보드로 포커스하면 보인다 */}
        <div aria-live="polite" className="pointer-events-none absolute inset-x-0 -top-1 z-10 flex justify-center">
          {shown && (
            <div className="rounded-md border border-line bg-card px-3 py-2 text-small tabular-nums">
              <p className="font-semibold text-fg">{shown.label}{shown.sub && <span className="font-normal text-fg-3"> · {shown.sub}</span>}</p>
              <p className="text-fg-2">입력 {fmt(shown.input)} · 출력 {fmt(shown.output)}</p>
              <p className="text-fg-3">호출 {fmt(shown.calls)}회{shown.cost && <> · <span className="font-medium text-fg-2">{shown.cost}</span></>}</p>
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 border-b border-line" style={{ height }} onMouseLeave={() => setActive(null)}>
          {bars.map((b) => {
            const total = b.input + b.output
            const h = (total / max) * (height - 20)
            const outH = total ? (b.output / total) * h : 0
            return (
              <button
                key={b.key}
                type="button"
                aria-label={`${b.label}: 입력 ${fmt(b.input)}, 출력 ${fmt(b.output)}, 호출 ${b.calls}회`}
                onMouseEnter={() => setActive(b.key)}
                onFocus={() => setActive(b.key)}
                onBlur={() => setActive(null)}
                className="group flex h-full min-w-6 flex-1 cursor-default flex-col items-center justify-end gap-1 rounded-sm focus-visible:outline-offset-4"
              >
                <span className="text-micro tabular-nums text-fg-3 group-hover:text-fg">{total ? compact(total) : '0'}</span>
                {total > 0 ? (
                  <span className={cx('flex w-full max-w-9 flex-col gap-[2px] transition-opacity', active && active !== b.key && 'opacity-50')} style={{ height: h }}>
                    <span className="w-full rounded-t-[4px] bg-series-2" style={{ height: Math.max(outH - 1, 1) }} />
                    <span className="w-full flex-1 bg-series-1" />
                  </span>
                ) : (
                  <span className="h-px w-full max-w-9 bg-line-strong" />
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-1.5 flex gap-2">
          {bars.map((b) => (
            <span key={b.key} className={cx('min-w-6 flex-1 text-center text-micro tabular-nums', b.current ? 'font-semibold text-fg' : 'text-fg-3')}>
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-3 text-small">
        <summary className="inline-flex min-h-8 items-center text-fg-3 hover:text-fg">표로 보기</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-fg-3">
            <tr><th scope="col" className="py-1 font-medium">버전</th><th scope="col" className="py-1 text-right font-medium">호출</th><th scope="col" className="py-1 text-right font-medium">입력</th><th scope="col" className="py-1 text-right font-medium">출력</th></tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} className="border-t border-line">
                <th scope="row" className="py-1 font-medium">{b.label}</th>
                <td className="py-1 text-right">{fmt(b.calls)}</td>
                <td className="py-1 text-right">{fmt(b.input)}</td>
                <td className="py-1 text-right">{fmt(b.output)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cx('size-2.5 rounded-[2px]', swatch)} />
      {label}
    </span>
  )
}

/* ------------------------------------------------------------ 프로젝트별 토큰 사용량 (누적 가로 막대)
   이름이 긴 항목이 많을 때 세로 막대 대신 쓴다. 같은 두 계열색·범례·표 보기. */
export function TokenRows({ rows, caption }: { rows: { key: string; label: string; input: number; output: number; calls: number }[]; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => r.input + r.output))
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-2">
        <Legend swatch="bg-series-1" label="입력 토큰" />
        <Legend swatch="bg-series-2" label="출력 토큰" />
      </div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const total = r.input + r.output
          return (
            <li key={r.key} title={`입력 ${fmt(r.input)} · 출력 ${fmt(r.output)} · 호출 ${fmt(r.calls)}회`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-small">
                <span className="min-w-0 truncate text-fg-2">{r.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{compact(total)}</span>
              </div>
              <div className="flex h-2 gap-[2px]" style={{ width: `${Math.max((total / max) * 100, 1)}%` }} aria-hidden="true">
                <span className="h-full rounded-l-[2px] bg-series-1" style={{ flexGrow: r.input || 0.0001 }} />
                <span className="h-full rounded-r-[2px] bg-series-2" style={{ flexGrow: r.output || 0.0001 }} />
              </div>
            </li>
          )
        })}
      </ul>
      <details className="mt-3 text-small">
        <summary className="inline-flex min-h-8 items-center text-fg-3 hover:text-fg">표로 보기</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead className="text-fg-3">
            <tr><th scope="col" className="py-1 font-medium">프로젝트</th><th scope="col" className="py-1 text-right font-medium">입력</th><th scope="col" className="py-1 text-right font-medium">출력</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <th scope="row" className="max-w-0 truncate py-1 font-medium">{r.label}</th>
                <td className="py-1 text-right">{fmt(r.input)}</td>
                <td className="py-1 text-right">{fmt(r.output)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

/* ------------------------------------------------------------ 가로 막대 목록 (분류별 개수) */
export function BarList({ rows, total }: {
  rows: { key: string; label: string; value: number; tone: 'danger' | 'warn' | 'info' | 'neutral'; icon?: ReactNode }[]
  total: number
}) {
  const fill = { danger: 'bg-danger', warn: 'bg-warn', info: 'bg-info', neutral: 'bg-fg-3' }
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-small">
          <span className="inline-flex items-center gap-1.5 text-fg-2 [&>svg]:size-3.5">{r.icon}{r.label}</span>
          <span className="h-2 overflow-hidden rounded-[2px] bg-sunken">
            <span className={cx('block h-full rounded-[2px]', fill[r.tone])} style={{ width: `${total ? (r.value / total) * 100 : 0}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{fmt(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}
