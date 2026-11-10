import { ArrowRight, CheckCircle, CircleNotch, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { Job } from '../../api'
import { clearJob } from '../lib/jobs'
import { Button, Card, cx, IconButton } from './ui'

/** 진행 상황: 문서 업로드(홈), 기능 명세 내보내기·ERD 저장(ERD 화면 위), 확인 질문 답 반영(기능 명세 화면 위),
 * ERD 최종 확정(ERD·최종 산출물 화면 위) 작업이 도는 동안과 끝난 뒤 결과 */
export function JobPanel({ job, project, onOpen, current }: {
  job: Job
  project: string
  onOpen: (version: string) => void
  /** 지금 보고 있는 버전 (새 버전을 이미 열었으면 '열기' 대신 안내를 보여 준다) */
  current?: string
}) {
  const opened = Boolean(job.new_version) && job.new_version === current
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (job.status !== 'running') return
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - Date.parse(job.started_at)) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [job.status, job.started_at])

  const running = job.status === 'running'
  const warn = job.status === 'done' && Boolean(job.warnings?.length)
  const needs = job.status === 'done' && !warn && Boolean(job.checks?.length)   // 실패 아님: 사람이 확인할 것만 남음
  const tone = running ? 'border-info/40' : job.status === 'failed' ? 'border-danger/40' : warn ? 'border-warn/40' : needs ? 'border-info/40' : 'border-ok/40'
  const steps = job.log.filter((l) => /^\s*(\d\d:\d\d:\d\d\s+)?(#\d+|\[|다시 설계|사용자 수정|데이터 설계 다시)/.test(l)).slice(-6)

  return (
    <Card aria-labelledby="job-title" className={cx('mb-4 border-2', tone)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="eyebrow">{job.source === 'run' ? 'Upload · 원본 요구서 → 요구사항·기능 명세 초안' : job.source === 'answers' ? 'Answers · 확인 질문 답 → 기능 명세' : job.source === 'spec' ? 'Export · 기능 명세 → ERD' : job.source === 'review' ? 'Final · ERD 최종 확정 → 최종본' : job.source === 'check' ? 'Check · 자동 확인' : job.source === 'develop' ? 'Develop · 최종본 → 서비스 코드·미리보기' : job.source === 'git' ? 'Git · 서버 코드 → 화면·백엔드 저장소' : 'New version · ERD'}</p>
          <h2 id="job-title" role="status" className={cx('mt-1 flex items-center gap-2 text-subtitle font-medium',
            job.status === 'failed' && 'text-danger', warn && 'text-warn', needs && 'text-info', job.status === 'done' && !warn && !needs && 'text-ok')}>
            {running && <CircleNotch size={20} className="animate-spin" aria-hidden="true" />}
            {job.status === 'done' && !warn && <CheckCircle size={20} weight="fill" aria-hidden="true" />}
            {(job.status === 'failed' || warn) && <WarningCircle size={20} aria-hidden="true" />}
            {job.message}{running && '…'}
          </h2>
          {running && (
            <p className="mt-1 text-small text-fg-3 tabular-nums">
              {elapsed}초 경과 · {job.source === 'run'
                ? 'Agent가 문서 분석 → 요구사항 추출·검토 → 기능 명세 초안까지 만듭니다 (문서 크기에 따라 수 분~수십 분). 확인 질문은 추천안으로 가정하고, 끝나면 화면에서 확인·수정한 뒤 ERD를 만듭니다.'
                : job.source === 'review'
                ? '확정한 ERD로 최종본을 만듭니다: 지적 처리 기록 → DDL 검증·추적 검토(코드) → API 설계(바뀐 기능만, 개발 스펙 문서 10개). DDL에 오류가 있으면 최종본을 만들지 않습니다. 끝나면 최종본이 열립니다.'
                : job.source === 'develop'
                ? '개발 스펙으로 화면·API·DB 코드를 만들고(AI 업무 로직은 고른 경우만) 예시 데이터 화면을 빌드합니다. 처음에는 화면 패키지 설치로 1분쯤 걸립니다. 끝나면 위 단계 표시줄의 \'최종 개발물 미리보기\'로 봅니다.'
                : job.source === 'check'
                ? '지금 dev 코드를 Docker로 켜고 admin으로 로그인해 조회 API를 한 번씩 부릅니다 (LLM 없음, 처음엔 빌드로 몇 분).'
                : job.source === 'git'
                ? '서버의 코드 폴더를 화면·백엔드 저장소에 커밋·push합니다 (LLM 없음).'
                : job.source === 'answers'
                ? 'Agent가 답을 반영하고(분류·결정), 충돌을 다시 확인한 뒤 바뀐 기능만 다시 설계합니다. 끝나면 새 기능 명세 버전이 열립니다.'
                : 'Agent가 데이터 설계·검증·DDL을 만들고, 의미 검토로 빠진 데이터를 찾아 한 번 고칩니다 (사람이 고친 ERD만 저장하면 다시 검토하지 않음). 다른 화면으로 가도 계속 실행되고, 끝나면 새 ERD 버전이 열립니다.'}
            </p>
          )}
        </div>
        {!running && <IconButton label="진행 상황 닫기" icon={<X />} onClick={() => clearJob(project)} />}
      </div>

      <div className="space-y-3 px-5 pt-3 pb-4">
        {running && (
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className="h-full w-1/3 animate-[job-slide_1.4s_ease-in-out_infinite] rounded-full bg-info" />
          </div>
        )}
        {steps.length > 0 && (
          <ol className="space-y-0.5 text-small text-fg-2">
            {steps.map((s, i) => <li key={i} className="truncate">{s.trim()}</li>)}
          </ol>
        )}
        {job.warnings && job.warnings.length > 0 && (
          <ul className="max-h-40 list-disc space-y-1 overflow-auto rounded-md bg-warn-soft py-2 pr-3 pl-7 text-small text-warn">
            {job.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
        {job.checks && job.checks.length > 0 && (
          <div className="rounded-md bg-info-soft px-3 py-2 text-small text-info">
            <p className="font-medium">필수 확인 {job.checks.length}건 — 산출물은 정상으로 만들어졌고, 확인 필요 탭에서 처리하면 확정할 수 있습니다</p>
            <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5">{job.checks.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        <details>
          <summary className="min-h-8 text-small text-fg-3">실행 기록 ({job.log.length}줄)</summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-sunken p-3 font-mono text-micro leading-relaxed whitespace-pre-wrap">{job.log.slice(-60).join('\n')}</pre>
        </details>
        {job.status === 'done' && opened && (
          <p className="text-right text-small text-fg-3">지금 v{job.new_version}을 보고 있습니다.</p>
        )}
        {job.status === 'done' && job.source === 'review' && !opened && (
          <div className="flex justify-end">
            <Button variant="primary" icon={<ArrowRight />} onClick={() => onOpen(job.new_version ?? job.base)}>
              최종본{job.new_version ? ` v${job.new_version}` : ''} 열기
            </Button>
          </div>
        )}
        {job.status === 'done' && job.new_version && job.source !== 'review' && job.source !== 'develop' && job.source !== 'git' && job.source !== 'check' && !opened && (
          <div className="flex justify-end">
            <Button variant="primary" icon={<ArrowRight />} onClick={() => onOpen(job.new_version!)}>{job.source === 'answers' || job.source === 'run' ? '기능 명세' : 'ERD'} v{job.new_version} 열기</Button>
          </div>
        )}
      </div>
    </Card>
  )
}
