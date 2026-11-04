import { PencilSimple, SlackLogo } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getProjectSlack, listPickMembers, setSlackMembers, type PickMember, type ProjectSlack, type SlackMembersResult } from '../../api'
import { Badge, Button, Card, CardHeader, Checkbox } from './ui'

/**
 * 오른쪽 'Slack 채널': 이 프로젝트(회사)의 Slack 비공개 채널과 지금 담당자.
 * 팀장은 '담당자 바꾸기'로 담당자를 더하거나 뺀다 (백엔드가 더한 회원은 채널에 초대, 뺀 회원은 채널에서 내보냄).
 * 채널이 아직 없으면(Slack이 꺼져 있거나 서버가 만드는 중) 팀장에게만 한 줄로 알린다.
 */
export function SlackCard({ project, canEdit }: { project: string; canEdit: boolean }) {
  const [info, setInfo] = useState<ProjectSlack | null | undefined>(undefined)   // undefined = 읽는 중
  const [editing, setEditing] = useState(false)
  const [people, setPeople] = useState<PickMember[]>([])
  const [chosen, setChosen] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<SlackMembersResult | null>(null)
  useEffect(() => {
    setInfo(undefined)
    setEditing(false)
    setDone(null)
    getProjectSlack(project).then(setInfo).catch(() => setInfo(null))
  }, [project])

  if (info === undefined || (info === null && !canEdit)) return null
  if (info === null) {
    return (
      <Card aria-labelledby="slack-card">
        <CardHeader eyebrow="Slack" title="Slack 채널 없음" titleId="slack-card" />
        <p className="px-5 pb-5 text-small text-fg-3">
          아직 이 프로젝트의 Slack 채널이 없습니다. 백엔드 .env에 SLACK_BOT_TOKEN이 있으면 서버가 곧 채널을 만들고
          Slack 멤버 ID가 있는 회원을 초대합니다 (만든 뒤 여기서 담당자를 바꿀 수 있음).
        </p>
      </Card>
    )
  }

  const startEdit = () => {
    setError('')
    setDone(null)
    setChosen(info.members.map((m) => m.id))
    setEditing(true)
    listPickMembers().then((r) => setPeople(r.members)).catch((e) => setError((e as Error).message))
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await setSlackMembers(project, chosen)
      setInfo(r.slack)
      setDone(r.result)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  // 지금 담당자 중 Slack ID가 없어진 회원도 뺄 수 있게 목록에 남긴다
  const options = [...people, ...info.members.filter((m) => !people.some((p) => p.id === m.id))]

  return (
    <Card aria-labelledby="slack-card">
      <CardHeader eyebrow="Slack" title={`#${info.channel_name}`} titleId="slack-card"
        actions={canEdit && !editing
          ? <Button size="sm" variant="ghost" icon={<PencilSimple />} onClick={startEdit} title="담당자를 더하거나 뺍니다 (채널 초대·내보내기)">담당자 바꾸기</Button>
          : undefined} />
      <div className="space-y-3 px-5 pb-5 text-small">
        <p className="flex items-center gap-1.5 text-fg-3">
          <SlackLogo size={14} aria-hidden="true" />{info.team} 워크스페이스 비공개 채널 · 알림을 담당자에게 @멘션
        </p>
        {!editing ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Slack 담당자">
            {info.members.length === 0 && <li className="text-fg-3">담당자 없음</li>}
            {info.members.map((m) => (
              <li key={m.id}>
                <Badge tone={m.has_slack ? 'neutral' : 'warn'}>{m.name} · {m.role_label}{m.has_slack ? '' : ' · Slack ID 없음'}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <fieldset>
            <legend className="mb-1.5 font-medium">담당자 <span className="font-normal text-fg-3">({chosen.length}명)</span></legend>
            <div className="flex flex-col gap-0.5">
              {options.map((m) => (
                <Checkbox key={m.id} checked={chosen.includes(m.id)} disabled={busy || (!m.has_slack && !chosen.includes(m.id))}
                  onChange={(v) => setChosen((list) => v ? [...list, m.id] : list.filter((x) => x !== m.id))}
                  label={<span>{m.name} <span className="text-fg-3">{m.role_label}{m.has_slack ? '' : ' · Slack ID 없음'}</span></span>} />
              ))}
            </div>
            <p className="mt-1.5 text-micro text-fg-3">더한 회원은 채널에 초대하고, 뺀 회원은 채널에서 내보냅니다. 채널에도 변경을 알립니다.</p>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>취소</Button>
            </div>
          </fieldset>
        )}
        {error && <p role="alert" className="text-danger">{error}</p>}
        {done && (
          <p role="status" className="text-ok">
            {done.added.length || done.removed.length
              ? [done.added.length ? `추가: ${done.added.join(', ')}` : '', done.removed.length ? `제외: ${done.removed.join(', ')}` : ''].filter(Boolean).join(' · ')
              : '바뀐 담당자 없음'}
            {done.failed.map((f) => <span key={f.name} className="block text-warn">{f.name}: {f.reason}</span>)}
          </p>
        )}
      </div>
    </Card>
  )
}
