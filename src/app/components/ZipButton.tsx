import { CircleNotch, FileZip } from '@phosphor-icons/react'
import { zipSync } from 'fflate'
import { useState } from 'react'
import { ALL_ARTIFACT_FILES as ARTIFACT_FILES, fileUrl } from '../lib/artifacts'
import { Button } from './ui'

/**
 * 산출물 파일 zip 받기: 이 버전 폴더의 파일을 받아 브라우저에서 zip 하나로 묶는다.
 * 별도 API 없이 /api/file만 쓰므로 FastAPI로 옮겨도 그대로 동작한다. 없는 파일(예: DB 검증을 안 한 버전)은 빼고 묶는다.
 */
export function ZipButton({ project, version, size = 'md', variant = 'secondary' }: {
  project: string
  version: string
  size?: 'sm' | 'md'
  variant?: 'primary' | 'secondary'
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // 프로젝트 ID가 'semantic-review/고객요구사항5-review'처럼 경로일 수 있어 마지막 이름만 쓴다
  const base = `${project.split('/').pop()}_v${version}_산출물`

  const download = async () => {
    setBusy(true)
    setNote('')
    try {
      const found = await Promise.all(ARTIFACT_FILES.map(async (f) => {
        const res = await fetch(fileUrl(project, version, f.name))
        return res.ok ? [f.name, new Uint8Array(await res.arrayBuffer())] as const : null
      }))
      const files = found.flatMap((x) => (x ? [x] : []))
      if (files.length === 0) {
        setNote('받을 파일이 없습니다.')
        return
      }
      // zip 안에서도 한 폴더로 묶어, 풀었을 때 파일이 흩어지지 않게 한다
      const zipped = zipSync(Object.fromEntries(files.map(([name, data]) => [`${base}/${name}`, data])), { level: 6 })
      const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
      Object.assign(document.createElement('a'), { href: url, download: `${base}.zip` }).click()
      URL.revokeObjectURL(url)
      const missing = ARTIFACT_FILES.length - files.length
      setNote(`${files.length}개 파일을 묶었습니다${missing ? ` (없는 파일 ${missing}개 제외)` : ''}.`)
    } catch (e) {
      setNote(`zip을 만들지 못했습니다: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size={size}
        variant={variant}
        icon={busy ? <CircleNotch className="animate-spin" /> : <FileZip />}
        disabled={busy}
        onClick={() => void download()}
        title={`v${version} 산출물 파일 ${ARTIFACT_FILES.length}종을 zip으로 받습니다`}
      >
        {busy ? '묶는 중…' : '산출물 파일 받기 (zip)'}
      </Button>
      <span role="status" className="text-small font-normal text-fg-3">{note}</span>
    </span>
  )
}
