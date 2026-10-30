import { Eye, EyeSlash, SignIn, TreeStructure } from '@phosphor-icons/react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { SchemaArt } from '../components/PageHeader'
import { Button, Checkbox, Label, TextInput } from '../components/ui'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 로그인. 왼쪽은 Runway식 검은 구획(큰 제목 + 장식), 오른쪽은 입력. 좁은 화면에서는 위아래로 쌓인다. */
export function Login({ onSignIn }: { onSignIn: (email: string, remember: boolean) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState({ email: false, password: false })
  const [submitting, setSubmitting] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const ids = { email: useId(), password: useId(), emailErr: useId(), passwordErr: useId() }

  const emailError = !email.trim() ? '이메일을 입력하세요.' : !EMAIL.test(email.trim()) ? '이메일 형식이 아닙니다. 예: name@company.com' : ''
  const passwordError = !password ? '비밀번호를 입력하세요.' : ''
  const showEmailError = touched.email && emailError
  const showPasswordError = touched.password && passwordError

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    // 틀린 칸이 있으면 첫 번째로 포커스를 옮긴다
    if (emailError) return emailRef.current?.focus()
    if (passwordError) return passwordRef.current?.focus()
    setSubmitting(true)
    window.setTimeout(() => onSignIn(email.trim(), remember), 250)
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
          <h2 className="text-title font-medium">로그인</h2>
          <p className="mt-2 text-label text-fg-3">설계 검토 계정으로 들어갑니다.</p>

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

            <Button type="submit" variant="primary" className="w-full !min-h-11" icon={<SignIn />} disabled={submitting}>
              {submitting ? '들어가는 중…' : '로그인'}
            </Button>
          </form>

          <p className="mt-8 rounded-md border border-line bg-card px-3 py-2.5 text-small text-fg-3">
            개발용 로그인입니다. 백엔드 인증을 붙이기 전이라 어떤 이메일로도 들어가며, 비밀번호는 저장하지 않습니다.
          </p>
        </div>
      </main>
    </div>
  )
}
