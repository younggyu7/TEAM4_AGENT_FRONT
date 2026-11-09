import { Copy, Key, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { createToken, deleteToken, getMyWork, listTokens, type AccessTokenInfo, type MyWork } from '../../api'
import { formatDate } from '../../labels'
import type { ShellBase } from './Shell'
import { Badge, Button, Card, CardHeader, Loading, TextInput } from './ui'

/** 홈 '내 작업': 내가 맡은 작업 묶음과 내가 검토할 제출 (모든 프로젝트). 누르면 그 프로젝트의 최종 개발물 1단계로 */
export function MyWorkCard({ navigate }: { navigate: ShellBase['navigate'] }) {
  const [data, setData] = useState<MyWork | null>(null)
  useEffect(() => { getMyWork().then(setData).catch(() => setData({ projects: [], labels: {} as MyWork['labels'] })) }, [])
  const open = (project: string, version: string) => navigate({ name: 'workspace', project, version, page: 'develop', focus: '1' })
  const count = data ? data.projects.reduce((n, p) => n + p.items.filter((i) => i.status !== 'done').length + p.reviews.length, 0) : 0
  return (
    <Card aria-labelledby="my-work">
      <CardHeader eyebrow="My work" title="내 작업" titleId="my-work" actions={<span className="text-label font-medium tabular-nums">{count}건</span>} />
      {!data ? <Loading label="내 작업을 읽는 중" lines={2} /> : data.projects.length === 0 ? (
        <p className="px-5 pb-5 text-small text-fg-3">맡은 작업이 없습니다. 개발자가 최종 개발물 '작업 묶음'에서 배정하면 여기와 VS Code 확장에 보입니다.</p>
      ) : (
        <ul className="divide-y divide-line px-2 pb-2 text-small">
          {data.projects.map((p) => [
            ...p.items.map((i) => (
              <li key={`${p.project}:${i.key}`}><button type="button" onClick={() => open(p.project, p.version)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-sunken">
                <span className="text-fg-3">{p.project}</span><span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
                <Badge tone={i.status === 'rejected' ? 'danger' : i.status === 'done' ? 'ok' : 'info'}>{i.status_label}</Badge></button></li>
            )),
            ...p.reviews.map((i) => (
              <li key={`${p.project}:r:${i.key}`}><button type="button" onClick={() => open(p.project, p.version)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-sunken">
                <span className="text-fg-3">{p.project}</span><span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
                <Badge tone="warn">검토 요청 · {i.assignee?.name}</Badge></button></li>
            )),
          ])}
        </ul>
      )}
    </Card>
  )
}

/** 홈 오른쪽 '확장 접속 토큰': VS Code 확장용 개인 접속 토큰 만들기·목록·지우기. 만들 때 한 번만 원문을 보여 준다 (서버에는 해시만) */
export function AccessTokenCard() {
  const [list, setList] = useState<AccessTokenInfo[] | null>(null)
  const [name, setName] = useState('VS Code')
  const [fresh, setFresh] = useState('')
  const [error, setError] = useState('')
  const load = useCallback(() => { listTokens().then(setList).catch((e) => setError((e as Error).message)) }, [])
  useEffect(load, [load])
  const make = async () => {
    setError('')
    try { setFresh((await createToken(name)).token); load() } catch (e) { setError((e as Error).message) }
  }
  return (
    <Card aria-labelledby="tokens">
      <CardHeader eyebrow="VS Code" title="확장 접속 토큰" titleId="tokens" />
      <div className="space-y-2 px-5 pb-5 text-small">
        <p className="text-fg-3">VS Code 확장(TEAM4 개발)의 설정에 서버 주소와 이 토큰을 넣으면 내 작업을 받고 제출합니다.</p>
        <div className="flex gap-2">
          <TextInput dense aria-label="토큰 이름" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" variant="primary" icon={<Key />} onClick={() => void make()}>만들기</Button>
        </div>
        {fresh && (
          <p role="status" className="rounded-md bg-warn-soft px-3 py-2">지금만 보입니다 — 복사해 두세요:
            <code className="mx-1 break-all font-mono">{fresh}</code>
            <Button size="sm" variant="ghost" icon={<Copy />} onClick={() => void navigator.clipboard.writeText(fresh)}>복사</Button></p>
        )}
        {error && <p className="text-danger">{error}</p>}
        {list && list.length > 0 && (
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">{t.name} <code className="text-fg-3">{t.prefix}…</code></span>
                <span className="text-micro text-fg-3">{t.last_used_at ? `사용 ${formatDate(t.last_used_at)}` : '아직 안 씀'}</span>
                <Button size="sm" variant="ghost" icon={<Trash />} aria-label={`${t.name} 지우기`}
                  onClick={() => { if (window.confirm(`'${t.name}' 토큰을 지울까요? 이 토큰을 쓰는 확장은 접속이 끊깁니다.`)) void deleteToken(t.id).then(load) }} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

/** 최종 개발물 오른쪽 'VS Code 확장': 개발자가 이 화면에서 바로 확장을 연결하도록 서버 주소·토큰 만들기와 이 프로젝트의 내 작업.
 * 토큰은 사람 단위라 여기서 만들어도 모든 프로젝트에 쓴다. 원문은 만들 때 한 번만 보여 준다 (서버에는 해시만) */
export function ExtensionCard({ project }: { project: string }) {
  const [tokens, setTokens] = useState<AccessTokenInfo[] | null>(null)
  const [work, setWork] = useState<MyWork['projects'][number] | null>(null)
  const [fresh, setFresh] = useState('')
  const [error, setError] = useState('')
  const server = window.location.origin
  useEffect(() => {
    listTokens().then(setTokens).catch((e) => setError((e as Error).message))
    getMyWork().then((d) => setWork(d.projects.find((p) => p.project === project) ?? null)).catch(() => setWork(null))
  }, [project])
  const make = async () => {
    setError('')
    try {
      const made = await createToken('VS Code')
      setFresh(made.token)
      setTokens((t) => [made.info, ...(t ?? [])])
    } catch (e) { setError((e as Error).message) }
  }
  const remove = (t: AccessTokenInfo) => {
    if (!window.confirm(`'${t.name}' 토큰을 지울까요? 이 토큰을 쓰는 확장은 접속이 끊깁니다.`)) return
    deleteToken(t.id).then(() => setTokens((list) => (list ?? []).filter((x) => x.id !== t.id))).catch((e) => setError((e as Error).message))
  }
  const items = work ? [...work.items.filter((i) => i.status !== 'done'), ...work.reviews] : []
  return (
    <Card aria-labelledby="extension">
      <CardHeader eyebrow="VS Code" title="확장 연결" titleId="extension" />
      <div className="space-y-2 px-5 pb-5 text-small">
        <p className="text-fg-3">VS Code 확장(TEAM4 개발)에서 연결을 누르고 아래 서버 주소와 토큰을 넣으면 맡은 작업을 받고 제출합니다. 토큰은 한 사람에 하나면 모든 프로젝트에 씁니다.</p>
        <p className="flex items-center gap-1"><span className="text-fg-3">서버</span><code className="min-w-0 flex-1 truncate font-mono">{server}</code>
          <Button size="sm" variant="ghost" icon={<Copy />} aria-label="서버 주소 복사" onClick={() => void navigator.clipboard.writeText(server)} /></p>
        <p className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{!tokens ? '' : tokens.length ? `내 토큰 ${tokens.length}개` : '아직 토큰이 없습니다'}</span>
          <Button size="sm" variant={tokens?.length ? 'secondary' : 'primary'} icon={<Key />} onClick={() => void make()}>토큰 만들기</Button>
        </p>
        {!tokens ? <Loading label="토큰을 읽는 중" lines={1} /> : tokens.length > 0 && (
          <ul className="divide-y divide-line">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1">
                <span className="min-w-0 flex-1 truncate">{t.name} <code className="text-fg-3">{t.prefix}…</code></span>
                <span className="text-micro text-fg-3">{t.last_used_at ? `사용 ${formatDate(t.last_used_at)}` : '아직 안 씀'}</span>
                <Button size="sm" variant="ghost" icon={<Trash />} aria-label={`${t.name} 지우기`} onClick={() => remove(t)} />
              </li>
            ))}
          </ul>
        )}
        {fresh && (
          <p role="status" className="rounded-md bg-warn-soft px-3 py-2">지금만 보입니다 — 복사해 두세요:
            <code className="mx-1 break-all font-mono">{fresh}</code>
            <Button size="sm" variant="ghost" icon={<Copy />} onClick={() => void navigator.clipboard.writeText(fresh)}>복사</Button></p>
        )}
        {error && <p className="text-danger">{error}</p>}
        <p className="pt-1 font-medium">이 프로젝트의 내 작업</p>
        {items.length === 0 ? <p className="text-fg-3">맡은 작업·검토 요청이 없습니다.</p> : (
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={`${i.key}:${i.status}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                {work!.reviews.includes(i) ? <Badge tone="warn">검토 요청 · {i.assignee?.name}</Badge>
                  : <Badge tone={i.status === 'rejected' ? 'danger' : 'info'}>{i.status_label}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
