import { CheckCircle, Key, Prohibit, ShieldCheck, SlackLogo, UserPlus } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useState } from 'react'
import { createMember, getRoles, listMembers, resetPassword, updateMember, type Member } from '../../api'
import { formatDate } from '../../labels'
import { PageHeader } from '../components/PageHeader'
import { Shell, type ShellBase } from '../components/Shell'
import { Badge, Button, Card, CardHeader, Checkbox, ErrorNote, Label, Loading, TextInput, type Tone } from '../components/ui'

const STATUS: Record<Member['status'], { tone: Tone; label: string }> = {
  pending: { tone: 'warn', label: '승인 대기' },
  active: { tone: 'ok', label: '사용 중' },
  disabled: { tone: 'neutral', label: '중지' },
}
const SELECT = 'min-h-9 rounded-md border border-control bg-card px-2 text-label text-fg disabled:opacity-45'

/** 관리자 페이지: 계정 바로 만들기, 가입 승인과 역할(권한) 지정, 비밀번호 초기화, 중지, 관리자 지정.
 * 역할에 따라 각 단계에서 할 수 있는 일이 정해진다 (오른쪽 표, 백엔드 app/core/auth.py). */
export function Members({ shell }: { shell: ShellBase }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [roles, setRoles] = useState<{ id: string; label: string }[]>([])
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Record<number, string>>({})   // 승인 전에 고른 역할
  const load = useCallback(() => {
    listMembers().then(setMembers).catch((e) => setError((e as Error).message))
  }, [])
  useEffect(() => { load(); getRoles().then(setRoles).catch(() => undefined) }, [load])

  const change = async (body: Parameters<typeof updateMember>[0]) => {
    setError('')
    try {
      const next = await updateMember(body)
      setMembers((list) => list?.map((m) => (m.id === next.id ? next : m)) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const pending = members?.filter((m) => m.status === 'pending').length ?? 0

  return (
    <Shell {...shell} header={<PageHeader trail={[shell.user.name, '관리자 페이지']} />} insights={<RoleGuide />}>
      <div className="space-y-4">
      <CreateCard roles={roles} onCreated={(m) => setMembers((list) => [...(list ?? []), m])} />
      <Card aria-labelledby="members-title">
        <CardHeader level={1} eyebrow="Admin" title="회원·권한" titleId="members-title">
          <p className="mt-1 text-label text-fg-3">역할을 바꾸면 그 회원의 권한이 바로 바뀝니다. 가입한 회원은 역할을 정해 승인합니다. 승인 대기 {pending}명</p>
          <p className="mt-1 flex items-center gap-1.5 text-small text-fg-3">
            <SlackLogo size={14} aria-hidden="true" />
            Slack 멤버 ID는 프로젝트 Slack 채널에 초대하고 알림에서 @멘션할 때 씁니다 (업로드 화면에서 담당자로 고를 수 있음). 비우면 초대·멘션하지 않습니다.
          </p>
        </CardHeader>
        {error && <ErrorNote message={error} />}
        {!members ? <Loading label="회원을 불러오는 중" lines={5} /> : (
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[840px] text-left text-label">
              <thead className="text-small text-fg-3">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">회원</th>
                  <th className="py-2 pr-3 font-medium">상태</th>
                  <th className="py-2 pr-3 font-medium">역할</th>
                  <th className="py-2 pr-3 font-medium">관리자</th>
                  <th className="py-2 pr-3 font-medium">Slack 멤버 ID</th>
                  <th className="py-2 font-medium"><span className="sr-only">처리</span></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const role = picked[m.id] ?? (m.role || m.requested_role)
                  const self = m.id === shell.user.id
                  return (
                    <tr key={m.id} className="border-b border-line align-middle last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="block font-medium">{m.name}{self && <span className="ml-1 text-small text-fg-3">(나)</span>}</span>
                        <span className="block text-small text-fg-3">{m.email} · 가입 {formatDate(m.created_at)}</span>
                        {m.requested_role && m.status === 'pending' && (
                          <span className="block text-micro text-fg-3">희망: {roles.find((r) => r.id === m.requested_role)?.label ?? m.requested_role}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3"><Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge></td>
                      <td className="py-2.5 pr-3">
                        <select aria-label={`${m.name} 역할`} className={SELECT} value={role}
                          onChange={(e) => m.status === 'pending' ? setPicked((p) => ({ ...p, [m.id]: e.target.value })) : void change({ id: m.id, role: e.target.value })}>
                          <option value="">역할 없음</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Checkbox checked={m.is_admin} label={<span className="sr-only">{m.name} 관리자</span>}
                          onChange={(v) => void change({ id: m.id, is_admin: v })} />
                      </td>
                      <td className="py-2.5 pr-3">
                        <SlackCell member={m}
                          onSaved={(next) => setMembers((list) => list?.map((x) => (x.id === next.id ? next : x)) ?? null)} />
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                        <PasswordButton member={m} onError={setError} />
                        {m.status !== 'active' ? (
                          <Button size="sm" variant="ok" icon={<CheckCircle />} disabled={!role}
                            title={role ? '이 역할로 승인합니다' : '역할을 먼저 고르세요'}
                            onClick={() => void change({ id: m.id, role, status: 'active' })}>승인</Button>
                        ) : (
                          <Button size="sm" variant="danger" icon={<Prohibit />} disabled={self}
                            title={self ? '자기 계정은 중지할 수 없습니다' : '로그인을 막습니다 (산출물은 그대로)'}
                            onClick={() => void change({ id: m.id, status: 'disabled' })}>중지</Button>
                        )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
    </Shell>
  )
}

/** 계정 바로 만들기: 역할을 정해 승인된 상태로 만든다 (가입 절차 없이) */
function CreateCard({ roles, onCreated }: { roles: { id: string; label: string }[]; onCreated: (m: Member) => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '', admin: false, slack: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [sending, setSending] = useState(false)
  const id = useId()
  const set = (k: 'name' | 'email' | 'password' | 'role' | 'slack') => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const submit = async () => {
    setSending(true)
    setError('')
    setDone('')
    try {
      const m = await createMember({ email: form.email.trim(), name: form.name.trim(), password: form.password, role: form.role, is_admin: form.admin, slack_id: form.slack.trim() })
      onCreated(m)
      setDone(`${m.name} (${m.role_label}) 계정을 만들었습니다.`)
      setForm({ name: '', email: '', password: '', role: form.role, admin: false, slack: '' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }
  return (
    <Card aria-labelledby="create-title">
      <CardHeader eyebrow="New account" title="계정 만들기" titleId="create-title">
        <p className="mt-1 text-small text-fg-3">가입 절차 없이 역할을 정해 바로 쓸 수 있는 계정을 만듭니다. 비밀번호는 본인에게 따로 알려 주세요.</p>
      </CardHeader>
      <form className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div><Label htmlFor={`${id}-n`}>이름</Label><TextInput dense id={`${id}-n`} value={form.name} onChange={set('name')} /></div>
        <div><Label htmlFor={`${id}-e`}>이메일</Label><TextInput dense id={`${id}-e`} type="email" value={form.email} onChange={set('email')} /></div>
        <div><Label htmlFor={`${id}-p`} hint="8자 이상">비밀번호</Label><TextInput dense id={`${id}-p`} type="text" autoComplete="off" value={form.password} onChange={set('password')} /></div>
        <div>
          <Label htmlFor={`${id}-r`}>역할</Label>
          <select id={`${id}-r`} className={`${SELECT} w-full`} value={form.role} onChange={set('role')}>
            <option value="">선택</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div><Label htmlFor={`${id}-s`} hint="선택">Slack 멤버 ID</Label><TextInput dense id={`${id}-s`} className="font-mono" placeholder="U…" value={form.slack} onChange={set('slack')} /></div>
        <div className="flex flex-col justify-end gap-1.5">
          <Checkbox checked={form.admin} onChange={(v) => setForm((f) => ({ ...f, admin: v }))} label="관리자" />
          <Button type="submit" size="sm" variant="primary" icon={<UserPlus />}
            disabled={sending || !form.name.trim() || !form.email.trim() || form.password.length < 8 || !form.role}>만들기</Button>
        </div>
        {(error || done) && <p role={error ? 'alert' : 'status'} className={`text-small sm:col-span-2 lg:col-span-6 ${error ? 'text-danger' : 'text-ok'}`}>{error || done}</p>}
      </form>
    </Card>
  )
}

/** 비밀번호 초기화: 새 비밀번호를 적으면 바꾸고 그 회원의 로그인을 끊는다 */
function PasswordButton({ member, onError }: { member: Member; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  if (!open) {
    return <Button size="sm" variant="ghost" icon={<Key />} onClick={() => { setOpen(true); setNote('') }}>{note || '비밀번호'}</Button>
  }
  return (
    <span className="inline-flex items-center gap-1">
      <TextInput dense aria-label={`${member.name} 새 비밀번호`} placeholder="새 비밀번호 8자 이상" className="!w-40" value={value}
        onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" variant="primary" disabled={value.length < 8}
        onClick={() => resetPassword(member.id, value).then(() => { setOpen(false); setValue(''); setNote('바꿈') }).catch((e) => onError((e as Error).message))}>바꾸기</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>취소</Button>
    </span>
  )
}

/** Slack 멤버 ID 입력: 바꾸면 '저장' (프로젝트 채널 초대·알림 멘션에 쓴다) */
function SlackCell({ member, onSaved }: { member: Member; onSaved: (m: Member) => void }) {
  const [value, setValue] = useState(member.slack_id)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = value.trim().toUpperCase() !== member.slack_id
  const save = async () => {
    setBusy(true)
    setNote(null)
    try {
      const next = await updateMember({ id: member.id, slack_id: value.trim() })
      onSaved(next)
      setValue(next.slack_id)
      setNote({ ok: true, text: next.slack_id ? '저장함' : '지움' })
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        <TextInput dense aria-label={`${member.name} Slack 멤버 ID`} placeholder="U… (없음)" className="!w-36 font-mono"
          value={value} maxLength={21} onChange={(e) => { setValue(e.target.value); setNote(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save() }} />
        {dirty && <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>저장</Button>}
      </span>
      {note && <span role={note.ok ? 'status' : 'alert'} className={`max-w-56 text-micro ${note.ok ? 'text-ok' : 'text-danger'}`}>{note.text}</span>}
    </span>
  )
}

/** 오른쪽: 역할별로 할 수 있는 일 (백엔드 app/core/auth.py와 같은 표) */
function RoleGuide() {
  const rows: [string, string][] = [
    ['PM', '업로드 · 기능 명세 수정·확정(내보내기) · 승인 요청 반려 · ERD 수정·최종 확정 · 최종 승인·수정 지시 · 담당자 바꾸기 · 프로젝트 이름·삭제 · 실행 끄기 (최종 개발하기·코드 고치기는 개발자)'],
    ['개발자', "업로드 · 기능 명세 수정 → PM에게 '수정 완료 승인 요청' · ERD 수정·최종 확정 · 최종 승인·수정 지시 · 최종 개발하기 · 브랜치·코드 고치기·저장하기 · 합치기 요청·합치기·반려 · 원격 올리기 · 실행 끄기"],
  ]
  return (
    <Card aria-labelledby="role-guide">
      <CardHeader eyebrow="Roles" title="역할별 권한" titleId="role-guide" />
      <dl className="space-y-2.5 px-5 pb-5 text-small">
        {rows.map(([role, what]) => (
          <div key={role}>
            <dt className="flex items-center gap-1.5 font-medium"><ShieldCheck size={14} aria-hidden="true" className="text-fg-3" />{role}</dt>
            <dd className="mt-0.5 text-fg-3">{what}</dd>
          </div>
        ))}
        <p className="pt-2 text-fg-3">보기는 승인된 회원 누구나 할 수 있습니다. 관리자는 역할과 상관없이 회원을 승인합니다.</p>
      </dl>
    </Card>
  )
}
