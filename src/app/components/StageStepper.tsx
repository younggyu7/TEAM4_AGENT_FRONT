import { Check, Files, Play } from '@phosphor-icons/react'
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
export function StageStepper({ page, version, targets, finalized, decision, onGo, developed }: {
  page: Page
  version: string                      // 산출물 보기가 여는 버전 (지금 보는 버전)
  targets: Record<StagePage, string>   // 각 단계에서 열 버전 (v2 / v2.1 / v2.1.1)
  finalized: { spec?: string; erd?: string; final?: string }
  /** 최종본에 대한 팀장의 마지막 결정 */
  decision?: { decision: 'approve' | 'changes'; at: string }
  onGo: (page: Page) => void
  /** 마지막 칸 '최종 개발물 미리보기': 팀장이 승인하면(= 최종 개발하기를 누를 수 있으면) 열린다. at은 개발한 때 */
  developed?: { at?: string }
}) {
  const done = (id: StagePage) => Boolean(finalized[id])
  const approved = decision?.decision === 'approve'
  const ready = (i: number) => i === 0 || done(STEPS[i - 1].id)
  return (
    <nav aria-label="진행 단계" className="mb-4">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s, i) => {
          const current = s.id === page
          const isDone = done(s.id)
          const status = s.id === 'final' && isDone && decision
            ? `${decision.decision === 'approve' ? '팀장 승인' : '수정 지시'} ${formatDate(decision.at)}`
            : isDone
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
            {/* 팀장이 최종 승인하면 초록 체크 (ERD 최종 확정만으로는 아니다: 승인을 받아야 개발에 넘기는 산출물) */}
            <span aria-hidden="true" className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-md',
              approved ? 'bg-ok text-card' : isDocPage(page) ? 'bg-primary text-on-primary' : 'bg-sunken text-fg-3')}>
              {approved ? <Check size={14} weight="bold" /> : <Files size={14} weight="bold" />}
            </span>
            <span className="min-w-0">
              <span className={cx('block text-label', isDocPage(page) ? 'font-semibold' : 'font-medium text-fg-2')}>
                산출물 보기 <span className="font-normal text-fg-3 tabular-nums">v{version}</span>
              </span>
              <span className={cx('block truncate text-micro', approved ? 'text-ok' : 'text-fg-3')}>
                {approved ? `팀장 승인 ${formatDate(decision!.at)} · 판단 기록·이슈·추적` : '판단 기록·이슈·추적 (보기만)'}
              </span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={!approved}
            aria-current={page === 'develop' ? 'page' : undefined}
            onClick={() => onGo('develop')}
            title={approved ? '개발 상태와 결과물 미리보기' : '팀장이 최종본을 승인하면 열립니다'}
            className={cx(
              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
              !approved ? 'cursor-not-allowed border-line bg-card/40 opacity-60'
                : page === 'develop' ? 'border-fg bg-card' : 'border-line bg-card/60 hover:border-control hover:bg-card',
            )}
          >
            <span aria-hidden="true" className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-md',
              developed?.at ? 'bg-ok text-card' : page === 'develop' ? 'bg-primary text-on-primary' : 'bg-sunken text-fg-3')}>
              <Play size={14} weight="fill" />
            </span>
            <span className="min-w-0">
              <span className={cx('block text-label', page === 'develop' ? 'font-semibold' : 'font-medium text-fg-2')}>최종 개발물 미리보기</span>
              <span className={cx('block truncate text-micro', developed?.at ? 'text-ok' : 'text-fg-3')}>
                {!approved ? '팀장 승인 후' : developed?.at ? `개발 ${formatDate(developed.at)}` : '개발 대기'}
              </span>
            </span>
          </button>
        </li>
      </ol>
    </nav>
  )
}
