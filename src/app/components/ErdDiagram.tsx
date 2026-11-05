import { ArrowsIn, ArrowsOut, HandGrabbing, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
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
/** 상자 안 도구: 손(기본) · 확대(더블클릭) · 축소(더블클릭). 어떤 도구든 누른 채 끌면 옮긴다 */
type Tool = 'hand' | 'in' | 'out'

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
  const [tool, setTool] = useState<Tool>('hand')
  // 확대·축소한 배율 (null이면 '전체 보기'·'원래 크기'를 따른다). natural = 그림의 원래 너비
  const [scale, setScale] = useState<number | null>(null)
  const [natural, setNatural] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const dragged = useRef(false)

  useEffect(() => {   // 새로 그리면 원래 너비를 읽는다 (viewBox)
    const el = box.current?.querySelector('svg')
    setNatural(el?.viewBox?.baseVal?.width || el?.getBBox?.().width || 0)
  }, [svg])

  // 더블클릭한 곳을 중심으로 확대·축소한다 (그 점이 마우스 아래 그대로 있게 스크롤을 맞춘다)
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const el = box.current
    const svgEl = el?.querySelector('svg')
    if (!el || !svgEl || !natural) return
    const cur = scale ?? svgEl.getBoundingClientRect().width / natural
    const next = Math.min(4, Math.max(0.1, cur * factor))
    const r = el.getBoundingClientRect()
    const ox = clientX - r.left + el.scrollLeft, oy = clientY - r.top + el.scrollTop
    setScale(next)
    requestAnimationFrame(() => {
      el.scrollLeft = ox * (next / cur) - (clientX - r.left)
      el.scrollTop = oy * (next / cur) - (clientY - r.top)
    })
  }

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
          onChange={(z) => { setZoom(z); setScale(null) }}
          options={[{ value: 'fit', label: '전체 보기' }, { value: 'full', label: '원래 크기' }]}
        />
      </div>
      <div className="relative">
      {/* 도구: 손(기본, 끌어서 이동) · 확대·축소(켠 뒤 더블클릭한 곳을 중심으로) */}
      <div role="toolbar" aria-label="ERD 보기 도구" className="absolute top-2 left-2 z-10 flex items-center gap-0.5 rounded-md border border-line bg-card/95 p-0.5 shadow-sm">
        {([['in', '확대 (더블클릭)', MagnifyingGlassPlus], ['out', '축소 (더블클릭)', MagnifyingGlassMinus], ['hand', '이동 (끌기)', HandGrabbing]] as const).map(([t, name, Icon]) => (
          <button key={t} type="button" aria-pressed={tool === t} aria-label={name} title={name} onClick={() => setTool(t)}
            className={cx('rounded-sm p-1.5', tool === t ? 'bg-primary text-on-primary' : 'text-fg-2 hover:bg-sunken')}>
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
        {scale !== null && <span className="px-1.5 text-micro text-fg-3 tabular-nums">{Math.round(scale * 100)}%</span>}
      </div>
      <div
        ref={box}
        className={cx('relative overflow-auto rounded-lg border border-line bg-card p-3 pt-12 select-none',
          tool === 'hand' ? 'cursor-grab' : tool === 'in' ? 'cursor-zoom-in' : 'cursor-zoom-out', 'active:cursor-grabbing',
          onPick && tool === 'hand' && "[&_g[id*='-entity-']]:cursor-pointer")}
        style={{ maxHeight: height, '--fit-h': `${height - 60}px` } as CSSProperties}
        onPointerDown={(e) => {
          if (e.button !== 0 || !box.current) return   // 어떤 도구든 누른 채 끌면 옮긴다
          drag.current = { x: e.clientX, y: e.clientY, left: box.current.scrollLeft, top: box.current.scrollTop, moved: false }
          dragged.current = false
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || !box.current) return
          const dx = e.clientX - d.x, dy = e.clientY - d.y
          if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) { d.moved = true; box.current.setPointerCapture(e.pointerId) }
          if (d.moved) { box.current.scrollLeft = d.left - dx; box.current.scrollTop = d.top - dy }
        }}
        onPointerUp={() => { dragged.current = Boolean(drag.current?.moved); drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onDoubleClick={(e) => { if (tool !== 'hand') zoomAt(e.clientX, e.clientY, tool === 'in' ? 1.4 : 1 / 1.4) }}
        onClick={onPick ? (e) => {
          if (dragged.current || tool !== 'hand') { dragged.current = false; return }   // 끌어서 옮긴 것·확대 도구는 테이블 고르기가 아니다
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
            className={scale !== null ? '[&_svg]:block [&_svg]:!h-auto [&_svg]:!w-full [&_svg]:max-w-none'
              : zoom === 'fit'
              ? '[&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:w-auto [&_svg]:max-w-full [&_svg]:max-h-[var(--fit-h)]'
              : '[&_svg]:block [&_svg]:h-auto [&_svg]:max-w-none'}
            style={scale !== null && natural ? { width: natural * scale } : undefined}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : !error && <p role="status" className="py-8 text-center text-small text-fg-3">ERD를 그리는 중…</p>}
      </div>
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-micro text-fg-3">
        {tool !== 'hand'
          ? <>{tool === 'in' ? '확대' : '축소'}: 더블클릭한 곳을 중심으로 {tool === 'in' ? '키웁니다' : '줄입니다'} · 누른 채 끌면 옮깁니다 · 테이블을 눌러 편집하려면 손 모양으로</>
          : zoom === 'fit' && scale === null
          ? <><ArrowsOut size={12} aria-hidden="true" />끌어서 옮기기 · 글자가 작으면 '원래 크기'나 확대(+)로 보세요{onPick && ' · 테이블을 누르면 편집 화면으로 갑니다'}</>
          : <><ArrowsIn size={12} aria-hidden="true" />끌어서 이웃 테이블로 옮깁니다{onPick && ' · 테이블을 누르면 편집 화면으로 갑니다'}</>}
      </p>
    </div>
  )
}
