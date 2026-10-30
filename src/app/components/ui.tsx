import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { forwardRef } from 'react'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------ 버튼 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-85',
  secondary: 'bg-card text-fg border border-line-strong hover:border-control hover:bg-sunken',
  ghost: 'text-fg-2 hover:bg-sunken hover:text-fg',
  danger: 'text-danger border border-line-strong bg-card hover:bg-danger-soft hover:border-danger',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: ReactNode
}>(function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm font-semibold whitespace-nowrap',
        'transition-[background-color,border-color,opacity,color] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'min-h-8 px-2.5 text-small' : 'min-h-10 px-3.5 text-label',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon && <span aria-hidden="true" className="inline-flex [&>svg]:size-4">{icon}</span>}
      {children}
    </button>
  )
})

/** 아이콘만 있는 버튼: label이 접근 가능한 이름이 된다 */
export function IconButton({ label, icon, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-2',
        'transition-colors duration-150 hover:bg-sunken hover:text-fg disabled:opacity-45',
        '[&>svg]:size-[18px]',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
}

/* ------------------------------------------------------------ 카드 */
export function Card({ children, className, as: Tag = 'section', ...rest }: HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'div' | 'article'
}) {
  return (
    <Tag className={cx('rounded-lg border border-line bg-card', className)} {...rest}>
      {children}
    </Tag>
  )
}

export function CardHeader({ eyebrow, title, titleId, actions, children, level = 2 }: {
  eyebrow?: string
  title: ReactNode
  titleId?: string
  actions?: ReactNode
  children?: ReactNode
  level?: 1 | 2
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <Heading id={titleId} className={cx('font-medium text-balance', level === 1 ? 'text-title' : 'text-subtitle')}>{title}</Heading>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/* ------------------------------------------------------------ 배지 */
export type Tone = 'neutral' | 'danger' | 'warn' | 'ok' | 'info'

const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-fg-2 border-line',
  danger: 'bg-danger-soft text-danger border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  ok: 'bg-ok-soft text-ok border-transparent',
  info: 'bg-info-soft text-info border-transparent',
}

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cx(
      'inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-micro font-medium whitespace-nowrap tabular-nums',
      '[&>svg]:size-3',
      TONE[tone],
      className,
    )}>
      {icon}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------ 입력 */
const FIELD = cx(
  'w-full rounded-md border border-control bg-card px-3 text-body text-fg placeholder:text-fg-3',
  'transition-[border-color,box-shadow] duration-150',
  'hover:border-fg-3 focus-visible:border-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/15',
  'aria-[invalid=true]:border-danger',
)

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { dense?: boolean }>(
  function TextInput({ className, dense, ...rest }, ref) {
    return <input ref={ref} className={cx(FIELD, dense ? 'min-h-8 py-1 text-label' : 'min-h-11 py-2', className)} {...rest} />
  },
)

export function TextArea({ className, dense, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { dense?: boolean }) {
  return (
    <textarea
      rows={dense ? 1 : 2}
      className={cx(FIELD, 'autosize resize-y py-2 leading-normal', dense ? 'min-h-8 py-1 text-label' : 'min-h-11', className)}
      {...rest}
    />
  )
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-label font-medium text-fg">
      <span>{children}</span>
      {hint && <span className="text-small font-normal text-fg-3">{hint}</span>}
    </label>
  )
}

export function Checkbox({ checked, onChange, label, disabled, className, describedBy }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  disabled?: boolean
  className?: string
  describedBy?: string
}) {
  return (
    <label className={cx('inline-flex min-h-8 cursor-pointer items-center gap-2 text-label select-none', disabled && 'cursor-not-allowed opacity-45', className)}>
      <input
        type="checkbox"
        className="size-4 shrink-0 cursor-pointer accent-[var(--fg)]"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

/* ------------------------------------------------------------ 선택 버튼 묶음 */
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex flex-wrap gap-0.5 rounded-md bg-sunken p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-small font-medium transition-colors duration-150',
              active ? 'bg-card text-fg ring-1 ring-line' : 'text-fg-3 hover:text-fg',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="tabular-nums text-fg-3">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------ 상태 */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-5 py-10">
      <p className="text-body font-medium">{title}</p>
      {children && <p className="max-w-prose text-label text-fg-3">{children}</p>}
      {action}
    </div>
  )
}

/** 1초 넘게 걸릴 수 있는 로딩: 자리를 차지하는 회색 막대 */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx('space-y-2.5 px-5 py-4', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded-sm bg-sunken" style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  )
}

export function Loading({ label, lines }: { label: string; lines?: number }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <Skeleton lines={lines} />
    </div>
  )
}

export function ErrorNote({ message, onRetry, hint }: { message: string; onRetry?: () => void; hint?: string }) {
  return (
    <div role="alert" className="m-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-label text-danger">
      <p className="font-medium">{message}</p>
      {hint && <p className="mt-1 text-fg-2">{hint}</p>}
      {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>다시 시도</Button>}
    </div>
  )
}

/** 숫자 형식: 1,234 */
export const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 큰 수 줄임: 1.2만, 34.5만 */
export function compact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}만`
  return fmt(n)
}
