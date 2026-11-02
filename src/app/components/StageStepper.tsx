import { Check, Files } from '@phosphor-icons/react'
import { formatDate } from '../../labels'
import { isDocPage, type Page, type StagePage } from '../lib/route'
import { cx } from './ui'

const STEPS: { id: StagePage; label: string; hint: string }[] = [
  { id: 'spec', label: '기능 명세', hint: '고치고 애매한 부분 확인' },
  { id: 'erd', label: 'ERD', hint: '테이블 고치고 새 버전 저장' },
  { id: 'final', label: '최종 산출물', hint: 'ERD 관계도·DDL·보고서' },
]

/** 단계의 버전 표시. 아직 그 단계 버전이 없으면 앞 단계 번호를 그대로 쓰고 있다는 뜻으로 '(… 안의 초안)'처럼 적는다 */
function versionLabel(stage: StagePage, t: Record<StagePage, string>): string {
  const depthOf = (v: string) => v.split('.').length - 1
  const want = stage === 'spec' ? 0 : stage === 'erd' ? 1 : 2
  const v = t[stage]
  if (depthOf(v) === want) return `v${v}`
  return stage === 'erd' ? `v${v} 안의 초안` : `v${v} 미리 보기`
}

/** 이 버전의 진행 단계. 앞 단계를 확정해야 다음 단계가 '진행 가능'으로 바뀌지만, 보기는 언제든 할 수 있다.
 * 맨 끝 '산출물 보기'는 단계가 아니라 지금 버전의 산출물(판단 기록·이슈·추적 …)을 읽기만 하는 화면이다. */
export function StageStepper({ page, version, targets, finalized, onGo }: {
  page: Page
  version: string                      // 산출물 보기가 여는 버전 (지금 보는 버전)
  targets: Record<StagePage, string>   // 각 단계에서 열 버전 (v2 / v2.1 / v2.1.1)
  finalized: { spec?: string; erd?: string; final?: string }
  onGo: (page: Page) => void
}) {
  const done = (id: StagePage) => Boolean(finalized[id])
  const ready = (i: number) => i === 0 || done(STEPS[i - 1].id)
  return (
    <nav aria-label="진행 단계" className="mb-4">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => {
          const current = s.id === page
          const isDone = done(s.id)
          const status = isDone
            ? `${s.id === 'final' ? '최종 확정' : '확정'} ${formatDate(finalized[s.id])}`
            : s.id === 'final'
              ? (ready(i) ? '최종 확정 전' : '앞 단계 확정 전 (미리 보기)')
              : ready(i) ? '진행 중' : '앞 단계 확정 전'
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onGo(s.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
                  current ? 'border-fg bg-card' : 'border-line bg-card/60 hover:border-control hover:bg-card',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-small font-semibold tabular-nums',
                    isDone ? 'bg-ok text-card' : current ? 'bg-primary text-on-primary' : 'bg-sunken text-fg-3',
                  )}
                >
                  {isDone ? <Check size={14} weight="bold" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cx('block text-label', current ? 'font-semibold' : 'font-medium text-fg-2')}>
                    {s.label} <span className="font-normal text-fg-3 tabular-nums">{versionLabel(s.id, targets)}</span>
                  </span>
                  <span className={cx('block truncate text-micro', isDone ? 'text-ok' : 'text-fg-3')}>{status}</span>
                </span>
                <span className="sr-only">{s.hint}</span>
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            aria-current={isDocPage(page) ? 'page' : undefined}
            onClick={() => onGo('overview')}
            className={cx(
              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
              isDocPage(page) ? 'border-fg bg-card' : 'border-line bg-card/60 hover:border-control hover:bg-card',
            )}
          >
            {/* 최종 확정을 하면 최종 산출물처럼 초록 체크 (볼 산출물이 다 만들어졌다는 뜻) */}
            <span aria-hidden="true" className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-md',
              finalized.final ? 'bg-ok text-card' : isDocPage(page) ? 'bg-primary text-on-primary' : 'bg-sunken text-fg-3')}>
              {finalized.final ? <Check size={14} weight="bold" /> : <Files size={14} weight="bold" />}
            </span>
            <span className="min-w-0">
              <span className={cx('block text-label', isDocPage(page) ? 'font-semibold' : 'font-medium text-fg-2')}>
                산출물 보기 <span className="font-normal text-fg-3 tabular-nums">v{version}</span>
              </span>
              <span className={cx('block truncate text-micro', finalized.final ? 'text-ok' : 'text-fg-3')}>
                {finalized.final ? '최종본 산출물 준비됨 · 판단 기록·이슈·추적' : '판단 기록·이슈·추적 (보기만)'}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </nav>
  )
}
