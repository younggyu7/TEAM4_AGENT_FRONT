import { ArrowsIn, ArrowsOut } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { ident } from '../lib/erd'
import { cx, Segmented } from './ui'

let ready: Promise<typeof import('mermaid').default> | null = null

/** mermaid는 크므로 ERD를 처음 그릴 때 불러온다. 색은 화면 변수(--card, --fg …)에서 읽어 단색으로 맞춘다. */
function loadMermaid() {
  ready ??= import('mermaid').then(({ default: mermaid }) => {
    const css = getComputedStyle(document.documentElement)
    const v = (name: string) => css.getPropertyValue(name).trim()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        fontFamily: '"Pretendard Variable", Pretendard, system-ui, sans-serif',
        fontSize: '13px',
        background: v('--card'),
        primaryColor: v('--card'),
        primaryTextColor: v('--fg'),
        primaryBorderColor: v('--line-strong'),
        lineColor: v('--fg-3'),
        textColor: v('--fg-2'),
        attributeBackgroundColorOdd: v('--card'),
        attributeBackgroundColorEven: v('--sunken'),
      },
      maxTextSize: 1_000_000,
      er: { useMaxWidth: false },
    })
    return mermaid
  })
  return ready
}

type Zoom = 'fit' | 'full'

/** 편집할 때마다 다시 그리면 무거우므로 입력이 잠깐 멈춘 뒤 그린다. 그리는 동안은 이전 그림을 둔다.
 *  '전체 보기'는 상자에 맞춰 줄이고, '원래 크기'는 글자를 읽을 수 있게 두고 가운데 테이블로 스크롤한다. */
export function ErdDiagram({ code, label, centerId, height = 460, onPick, entityIds = [], defaultZoom = 'fit' }: {
  code: string
  label: string
  centerId?: string
  height?: number
  /** 그림에서 테이블을 누르면 그 테이블 ID로 부른다 (키보드 사용자는 테이블 목록으로 같은 일을 한다) */
  onPick?: (entityId: string) => void
  entityIds?: string[]
  defaultZoom?: Zoom
}) {
  const id = 'erd' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState<Zoom>(defaultZoom)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const t = window.setTimeout(() => {
      loadMermaid()
        .then((m) => m.render(id, code))
        .then(({ svg }) => { if (!cancelled) { setSvg(svg); setError('') } })
        .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    }, 300)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [id, code])

  // 원래 크기에서는 선택한 테이블이 상자 가운데 오게 한다
  useEffect(() => {
    const el = box.current
    if (zoom !== 'full' || !el || !centerId) return
    // mermaid 테이블 노드 id: <그림 id>-entity-<테이블>-<번호> (관계선 path에도 같은 글자가 들어가므로 g만, 끝이 번호인 것만)
    const pattern = new RegExp(`entity-${ident(centerId)}-\\d+$`)
    const node = [...el.querySelectorAll<SVGGElement>('g[id]')].find((g) => pattern.test(g.id))
    if (!node) return
    const b = el.getBoundingClientRect()
    const n = node.getBoundingClientRect()
    el.scrollTo({ left: el.scrollLeft + n.left - b.left - 16, top: el.scrollTop + n.top - b.top - 16 })
  }, [zoom, svg, centerId])

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Segmented<Zoom>
          label="ERD 크기"
          value={zoom}
          onChange={setZoom}
          options={[{ value: 'fit', label: '전체 보기' }, { value: 'full', label: '원래 크기' }]}
        />
      </div>
      <div
        ref={box}
        className={cx('relative overflow-auto rounded-lg border border-line bg-card p-3', onPick && "[&_g[id*='-entity-']]:cursor-pointer")}
        style={{ maxHeight: height, '--fit-h': `${height - 24}px` } as CSSProperties}
        onClick={onPick ? (e) => {
          // 누른 곳에서 위로 올라가며 테이블 노드(<그림 id>-entity-<테이블>-<번호>)를 찾는다
          const node = (e.target as Element).closest("g[id*='-entity-']")
          const name = node && /-entity-(.+)-\d+$/.exec(node.id)?.[1]
          const id = name && entityIds.find((x) => ident(x) === name)
          if (id) onPick(id)
        } : undefined}
      >
        {error && <p role="alert" className="mb-2 text-small text-danger">ERD를 그리지 못했습니다. 컬럼 이름·타입을 확인하세요. ({error.split('\n')[0]})</p>}
        {svg ? (
          // mermaid가 securityLevel 'strict'로 만든 SVG
          <div
            role="img"
            aria-label={label}
            className={zoom === 'fit'
              ? '[&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-full [&_svg]:max-h-[var(--fit-h)]'
              : '[&_svg]:block [&_svg]:h-auto [&_svg]:max-w-none'}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : !error && <p role="status" className="py-8 text-center text-small text-fg-3">ERD를 그리는 중…</p>}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-micro text-fg-3">
        {zoom === 'fit'
          ? <><ArrowsOut size={12} aria-hidden="true" />글자가 작으면 '원래 크기'로 보세요{onPick && ' · 테이블을 누르면 편집 화면으로 갑니다'}</>
          : <><ArrowsIn size={12} aria-hidden="true" />상자 안에서 스크롤해 이웃 테이블을 봅니다</>}
      </p>
    </div>
  )
}
