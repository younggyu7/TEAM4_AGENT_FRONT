import { useEffect, useRef, useState } from 'react'
import { getPreviewTerminal, type PreviewTerminal as Terminal } from '../../api'
import { cx } from './ui'

/**
 * 최종 개발물 2단계 터미널: 서버가 실행한 명령과 출력(docker build · 화면 빌드 · docker compose up)과
 * 앱 백엔드 컨테이너 로그(docker compose logs)를 서버 터미널처럼 보여 준다. 빌드 중에는 2초, 그 밖에는 5초마다 다시 읽는다.
 * 맨 아래를 보고 있을 때만 새 줄을 따라 내려간다 (위로 올려 읽는 중이면 그대로).
 */
export function PreviewTerminal({ project }: { project: string }) {
  const [data, setData] = useState<Terminal | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'run' | 'app'>('run')
  const box = useRef<HTMLPreElement>(null)
  const follow = useRef(true)

  useEffect(() => {
    let alive = true
    let timer = 0
    const load = () => getPreviewTerminal(project)
      .then((t) => {
        if (!alive) return
        setData(t)
        setError('')
        timer = window.setTimeout(load, t.status === 'building' || t.status === 'starting' ? 2000 : 5000)
      })
      .catch((e) => { if (alive) { setError((e as Error).message); timer = window.setTimeout(load, 5000) } })
    load()
    return () => { alive = false; window.clearTimeout(timer) }
  }, [project])

  const lines = !data ? [] : tab === 'run' ? data.log : data.app_log
  useEffect(() => {
    if (follow.current && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines.length, tab])

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="flex items-center gap-1 border-b border-white/10 bg-[#1e1e1e] px-2 py-1.5">
        {([['run', '빌드·실행'], ['app', '앱 서버 로그']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); follow.current = true }}
            className={cx('rounded-sm px-2 py-0.5 text-micro', tab === id ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white')}>
            {label}{data && <span className="ml-1 tabular-nums text-white/40">{(id === 'run' ? data.log : data.app_log).length}</span>}
          </button>
        ))}
        <span className="ml-auto truncate text-micro text-white/50">{error || data?.message || ''}</span>
      </div>
      <pre ref={box} aria-label="실행 터미널" aria-live="off"
        onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }}
        className="h-80 overflow-auto bg-[#1e1e1e] p-3 font-mono text-[12px] leading-[18px] text-[#d4d4d4] whitespace-pre-wrap">
        {lines.length ? lines.map((l, i) => (
          <div key={i} className={l.startsWith('$ ') ? 'text-[#4fc1ff]' : /error|오류|failed|못했|exception/i.test(l) ? 'text-[#f48771]' : undefined}>{l}</div>
        )) : <span className="text-white/40">{tab === 'run' ? "아직 실행 기록이 없습니다. 위의 '결과물 미리보기'를 누르면 빌드·실행이 여기에 나옵니다." : '앱 서버가 켜지면 로그가 나옵니다.'}</span>}
      </pre>
    </div>
  )
}
