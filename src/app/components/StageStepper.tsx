import { Check, Files } from '@phosphor-icons/react'
import { formatDate } from '../../labels'
import type { VersionRecord } from '../../types'
import { isDocPage, type Page, type StagePage } from '../lib/route'
import { cx, WhyTip } from './ui'

/** 단계의 버전 표시. 아직 그 단계 버전이 없으면 앞 단계 번호를 그대로 쓰고 있다는 뜻으로 '(… 안의 초안)'처럼 적는다.
 * 최종 산출물은 확정 전에는 번호만 적고 확정한 뒤에만 '미리 보기'를 붙인다 */
function versionLabel(stage: StagePage, t: Record<StagePage, string>, finalDone: boolean): string {
  const depthOf = (v: string) => v.split('.').length - 1
  const want = stage === 'spec' ? 0 : stage === 'erd' ? 1 : 2
  const v = t[stage]
  if (depthOf(v) === want) return `v${v}`
  if (stage === 'erd') return `v${v} 안의 초안`
  return finalDone ? `v${v} 미리 보기` : `v${v}`
}

/** 칸이 좁으므로 단계 줄에서는 연도를 뺀 날짜 (11.06 10:20). 전체는 칸의 title로 */
const short = (iso?: string) => formatDate(iso).replace(/^\d{4}\./, '')

type Develop = NonNullable<VersionRecord['develop']>
type Tone = 'ok' | 'danger' | 'muted'

/** 자동 확인(테스트) 칸의 상태: 최종 개발하기 끝에 Docker로 켜서 admin 로그인과 조회 API를 불러 본 결과 */
function checkStatus(d?: Develop): { text: string; tone: Tone; done: boolean } {
  if (!d) return { text: '개발 후', tone: 'muted', done: false }
  const c = d.check
  if (c === undefined) return { text: '기록 없음', tone: 'muted', done: false }
  if (c === null) return { text: '서버 코드 없음', tone: 'muted', done: false }
  if (!c.counts) return { text: '확인 실패', tone: 'danger', done: false }
  return c.ok ? { text: `통과 · API ${c.apis ?? 0}개`, tone: 'ok', done: true }
    : { text: `서버 오류 ${c.counts.errors}개`, tone: 'danger', done: false }
}

/**
 * 맨 위 진행 단계 (개발 방법론 순서): 요구사항 분석 → 설계 → 개발 범위 확정 → 개발 진행 → 테스트(검증) → 실행·마무리.
 * 굵은 글씨는 단계 이름, 작은 글씨는 이 화면의 이름(기능 명세·ERD·최종 산출물·최종 개발물)과 버전이다. 안쪽 버튼·문구는 그대로 쓴다.
 * 앞 단계를 확정해야 다음 단계가 '진행 가능'으로 바뀌지만, 보기는 언제든 할 수 있다. 4~6은 최종 승인한 뒤 열리는
 * 최종 개발물 화면의 1단계 개발(4), 2단계 실행·자동 확인(5), 3단계 Git(6)으로 간다.
 * '산출물 보기'는 단계가 아니라 지금 버전의 산출물(판단 기록·이슈·추적 …)을 읽기만 하는 화면이라 단계 줄 밖 버튼으로 둔다.
 */
