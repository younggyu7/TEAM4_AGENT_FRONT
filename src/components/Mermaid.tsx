import { useEffect, useId, useState } from 'react'

let ready: Promise<typeof import('mermaid').default> | null = null

/** mermaid는 크므로 ERD를 처음 그릴 때 불러온다. */
function loadMermaid() {
  ready ??= import('mermaid').then(({ default: mermaid }) => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      fontFamily: '"IBM Plex Sans KR", system-ui, sans-serif',
      maxTextSize: 1_000_000,
      maxEdges: 5_000,
      er: { useMaxWidth: false },
    })
    return mermaid
  })
  return ready
}

export function Mermaid({ code, label }: { code: string; label: string }) {
  const id = 'mmd' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setError('')
    loadMermaid()
      .then((m) => m.render(id, code))
      .then(({ svg }) => { if (!cancelled) setSvg(svg) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [id, code])

  if (error) return <p className="error">ERD를 그리지 못했습니다: {error}</p>
  if (!svg) return <p className="muted">ERD를 그리는 중…</p>
  // mermaid가 securityLevel 'strict'로 만든 SVG
  return <div className="diagram" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
}
