import { useEffect, useState } from 'react'
import { getFile } from '../api'
import { Empty } from '../components/ui'
import { useDesign } from '../context'

export function Ddl() {
  const { project, versionNumber: version } = useDesign()
  const [sql, setSql] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setSql(undefined)
    getFile(project, version, 'schema.sql').then(setSql)
  }, [project, version])

  if (sql === undefined) return <p className="muted">schema.sql을 불러오는 중…</p>
  if (sql === null) return <Empty>이 버전에는 schema.sql 파일이 없습니다.</Empty>

  const copy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar__controls">
          <button type="button" className="button" onClick={copy}>{copied ? '복사함' : 'DDL 복사'}</button>
        </div>
        <div className="toolbar__summary">PostgreSQL · {sql.split('\n').length}줄</div>
      </div>
      <pre className="sql"><code>{sql.split('\n').map((line, i) => (
        <span key={i} className={line.trimStart().startsWith('--') ? 'sql__comment' : undefined}>{line}{'\n'}</span>
      ))}</code></pre>
    </div>
  )
}
