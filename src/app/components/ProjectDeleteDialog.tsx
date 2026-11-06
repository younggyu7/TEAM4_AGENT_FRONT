import { Trash, Warning, X } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { deleteProject } from '../../api'
import type { Project } from '../../types'
import { Button, IconButton, TextInput } from './ui'

/**
 * 프로젝트 삭제 확인 창 (왼쪽 프로젝트 목록 오른쪽 클릭 → '프로젝트 삭제', PM만).
 * 서버의 버전·산출물·초안·알림, 최종 개발물 코드 폴더(git 포함), 실행 미리보기 DB까지 지운다. 되돌릴 수 없어서 이름을 그대로 적어야 지운다.
 */
export function ProjectDeleteDialog({ project, onClose, onDeleted }: {
  project: Project | null
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (project && !d.open) { setTyped(''); setError(''); d.showModal() }
    if (!project && d.open) d.close()
  }, [project])

  const submit = async () => {
    if (!project || typed !== project.id) return
    setSending(true)
    setError('')
    try {
      await deleteProject(project.id, typed)
      onDeleted(project.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <dialog ref={ref} aria-labelledby="delete-project-title" onClose={onClose} onCancel={(e) => { if (sending) e.preventDefault() }}
      className="m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-fg backdrop:bg-black/40">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow">Delete project</p>
          <h2 id="delete-project-title" className="mt-1 truncate text-subtitle font-medium">{project?.name} 삭제</h2>
        </div>
        <IconButton label="닫기" icon={<X />} onClick={onClose} disabled={sending} />
      </div>
      <form className="space-y-4 px-5 py-5" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-small text-danger">
          <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">되돌릴 수 없습니다. 모든 팀원에게서 사라집니다.</p>
            <p className="mt-1">설계 버전 {project?.versions.length ?? 0}개와 산출물, 초안·알림, 최종 개발물 코드(git 저장소 포함), 실행 미리보기 DB를 모두 지웁니다.
              Slack 채널은 지우지 않습니다.</p>
          </div>
        </div>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-small text-fg-2">
            확인하려면 프로젝트 이름 <strong className="font-mono text-fg">{project?.id}</strong>{project && project.name !== project.id.split('/').pop() ? ' (처음 올린 이름)' : ''} 을(를) 그대로 적어 주세요.
          </label>
          <TextInput id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} disabled={sending} />
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={sending}>취소</Button>
          <Button type="submit" variant="danger" icon={<Trash />} disabled={sending || typed !== project?.id}>
            {sending ? '지우는 중…' : '프로젝트 삭제'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
