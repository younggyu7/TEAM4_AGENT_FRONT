import { FloppyDisk } from '@phosphor-icons/react'
import { useState } from 'react'
import { formatDate } from '../../labels'
import type { Draft } from '../lib/draft'
import { Button } from './ui'

type Kind = 'spec' | 'erd'
interface Saved { at: string; items: string[]; checks: number; answers: number; ok: boolean }

const json = (o: object | undefined): Record<string, string> => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, JSON.stringify(v)]))
/** 저장 전후 비교용: 편집한 기능(또는 테이블)·확인 처리·질문 답을 키마다 글자로 */
function snapshot(kind: Kind, s: Draft['state']) {
  return { items: json(kind === 'spec' ? s.functions : s.entities), checks: { ...json(s.checked), ...json(s.dispositions) }, answers: json(s.answers) }
}
const changed = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k])

/**
 * 초안 화면의 '저장하기'(내 작업을 서버에 저장, 새 버전 아님): 제목 줄 오른쪽 끝 버튼 + 탭 줄 오른쪽 끝에 지난 저장 뒤 바뀐 것.
 * 기능 명세는 바뀐 기능·질문 답·확인 처리, ERD는 바뀐 테이블·확인 처리를 보여 준다.
 */
export function useDraftSave(kind: Kind, draft: Draft) {
  const [snap, setSnap] = useState(() => snapshot(kind, draft.state))
  const [last, setLast] = useState<Saved | null>(null)
  const save = () => {
    const now = snapshot(kind, draft.state)
    const ok = draft.saveNow()
    setLast({ at: new Date().toISOString(), items: changed(snap.items, now.items), checks: changed(snap.checks, now.checks).length,
      answers: changed(snap.answers, now.answers).length, ok })
    if (ok) setSnap(now)
  }
  const what = kind === 'spec' ? '기능 편집·질문 답·확인 처리' : '테이블 편집·확인 처리'
  const button = (
    <Button size="sm" icon={<FloppyDisk />} disabled={draft.readOnly} onClick={save}
      title={draft.readOnly ? '이 단계를 고칠 권한이 없거나 이미 확정한 버전입니다' : `내 작업(${what})을 서버에 저장해 다른 담당자와 함께 봅니다. 새 버전을 만들지 않습니다`}>
      {kind === 'spec' ? '임시저장' : '저장하기'}
    </Button>
  )
  const result = last && (
    <div role="status" className="max-w-md text-right text-small">
      <p className={last.ok ? 'text-ok' : 'text-danger'}>
        {last.ok ? `저장함 ${formatDate(last.at).slice(-5)}` : '저장하지 못했습니다'}
        {last.ok && last.items.length === 0 && last.checks === 0 && last.answers === 0 && ' · 지난 저장 뒤 바뀐 것 없음'}
      </p>
      {last.items.length > 0 && (
        <p className="mt-0.5 flex flex-wrap justify-end gap-1">
          <span className="text-fg-3">{kind === 'spec' ? '바뀐 기능' : '바뀐 테이블'}</span>
          {last.items.map((t) => <code key={t} className="rounded-sm bg-info-soft px-1 text-micro text-info">{t}</code>)}
        </p>
      )}
      {(last.answers > 0 || last.checks > 0) && (
        <p className="mt-0.5 text-fg-3">{[last.answers > 0 && `질문 답 ${last.answers}건`, last.checks > 0 && `확인 필요 처리 ${last.checks}건`].filter(Boolean).join(' · ')}</p>
      )}
    </div>
  )
  return { button, result }
}
