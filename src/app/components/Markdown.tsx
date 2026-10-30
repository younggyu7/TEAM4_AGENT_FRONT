import { Fragment, type ReactNode } from 'react'
import { cx } from './ui'

/**
 * 산출물 Markdown 보기: 백엔드가 고정 형식으로 쓰는 문서(개발 스펙, SPEC_FORMAT.md)에 나오는 것만 그린다 —
 * 제목(#~####), 인용(>), 표, 목록(-·1.), 코드 블록(```), 문단, 줄 안의 `코드`·**굵게**·링크·<br>.
 * HTML을 그대로 넣지 않고 React 요소로 만든다 (문서 내용이 스크립트로 실행되지 않게).
 */
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'list'; ordered: boolean; items: { text: string; depth: number }[] }
  | { kind: 'code'; text: string }
  | { kind: 'para'; text: string }

const HEADING = /^(#{1,6})\s+(.*)$/
const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const SEPARATOR = /^:?-{3,}:?$/

/** 표 한 줄을 칸으로 나눈다 (칸 안의 \| 는 글자 |) */
function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

const startsBlock = (line: string) =>
  HEADING.test(line) || line.startsWith('>') || line.trimStart().startsWith('|') || LIST_ITEM.test(line) || line.startsWith('```')

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('```')) {
      const body: string[] = []
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i])
      out.push({ kind: 'code', text: body.join('\n') })
      i++
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      out.push({ kind: 'heading', level: h[1].length, text: h[2].trim() })
      i++
      continue
    }
    if (line.startsWith('>')) {
      const quote: string[] = []
      for (; i < lines.length && lines[i].startsWith('>'); i++) quote.push(lines[i].replace(/^>\s?/, '').replace(/\s{2,}$/, ''))
      out.push({ kind: 'quote', lines: quote })
      continue
    }
    if (line.trimStart().startsWith('|')) {
      const rows: string[][] = []
      for (; i < lines.length && lines[i].trimStart().startsWith('|'); i++) rows.push(splitRow(lines[i]))
      const hasHead = rows.length > 1 && rows[1].every((c) => SEPARATOR.test(c))
      out.push({ kind: 'table', head: hasHead ? rows[0] : [], rows: hasHead ? rows.slice(2) : rows })
      continue
    }
    const li = LIST_ITEM.exec(line)
    if (li) {
      const ordered = /\d/.test(li[2])
      const items: { text: string; depth: number }[] = []
      while (i < lines.length && lines[i].trim()) {
        const m = LIST_ITEM.exec(lines[i])
        if (m) items.push({ text: m[3], depth: Math.floor(m[1].length / 2) })
        else if (/^\s+/.test(lines[i]) && items.length) items[items.length - 1].text += ' ' + lines[i].trim()   // 이어지는 줄
        else break
        i++
      }
      out.push({ kind: 'list', ordered, items })
      continue
    }
    const para: string[] = []
    for (; i < lines.length && lines[i].trim() && !startsBlock(lines[i]); i++) para.push(lines[i].trim())
    out.push({ kind: 'para', text: para.join(' ') })
  }
  return out
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|<br\s*\/?>)/g

/** 줄 안의 서식: `코드`, **굵게**, [글](주소) (http 주소만 링크), <br> 줄바꿈 */
export function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE)
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null
        if (/^<br\s*\/?>$/.test(p)) return <br key={i} />
        if (p.startsWith('`') && p.endsWith('`') && p.length > 1) {
          return <code key={i} className="rounded-sm bg-sunken px-1 py-0.5 font-mono text-[0.92em]">{p.slice(1, -1)}</code>
        }
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)
        if (link) {
          return /^https?:\/\//.test(link[2])
            ? <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="underline underline-offset-4">{link[1]}</a>
            : <span key={i} className="font-mono text-[0.92em]">{link[1]}</span>
        }
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

/** 제목의 id (같은 문서 안 목차 링크용). 같은 제목이 또 나오면 번호를 붙인다 */
export function headingIds(blocks: Block[], prefix: string): Map<number, string> {
  const ids = new Map<number, string>()
  const seen = new Map<string, number>()
  blocks.forEach((b, n) => {
    if (b.kind !== 'heading') return
    const base = `${prefix}-${b.text.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    ids.set(n, count > 1 ? `${base}-${count}` : base)
  })
  return ids
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-title font-semibold mt-1 mb-3',
  2: 'text-subtitle font-semibold mt-8 mb-3 border-b border-line pb-2',
  3: 'text-body font-semibold mt-6 mb-2',
  4: 'text-label font-semibold mt-4 mb-2 font-mono',
}

/** toc: 문서 앞에 ## 절 목차를 붙인다 (긴 문서에서 절로 바로 가기) */
export function Markdown({ text, idPrefix = 'md', className, toc = false }: {
  text: string
  idPrefix?: string
  className?: string
  toc?: boolean
}) {
  const blocks = parseMarkdown(text)
  const ids = headingIds(blocks, idPrefix)
  const sections = blocks.flatMap((b, n) => (b.kind === 'heading' && b.level === 2 ? [{ text: b.text, id: ids.get(n)! }] : []))
  return (
    <div className={cx('min-w-0 text-label leading-relaxed text-fg', className)}>
      {toc && sections.length > 1 && (
        <nav aria-label="문서 목차" className="mb-4 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-sunken px-3 py-2 text-small">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }) }}
              className="text-fg-2 underline-offset-4 hover:text-fg hover:underline">{s.text}</a>
          ))}
        </nav>
      )}
      {blocks.map((b, n) => renderBlock(b, n, ids.get(n)))}
    </div>
  )
}

function renderBlock(b: Block, n: number, id?: string): ReactNode {
  switch (b.kind) {
    case 'heading': {
      const Tag = `h${Math.min(b.level + 1, 6)}` as 'h2'   // 페이지 제목(h1) 아래에 들어가므로 한 단계 낮춘다
      return <Tag key={n} id={id} className={cx('scroll-mt-24', HEADING_CLASS[b.level] ?? HEADING_CLASS[4])}><Inline text={b.text} /></Tag>
    }
    case 'quote':
      return (
        <blockquote key={n} className="my-3 border-l-2 border-line-strong pl-3 text-small text-fg-2">
          {b.lines.map((l, i) => <p key={i}><Inline text={l} /></p>)}
        </blockquote>
      )
    case 'table':
      return (
        <div key={n} className="my-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-small">
            {b.head.length > 0 && (
              <thead className="bg-sunken text-left">
                <tr>{b.head.map((c, i) => <th key={i} scope="col" className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap"><Inline text={c} /></th>)}</tr>
              </thead>
            )}
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-b-0 align-top">
                  {r.map((c, j) => <td key={j} className="px-3 py-2"><Inline text={c} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul'
      return (
        <Tag key={n} className={cx('my-2 space-y-1 pl-5', b.ordered ? 'list-decimal' : 'list-disc')}>
          {b.items.map((it, i) => <li key={i} style={it.depth ? { marginLeft: `${it.depth * 1.25}rem` } : undefined}><Inline text={it.text} /></li>)}
        </Tag>
      )
    }
    case 'code':
      return <pre key={n} className="my-3 overflow-auto rounded-lg border border-line bg-sunken p-3 font-mono text-small"><code>{b.text}</code></pre>
    case 'para':
      return <p key={n} className="my-2"><Inline text={b.text} /></p>
  }
}
