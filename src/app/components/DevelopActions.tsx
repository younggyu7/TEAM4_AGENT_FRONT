import { Code, GitBranch, X } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { checkRemote, getDevelopPlan, getGitSettings, getLlmOptions, getThemes, saveGitSettings, type DevelopPlan, type GitSettings, type LlmOptions, type ThemeChoice } from '../../api'
import { formatDate } from '../../labels'
import type { VersionRecord } from '../../types'
import { startDevelopJob, startGitJob } from '../lib/jobs'
import { estimateUsd, usd } from '../lib/pricing'
import { can, NEEDS, type User } from '../lib/session'
import { Badge, Button, cx, IconButton, Label, Loading, TextInput, fmt } from './ui'

/**
 * 산출물 보기 제목 옆 (최종 승인한 최종본): '최종 개발하기'. 개발자만 누른다.
 * 먼저 예상(화면·파일 수, AI 업무 로직 예상 비용)을 보여 주고 확인받는다. 기본은 LLM 없음.
 * 시작하면 최종 개발물 화면 1단계로 옮긴다 (onStarted). 원격 올리기는 최종 개발물 화면 3단계와 오른쪽 '코드 저장소'에 있다.
 */
export function DevelopActions({ project, record, user, onFinished, onStarted }: {
  project: string
  record: VersionRecord
  user: User
  onFinished: () => void
  onStarted?: () => void
}) {
  const allowed = can(user, 'develop')
  const [open, setOpen] = useState(false)
  const developed = record.develop
  return (
    <>
      <Button variant={developed ? 'secondary' : 'ok'} icon={<Code />} disabled={!allowed} onClick={() => setOpen(true)}
        title={allowed ? '승인한 최종본의 개발 스펙으로 서비스 코드를 만듭니다' : NEEDS.develop}>
        {developed ? '다시 개발하기' : '최종 개발하기'}
      </Button>
      {developed && (
        <span className="text-small font-normal text-fg-3">
          개발 {formatDate(developed.at)} · {developed.by.name}{developed.build ? ' · 업무 기능 AI' : ''}
        </span>
      )}
      {open && <DevelopDialog project={project} version={record.design_version} onClose={() => setOpen(false)} onFinished={onFinished} onStarted={onStarted} />}
    </>
  )
}

/** 대화 상자 (wide: 차이 보기처럼 넓게) */
export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog ref={ref} aria-labelledby={id} onClose={onClose}
      className={cx('m-auto rounded-lg border border-line bg-card p-0 text-fg backdrop:bg-black/40', wide ? 'w-[min(1100px,96vw)]' : 'w-[min(560px,92vw)]')}>
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id={id} className="text-subtitle font-medium">{title}</h2>
        <IconButton label="닫기" icon={<X />} onClick={() => ref.current?.close()} />
      </div>
      <div className="space-y-4 px-5 py-4 text-label">{children}</div>
    </dialog>
  )
}

