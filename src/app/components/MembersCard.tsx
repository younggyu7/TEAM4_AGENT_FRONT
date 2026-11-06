import { PencilSimple, SlackLogo } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getProjectMembers, listPickMembers, setProjectMembers, type MembersResult, type PickMember, type ProjectMembers } from '../../api'
import { Badge, Button, Card, CardHeader, Checkbox } from './ui'

/**
 * 오른쪽 '담당자': 이 프로젝트를 보는 회원(담당자와 팀장)과 Slack 채널.
 * 담당자가 아닌 회원에게는 이 프로젝트가 목록·알림 어디에도 보이지 않는다 (백엔드 services/project_access).
 * 팀장만 '바꾸기'로 담당자를 더하거나 뺀다: 뺀 회원은 바로 못 보고, Slack 채널이 있으면 더한 회원은 초대·뺀 회원은 내보낸다.
 */
export function MembersCard({ project, canEdit }: { project: string; canEdit: boolean }) {
  const [info, setInfo] = useState<ProjectMembers | null>(null)
  const [editing, setEditing] = useState(false)
  const [people, setPeople] = useState<PickMember[]>([])
  const [chosen, setChosen] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<MembersResult | null>(null)
  useEffect(() => {
    setInfo(null)
    setEditing(false)
    setDone(null)
    setError('')
    getProjectMembers(project).then(setInfo).catch((e) => setError((e as Error).message))
  }, [project])

  if (!info) return error ? <Card aria-labelledby="members-card"><p role="alert" className="p-5 text-small text-danger">{error}</p></Card> : null

  const always = new Set(info.members.filter((m) => m.always).map((m) => m.id))
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
      const r = await setProjectMembers(project, chosen)
      setInfo(r)
      setDone(r.result)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const slack = info.slack
  // 담당자 배지 옆 Slack 상태: 채널이 있을 때만 (없으면 아래 한 줄로 이유를 보인다)
  const slackNote = (m: ProjectMembers['members'][number]) =>
    !slack || m.in_channel ? '' : m.has_slack ? ' · Slack 채널에 없음' : ' · Slack ID 없음'

  return (
    <Card aria-labelledby="members-card">
      <CardHeader eyebrow="Members" title={`담당자 ${info.members.length}명`} titleId="members-card"
        actions={canEdit && !editing
          ? <Button size="sm" variant="ghost" icon={<PencilSimple />} onClick={startEdit} title="담당자를 더하거나 뺍니다 (담당자만 이 프로젝트를 봄)">바꾸기</Button>
          : undefined} />
      <div className="space-y-3 px-5 pb-5 text-small">
        <p className="text-fg-3">담당자와 팀장만 이 프로젝트를 보고 알림을 받습니다.</p>
        {!editing ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="담당자">
            {info.members.map((m) => (
              <li key={m.id}>
                <Badge tone={slackNote(m) ? 'warn' : 'neutral'}>{m.name} · {m.role_label}{m.always ? ' · 필수' : ''}{slackNote(m)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <fieldset>
            <legend className="mb-1.5 font-medium">담당자 <span className="font-normal text-fg-3">({chosen.length}명)</span></legend>
            <div className="flex flex-col gap-0.5">
              {people.map((m) => (
                <Checkbox key={m.id} checked={always.has(m.id) || m.role === 'lead' || chosen.includes(m.id)}
                  disabled={busy || always.has(m.id) || m.role === 'lead'}
                  onChange={(v) => setChosen((list) => v ? [...list, m.id] : list.filter((x) => x !== m.id))}
                  label={<span>{m.name} <span className="text-fg-3">{m.role_label}{m.role === 'lead' ? ' · 필수' : m.has_slack ? '' : ' · Slack ID 없음'}</span></span>} />
              ))}
            </div>
            <p className="mt-1.5 text-micro text-fg-3">
              뺀 회원은 이 프로젝트를 더는 볼 수 없습니다.{slack ? ' 더한 회원은 Slack 채널에 초대하고, 뺀 회원은 채널에서 내보냅니다.' : ''}
            </p>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>취소</Button>
            </div>
          </fieldset>
        )}
        <p className="flex items-start gap-1.5 text-fg-3">
          <SlackLogo size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {slack
              ? <>{slack.team} 워크스페이스 비공개 채널 <span className="font-mono">#{slack.channel_name}</span> · 알림을 담당자에게 @멘션</>
              : info.slack_enabled
                ? '아직 이 프로젝트의 Slack 채널이 없습니다. 서버가 곧 채널을 만들고 담당자를 초대합니다.'
                : 'Slack 꺼짐: 서버에 Slack 봇 토큰(.env SLACK_BOT_TOKEN)이 없습니다. 알림은 이 웹의 사이드바·홈에서 볼 수 있습니다.'}
          </span>
        </p>
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