export function StageStepper({ page, focus, version, targets, finalized, decision, onGo, develop, git }: {
  page: Page
  /** 최종 개발물 화면의 안쪽 단계 ('1'·'2'·'3', 예전 주소 'check'는 2단계) */
  focus?: string
  version: string                      // 산출물 보기가 여는 버전 (지금 보는 버전)
  targets: Record<StagePage, string>   // 각 단계에서 열 버전 (v2 / v2.1 / v2.1.1)
  finalized: { spec?: string; erd?: string; final?: string }
  /** 최종본에 대한 마지막 결정 */
  decision?: { decision: 'approve' | 'changes'; at: string }
  onGo: (page: Page, focus?: string) => void
  /** 최종본의 개발 기록 (개발한 때·자동 확인 결과) */
  develop?: Develop
  /** 최종본을 원격 git에 올린 기록 */
  git?: VersionRecord['git']
}) {
  const done = (id: StagePage) => Boolean(finalized[id])
  const approved = decision?.decision === 'approve'
  const onDevelop = page === 'develop'
  const devStep = focus === '3' ? 'run' : focus === '2' || focus === 'check' ? 'check' : 'build'
  const check = checkStatus(develop)
  const steps: { key: string; label: string; screen: string; status: string; tone: Tone; done: boolean; current: boolean
    locked?: string; go: () => void }[] = [
    { key: 'spec', label: '요구사항 분석', screen: `기능 명세 ${versionLabel('spec', targets, done('final'))}`,
      status: done('spec') ? `확정 ${short(finalized.spec)}` : '진행 중', tone: done('spec') ? 'ok' : 'muted',
      done: done('spec'), current: page === 'spec', go: () => onGo('spec') },
    { key: 'erd', label: '설계', screen: `ERD ${versionLabel('erd', targets, done('final'))}`,
      status: done('erd') ? `확정 ${short(finalized.erd)}` : done('spec') ? '진행 중' : '앞 단계 확정 전',
      tone: done('erd') ? 'ok' : 'muted', done: done('erd'), current: page === 'erd', go: () => onGo('erd') },
    { key: 'final', label: '개발 범위 확정', screen: `최종 산출물 ${versionLabel('final', targets, done('final'))}`,
      status: decision ? `${approved ? '최종 승인' : '수정 지시'} ${short(decision.at)}`
        : done('final') ? '최종 확정 · 승인 전' : done('erd') ? '최종 확정 전' : '앞 단계 확정 전',
      tone: approved ? 'ok' : 'muted', done: approved, current: page === 'final', go: () => onGo('final') },
    { key: 'build', label: '개발 진행', screen: '최종 개발하기',
      status: !approved ? '최종 승인 후' : develop?.at ? `개발 ${short(develop.at)}` : '개발 대기',
      tone: develop?.at ? 'ok' : 'muted', done: Boolean(develop?.at), current: onDevelop && devStep === 'build',
      locked: approved ? undefined : '개발 범위 확정에서 최종 승인하면 열립니다', go: () => onGo('develop', '1') },
    { key: 'check', label: '테스트(검증)', screen: '실행 · 자동 확인',
      status: !approved ? '최종 승인 후' : check.text, tone: approved ? check.tone : 'muted', done: approved && check.done,
      current: onDevelop && devStep === 'check',
      locked: approved ? undefined : '개발 범위 확정에서 최종 승인하면 열립니다', go: () => onGo('develop', '2') },
    { key: 'run', label: '실행·마무리', screen: 'Git',
      status: !approved ? '최종 승인 후' : !develop ? '개발 후' : git ? `Git 올림 ${short(git.at)}` : 'Git 올리기 전',
      tone: git ? 'ok' : 'muted', done: Boolean(git), current: onDevelop && devStep === 'run',
      locked: approved ? undefined : '개발 범위 확정에서 최종 승인하면 열립니다', go: () => onGo('develop', '3') },
  ]
  return (
    <nav aria-label="진행 단계" className="@container mb-4">
      <ol className="grid grid-cols-2 gap-2 @xl:grid-cols-3 @4xl:grid-cols-6">
        {steps.map((s, i) => (
          <li key={s.key}>
            <WhyTip text={s.locked ?? ''} align="left" className="h-full w-full">
              <button
                type="button"
                disabled={Boolean(s.locked)}
                aria-current={s.current ? 'step' : undefined}
                onClick={s.go}
                title={s.locked ? undefined : `${i + 1}. ${s.label} · ${s.screen} · ${s.status}`}
                className={cx(
                  'flex h-full w-full min-w-0 flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150',
                  s.locked ? 'cursor-not-allowed border-line bg-card/40 opacity-60'
                    : s.current ? 'border-fg bg-card' : 'border-line bg-card/60 hover:border-control hover:bg-card',
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cx(
                      'inline-flex size-5 shrink-0 items-center justify-center rounded text-micro font-semibold tabular-nums',
                      s.done ? 'bg-ok text-card' : s.current ? 'bg-primary text-on-primary' : 'bg-sunken text-fg-3',
                    )}
                  >
                    {s.done ? <Check size={12} weight="bold" /> : i + 1}
                  </span>
                  <span className={cx('min-w-0 text-label leading-tight break-keep', s.current ? 'font-semibold' : 'font-medium text-fg-2')}>
                    {s.label}
                  </span>
                </span>
                <span className="block truncate text-micro text-fg-3 tabular-nums">{s.screen}</span>
                <span className={cx('block truncate text-micro tabular-nums', s.tone === 'ok' ? 'text-ok' : s.tone === 'danger' ? 'text-danger' : 'text-fg-3')}>
                  {s.status}
                </span>
              </button>
            </WhyTip>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          aria-current={isDocPage(page) ? 'page' : undefined}
          onClick={() => onGo('overview')}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-small transition-colors duration-150',
            isDocPage(page) ? 'border-fg bg-card font-semibold' : 'border-line bg-card/60 text-fg-2 hover:border-control hover:bg-card',
          )}
        >
          <Files size={14} aria-hidden="true" />
          산출물 보기 <span className="font-normal text-fg-3 tabular-nums">v{version} · 판단 기록·이슈·추적</span>
        </button>
      </div>
    </nav>
  )
}