function DevelopDialog({ project, version, onClose, onFinished, onStarted }: { project: string; version: string; onClose: () => void; onFinished: () => void; onStarted?: () => void }) {
  const [plan, setPlan] = useState<DevelopPlan | null>(null)
  const [options, setOptions] = useState<LlmOptions | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'build' | 'logic' | 'none'>('build')
  const [themes, setThemes] = useState<ThemeChoice[]>([])
  const [theme, setTheme] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('medium')
  const [sending, setSending] = useState(false)
  useEffect(() => { getDevelopPlan(project, version).then(setPlan).catch((e) => setError((e as Error).message)) }, [project, version])
  useEffect(() => { getThemes().then((t) => { setThemes(t.themes); setTheme((x) => x || t.default) }).catch(() => setThemes([])) }, [])
  useEffect(() => {
    getLlmOptions().then((o) => {
      setOptions(o)
      setModel((m) => m || o.models.find((x) => x.id === 'claude-haiku-5-5')?.id || o.default_model || o.models[0]?.id || '')
    }).catch(() => setOptions({ models: [], efforts: ['low', 'medium', 'high'], default_model: '', default_effort: 'medium' }))
  }, [])
  const picked = options?.models.find((m) => m.id === model)
  const start = async () => {
    setSending(true)
    try {
      const ai = mode === 'none' ? {} : { model, effort: picked?.effort === false ? '' : effort }
      await startDevelopJob(project, version, { build: mode === 'build', logic: mode === 'logic', ...ai, ...(mode === 'build' && theme ? { theme } : {}) }, onFinished)
      onClose()
      onStarted?.()
    } catch (e) {
      setError((e as Error).message)
      setSending(false)
    }
  }
  const build = mode === 'build'
  const est = plan?.build
  const output = est ? est.output_tokens[picked?.effort === false ? 'medium' : effort] ?? est.output_tokens.medium : 0
  const usdValue = est && build ? estimateUsd(model, est.input_tokens, output) : undefined
  const logicUsd = plan && mode === 'logic' ? estimateUsd(model, plan.logic.input_tokens, plan.logic.output_tokens) : undefined
  const ids = { model: useId(), effort: useId() }
  return (
    <Modal title={`최종본 v${version} 최종 개발하기`} onClose={onClose}>
      {!plan && !error && <Loading label="예상을 계산하는 중" lines={3} />}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {plan && (
        <>
          <dl className="grid grid-cols-3 gap-2 rounded-md bg-sunken p-3 text-center">
            <div><dt className="text-micro text-fg-3">화면</dt><dd className="text-subtitle font-medium tabular-nums">{fmt(plan.screens)}</dd></div>
            <div><dt className="text-micro text-fg-3">메뉴</dt><dd className="text-subtitle font-medium tabular-nums">{fmt(plan.menus)}</dd></div>
            <div><dt className="text-micro text-fg-3">파일</dt><dd className="text-subtitle font-medium tabular-nums">{fmt(plan.files)}</dd></div>
          </dl>
          <p className="text-small text-fg-2">기술 스택: <strong>{plan.stack || '미정'}</strong>{' '}
            {plan.backend ? <Badge tone="ok">화면·서버·DB</Badge> : <Badge tone="warn">화면·DB만</Badge>}</p>
          {plan.blocked && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger">{plan.blocked}</p>}
          {plan.warning && !plan.blocked && <p className="rounded-md bg-warn-soft px-3 py-2 text-small text-warn">{plan.warning}</p>}
          <p className="text-small text-fg-3">앱 틀(로그인 admin·user, 포털 화면, 등록·조회·수정·삭제, DB·예시 데이터, Docker 실행 파일)은 코드가 만듭니다 (토큰 0). 다 만들면 Docker로 켜서 로그인하고 모든 조회 API를 불러 자동으로 확인합니다.</p>
          <div className="space-y-2 rounded-md border border-line px-3 py-3">
            <fieldset>
              <legend className="mb-1.5 text-small font-medium">AI 사용</legend>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {([['build', '기능 전체 AI', '기능마다 서버 API·화면을 AI가 스펙대로 짬 (정확도 높음)'],
                  ['logic', '빈 로직만 AI', '코드 틀은 그대로, 업무 로직 빈칸만 AI가 채움 (더 쌈)'],
                  ['none', 'AI 안 씀', '코드 틀만 (토큰 0). 업무 로직 빈칸은 비워 둠']] as const).map(([id, label, note]) => (
                  <label key={id} className={cx('flex cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-2 text-small',
                    mode === id ? 'border-fg bg-sunken' : 'border-line hover:border-control')}>
                    <span className="flex items-center gap-1.5 font-medium">
                      <input type="radio" name="ai-mode" checked={mode === id} onChange={() => setMode(id)} className="accent-current" />{label}
                    </span>
                    <span className="text-micro text-fg-3">{note}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {mode !== 'none' && (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={ids.model}>모델</Label>
                    <select id={ids.model} value={model} onChange={(e) => setModel(e.target.value)}
                      className="min-h-9 w-full rounded-md border border-control bg-card px-2 text-label text-fg">
                      {(options?.models ?? []).map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor={ids.effort}>effort (생각 정도)</Label>
                    <select id={ids.effort} value={effort} onChange={(e) => setEffort(e.target.value)} disabled={picked?.effort === false}
                      className="min-h-9 w-full rounded-md border border-control bg-card px-2 text-label text-fg disabled:opacity-60">
                      {(options?.efforts ?? ['low', 'medium', 'high']).map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </div>
                </div>
                {mode === 'logic' && (
                  <p className="text-small text-fg-2">
                    {plan.logic.functions > 0
                      ? <>AI가 채울 기능 <strong>{plan.logic.functions}개</strong>{plan.logic.cached ? ` · 이미 채운 기능 ${plan.logic.cached}개(0원)` : ''} · 예상 입력 약 {fmt(plan.logic.input_tokens)} · 출력 약 {fmt(plan.logic.output_tokens)} 토큰 ·{' '}
                          <strong>{logicUsd === undefined ? '단가 미등록 모델' : `약 ${usd(logicUsd)}`}</strong></>
                      : '채울 업무 로직이 없습니다 (토큰 0).'}
                  </p>
                )}
                {build && est && (
                  <p className="text-small text-fg-2">
                    {est.functions > 0
                      ? <>AI가 구현할 기능 <strong>{est.functions}개</strong>{est.cached ? ` · 이미 만든 기능 ${est.cached}개(0원)` : ''} · 예상 입력 약 {fmt(est.input_tokens)} · 출력 약 {fmt(output)} 토큰 ·{' '}
                          <strong>{usdValue === undefined ? '단가 미등록 모델' : `약 ${usd(usdValue)}`}</strong></>
                      : '새로 구현할 기능이 없습니다 (같은 스펙으로 만든 결과를 그대로 씀, 0원).'}
                  </p>
                )}
                {build && themes.length > 0 && <ThemePicker themes={themes} value={theme} onChange={setTheme} />}
                {build && est?.scratch && (
                  <p className="rounded-md bg-warn-soft px-2.5 py-1.5 text-small text-warn">
                    개발 틀이 없는 {est.scratch.layers.map((l) => (l === 'backend' ? '서버' : '화면')).join('·')}을(를) AI가 뼈대부터 만듭니다 (위 예상에 포함: 뼈대 {est.scratch.skeletons}개 + 기능 파일 {est.scratch.functions}개).
                    이미지가 빌드되지 않으면 오류를 붙여 한 번 다시 묻습니다. 결과가 실행마다 다를 수 있습니다.
                  </p>
                )}
                {!plan.backend && !est?.scratch && plan.untemplated.length > 0 && (
                  <p className="text-small text-warn">AI 구현을 켜야 틀이 없는 층을 AI가 만듭니다 (끄면 그 층은 만들지 않음).</p>
                )}
                <p className="text-micro text-fg-3">예상치입니다: 기능당 출력은 실측 평균(Haiku 5.5 · medium, 기능 42개)이고 low·high 배율과 다른 모델은 실측 전입니다. 출력의 대부분은 생각 토큰이라 effort가 비용을 크게 바꿉니다. 검사·컴파일을 통과하지 못한 기능은 코드 틀로 둡니다.</p>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>취소</Button>
            <Button variant="ok" icon={<Code />} disabled={sending || Boolean(plan.blocked) || (mode !== 'none' && !model)} onClick={() => void start()}
              title={plan.blocked || (mode !== 'none' && !model ? 'AI에 쓸 모델을 먼저 고르세요' : undefined)}>{sending ? '시작하는 중…' : '개발 시작'}</Button>
          </div>
        </>
      )}
    </Modal>
  )
}

/** 개발한 앱의 화면 스타일 (최대 9개): 작은 미리보기(메뉴·강조 버튼·배경)로 고른다. 색 토큰만 바꾸므로 AI가 짠 화면도 같이 바뀐다 */
function ThemePicker({ themes, value, onChange }: { themes: ThemeChoice[]; value: string; onChange: (id: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-small font-medium">앱 화면 스타일</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {themes.slice(0, 9).map((t) => (
          <button key={t.id} type="button" aria-pressed={value === t.id} title={t.note} onClick={() => onChange(t.id)}
            className={cx('overflow-hidden rounded-md border text-left', value === t.id ? 'border-fg ring-2 ring-fg/20' : 'border-line hover:border-control')}>
            <span aria-hidden="true" className="flex h-12" style={{ background: t.preview.bg }}>
              <span className="flex w-1/3 flex-col gap-1 p-1.5" style={{ background: t.preview.side }}>
                <span className="h-1.5 w-3/4 rounded-sm" style={{ background: t.preview.mark }} />
                <span className="h-1 w-full rounded-sm opacity-60" style={{ background: t.preview.side_ink }} />
                <span className="h-1 w-2/3 rounded-sm opacity-60" style={{ background: t.preview.side_ink }} />
              </span>
              <span className="flex flex-1 flex-col justify-between p-1.5">
                <span className="h-1.5 w-2/3 rounded-sm" style={{ background: t.preview.cover, opacity: 0.35 }} />
                <span className="h-2.5 w-8 rounded-sm" style={{ background: t.preview.accent }} />
              </span>
            </span>
            <span className="block truncate px-1.5 py-1 text-micro font-medium">{t.name}</span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** 최종 개발물 3단계 '원격 설정 · 올리기': 원격 하나 (화면·백엔드·DB 한 저장소). 토큰은 서버에 암호화, 다시 보이지 않음 */
export function GitDialog({ project, version, onClose, onFinished }: { project: string; version: string; onClose: () => void; onFinished: () => void }) {
  const [saved, setSaved] = useState<GitSettings | null>(null)
  const [form, setForm] = useState({ url: '', branch: '', token: '' })
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const id = useId()
  useEffect(() => {
    getGitSettings(project).then((g) => {
      setSaved(g)
      setForm({ url: g.url, branch: g.branch, token: '' })
      setEditing(!g.url)   // 처음 올릴 때는 설정부터
    }).catch((e) => setError((e as Error).message))
  }, [project])
  const set = (k: 'url' | 'branch' | 'token') => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    setSending(true)
    setError('')
    try {
      setSaved(await saveGitSettings(project, form))
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }
  const check = async () => {
    setSending(true)
    setError('')
    try { setSaved(await checkRemote(project)) } catch (e) { setError((e as Error).message) } finally { setSending(false) }
  }
  const push = async () => {
    setSending(true)
    try {
      await startGitJob(project, version, onFinished)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setSending(false)
    }
  }
  return (
    <Modal title="원격 저장소에 올리기" onClose={onClose}>
      {!saved && !error && <Loading label="원격 설정을 읽는 중" lines={3} />}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {saved && editing && (
        <>
          <p className="text-small text-fg-3">이 프로젝트의 원격 저장소 하나를 적습니다 (화면·백엔드·DB를 한 저장소에). 브랜치를 비우면 <code>main</code>. 토큰은 서버에 암호화해 두고 다시 보여 주지 않습니다 (비우면 저장된 토큰 그대로).</p>
          <div><Label htmlFor={`${id}-u`}>주소</Label>
            <TextInput dense id={`${id}-u`} placeholder="https://github.com/팀/저장소.git" value={form.url} onChange={set('url')} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label htmlFor={`${id}-b`}>원격 브랜치</Label>
              <TextInput dense id={`${id}-b`} placeholder="main" value={form.branch} onChange={set('branch')} /></div>
            <div><Label htmlFor={`${id}-t`} hint={saved.has_token ? '저장됨 ****' : '쓰기 권한'}>토큰</Label>
              <TextInput dense id={`${id}-t`} type="password" autoComplete="off" value={form.token} onChange={set('token')} /></div>
          </div>
          <div className="flex justify-end gap-2">
            {saved.url && <Button variant="ghost" onClick={() => setEditing(false)}>취소</Button>}
            <Button variant="primary" disabled={sending || !form.url.trim()} onClick={() => void save()}>저장</Button>
          </div>
        </>
      )}
      {saved && !editing && (
        <>
          <p className="text-small"><strong>원격</strong>: {saved.url} · {saved.branch} · 토큰 {saved.has_token ? '저장됨' : '없음 (서버 공통 토큰)'}</p>
          <p className="text-small">
            {saved.ahead === null ? <Badge tone="neutral">원격 확인 전</Badge>
              : saved.behind ? <Badge tone="danger">원격에 서버에 없는 커밋 {saved.behind}개 — 올리지 않습니다</Badge>
              : <Badge tone={saved.ahead ? 'warn' : 'ok'}>{saved.ahead ? `원격보다 ${saved.ahead}개 앞섬` : '원격과 같음'}</Badge>}
            {saved.checked_at && <span className="ml-2 text-micro text-fg-3">확인 {formatDate(saved.checked_at)}</span>}
            {saved.error && <span className="block text-micro text-danger">{saved.error}</span>}
          </p>
          <p className="text-small text-fg-3">서버 코드 저장소의 main과 최종본 태그(final-v…)를 올립니다. 원격에 서버에 없는 커밋이 있으면 덮어쓰지 않고 멈춥니다 (서버 밖에서 정리). 빌드 결과·node_modules·미리보기는 커밋되지 않습니다.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(true)}>원격 설정 바꾸기</Button>
            <Button variant="ghost" disabled={sending} onClick={() => void check()}>원격 확인</Button>
            <Button variant="ok" icon={<GitBranch />} disabled={sending || Boolean(saved.behind)} onClick={() => void push()}>{sending ? '진행 중…' : '올리기'}</Button>
          </div>
        </>
      )}
    </Modal>
  )
}
