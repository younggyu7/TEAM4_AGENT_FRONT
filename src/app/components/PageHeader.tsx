import { CaretRight } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

/** 가운데 위 줄: 경로(사용자 / 프로젝트 / 화면)와 오른쪽 동작 */
export function PageHeader({ trail, meta, actions }: { trail: ReactNode[]; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <nav aria-label="현재 위치" className="min-w-0">
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-label text-fg-3">
          {trail.map((t, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <CaretRight size={12} aria-hidden="true" />}
              <span className={i === trail.length - 1 ? 'truncate font-medium text-fg' : 'truncate'} aria-current={i === trail.length - 1 ? 'page' : undefined}>
                {t}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        {meta && <div className="text-small text-fg-3">{meta}</div>}
        {actions}
      </div>
    </div>
  )
}

/** 사진 대신 쓰는 장식: 테이블 상자와 관계선. 의미가 없으므로 화면 읽기에서 숨긴다. */
export function SchemaArt({ className }: { className?: string }) {
  const table = (x: number, y: number, w: number, rows: number) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={22 + rows * 16} rx="6" fill="none" stroke="currentColor" strokeOpacity="0.5" />
      <line x1="0" y1="22" x2={w} y2="22" stroke="currentColor" strokeOpacity="0.5" />
      <rect x="10" y="8" width={w * 0.45} height="6" rx="2" fill="currentColor" fillOpacity="0.7" />
      {Array.from({ length: rows }, (_, i) => (
        <rect key={i} x="10" y={30 + i * 16} width={w * (0.35 + ((i * 37) % 30) / 100)} height="4" rx="2" fill="currentColor" fillOpacity="0.28" />
      ))}
    </g>
  )
  return (
    <svg viewBox="0 0 420 300" className={className} aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeOpacity="0.35" fill="none">
        <path d="M150 62 H210 V150 H250" />
        <path d="M150 200 H190 V170 H250" />
        <path d="M340 150 H360 V250 H330" />
        <path d="M244 144 l6 6 l-6 6 M250 144 v12" />
        <path d="M244 164 l6 6 l-6 6 M250 164 v12" />
      </g>
      {table(20, 30, 130, 4)}
      {table(20, 170, 130, 5)}
      {table(250, 110, 90, 6)}
      {table(210, 230, 120, 3)}
    </svg>
  )
}
