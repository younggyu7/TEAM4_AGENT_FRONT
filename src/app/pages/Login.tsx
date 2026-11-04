import { Eye, EyeSlash, SignIn, TreeStructure, UserPlus } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { getRoles, signup } from '../../api'
import { SchemaArt } from '../components/PageHeader'
import { Button, Checkbox, Label, TextInput } from '../components/ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SLACK_ID = /^[UW][A-Z0-9]{6,20}$/   // 백엔드 services/users.py SLACK_ID와 같은 규칙
const SELECT = 'min-h-11 w-full rounded-md border border-control bg-card px-3 text-body text-fg focus-visible:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/15'

/** 로그인·회원가입. 왼쪽은 Runway식 검은 구획(큰 제목 + 장식), 오른쪽은 입력. 좁은 화면에서는 위아래로 쌓인다.
 * 가입하면 '승인 대기'가 되고, 관리자가 역할(기획·데이터 파트원·파트장, 팀장)을 정해 승인하면 로그인된다.
 * 처음 가입한 사람은 관리자·팀장이 된다. */
export function Login({ onSignIn }: { onSignIn: (email: string, password: string, remember: boolean) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const ids = { email: useId(), password: useId(), emailErr: useId(), passwordErr: useId() }

  const emailError = !email.trim() ? '이메일을 입력하세요.' : !EMAIL.test(email.trim()) ? '이메일 형식이 아닙니다. 예: name@company.com' : ''
  const passwordError = !password ? '비밀번호를 입력하세요.' : ''
  const showEmailError = touched.email && emailError
  const showPasswordError = touched.password && passwordError

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    // 틀린 칸이 있으면 첫 번째로 포커스를 옮긴다
    if (emailError) return emailRef.current?.focus()
    if (passwordError) return passwordRef.current?.focus()
    setSubmitting(true)
    setError('')
    try {
      await onSignIn(email.trim(), password, remember)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-canvas text-fg lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* 검은 구획 */}
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-hero px-6 py-8 text-on-hero sm:px-10 lg:px-14 lg:py-12">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-md bg-on-hero text-hero">
            <TreeStructure size={18} weight="bold" />
          </span>
          <span className="text-label font-semibold">Req Agent</span>
        </div>

        <div className="relative z-10 max-w-xl">
          <p className="eyebrow !text-hero-muted">Requirements → Design</p>
          <h1 className="mt-4 text-headline font-normal text-balance sm:text-display">
            고객 요구사항을<br />검토 가능한 설계 초안으로.
          </h1>
          <p className="mt-5 max-w-md text-body text-hero-muted">
            문서에서 뽑은 기능 명세서와 ERD를 확인하고, 애매한 부분을 결정해 최종본으로 확정합니다.
          </p>
        </div>

        <SchemaArt className="pointer-events-none absolute top-6 -right-16 hidden w-[440px] text-on-hero opacity-30 lg:block" />

        <ol className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hero-line pt-6 sm:grid-cols-4">
          {['문서 분석', '기능 명세', '데이터 모델', '검토·확정'].map((s, i) => (
            <li key={s}>
              <span className="eyebrow block !text-hero-muted tabular-nums">0{i + 1}</span>
              <span className="mt-1 block text-label">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 입력 */}
      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {mode === 'signup' ? (
            <SignupForm
              onCancel={() => { setMode('login'); setError('') }}
              onDone={(mail, pending) => {
                setMode('login')
                setEmail(mail)
                setPassword('')
                setNotice(pending ? '가입했습니다. 관리자가 역할을 정해 승인하면 로그인할 수 있습니다.' : '가입했습니다. 첫 가입자라 관리자·팀장입니다. 로그인하세요.')
              }}
            />
          ) : (<>
          <h2 className="text-title font-medium">로그인</h2>
          <p className="mt-2 text-label text-fg-3">설계 검토 계정으로 들어갑니다.</p>
          {notice && <p role="status" className="mt-4 rounded-md bg-ok-soft px-3 py-2 text-small text-ok">{notice}</p>}

          <form noValidate onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor={ids.email}>이메일</Label>
              <TextInput
                ref={emailRef}
                id={ids.email}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                aria-invalid={Boolean(showEmailError)}
                aria-describedby={showEmailError ? ids.emailErr : undefined}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                placeholder="name@company.com"
              />
              {showEmailError && <p id={ids.emailErr} role="alert" className="mt-1.5 text-small text-danger">{emailError}</p>}
            </div>

            <div>
              <Label htmlFor={ids.password}>비밀번호</Label>
              <div className="relative">
                <TextInput
                  ref={passwordRef}
                  id={ids.password}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  className="pr-11"
                  aria-invalid={Boolean(showPasswordError)}
                  aria-describedby={showPasswordError ? ids.passwordErr : undefined}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={show}
                  className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-md text-fg-3 hover:text-fg"
                >
                  {show ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {showPasswordError && <p id={ids.passwordErr} role="alert" className="mt-1.5 text-small text-danger">{passwordError}</p>}
            </div>

            <Checkbox checked={remember} onChange={setRemember} label="이 브라우저에서 로그인 유지" />

            {error && <p role="alert" className="text-small text-danger">{error}</p>}
            <Button type="submit" variant="primary" className="w-full !min-h-11" icon={<SignIn />} disabled={submitting}>
              {submitting ? '들어가는 중…' : '로그인'}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5 text-small text-fg-3">
            <span>계정이 없나요?</span>
            <Button size="sm" icon={<UserPlus />} onClick={() => { setMode('signup'); setError(''); setNotice('') }}>회원가입</Button>
          </div>
          </>)}
        </div>
      </main>
    </div>
  )
}

/** 회원가입: 이름·이메일·비밀번호와 희망 역할 (관리자가 승인할 때 참고, 바로 권한을 주지 않음), Slack 멤버 ID (프로젝트 채널 초대·멘션) */
function SignupForm({ onCancel, onDone }: { onCancel: () => void; onDone: (email: string, pending: boolean) => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: '', slack: '' })
  const [roles, setRoles] = useState<{ id: string; label: string }[]>([])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const id = useId()
  useEffect(() => { getRoles().then(setRoles).catch(() => setRoles([])) }, [])
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const problem = !form.name.trim() ? '이름을 입력하세요.'
    : !EMAIL.test(form.email.trim()) ? '이메일 형식이 아닙니다.'
    : form.password.length < 8 ? '비밀번호는 8자 이상이어야 합니다.'
    : form.password !== form.confirm ? '비밀번호 확인이 맞지 않습니다.'
    : form.slack.trim() && !SLACK_ID.test(form.slack.trim().toUpperCase()) ? "Slack 멤버 ID는 U로 시작하는 영문·숫자입니다 (Slack 프로필 → ⋮ → '멤버 ID 복사')." : ''
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem) return setError(problem)
    setSending(true)
    setError('')
    try {
      const r = await signup({ email: form.email.trim(), name: form.name.trim(), password: form.password, requested_role: form.role, slack_id: form.slack.trim() })
      onDone(form.email.trim(), r.pending)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <h2 className="text-title font-medium">회원가입</h2>
      <p className="mt-2 text-label text-fg-3">가입하면 관리자가 역할을 정해 승인한 뒤 쓸 수 있습니다.</p>
      <form noValidate onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <Label htmlFor={`${id}-name`}>이름</Label>
          <TextInput id={`${id}-name`} autoComplete="name" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <Label htmlFor={`${id}-email`}>이메일</Label>
          <TextInput id={`${id}-email`} type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={form.email} onChange={set('email')} placeholder="name@company.com" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${id}-pw`} hint="8자 이상">비밀번호</Label>
            <TextInput id={`${id}-pw`} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          </div>
          <div>
            <Label htmlFor={`${id}-pw2`}>비밀번호 확인</Label>
            <TextInput id={`${id}-pw2`} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </div>
        </div>
        <div>
          <Label htmlFor={`${id}-role`} hint="관리자 참고용">희망 역할</Label>
          <select id={`${id}-role`} className={SELECT} value={form.role} onChange={set('role')}>
            <option value="">선택 안 함</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor={`${id}-slack`} hint="선택 · 프로젝트 Slack 채널 초대·알림 멘션">Slack 멤버 ID</Label>
          <TextInput id={`${id}-slack`} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono"
            value={form.slack} onChange={set('slack')} placeholder="U0123ABCD" maxLength={21} />
          <p className="mt-1 text-micro text-fg-3">Slack에서 내 프로필 → ⋮(더보기) → '멤버 ID 복사'. 나중에 관리자가 넣을 수도 있습니다.</p>
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={onCancel} className="!min-h-11">로그인으로</Button>
          <Button type="submit" variant="primary" className="!min-h-11 flex-1" icon={<UserPlus />} disabled={sending}>
            {sending ? '가입하는 중…' : '가입하기'}
          </Button>
        </div>
      </form>
    </>
  )
}
