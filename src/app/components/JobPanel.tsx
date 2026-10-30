import { ArrowRight, CheckCircle, CircleNotch, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { Job } from '../../api'
import { clearJob } from '../lib/jobs'
import { Button, Card, cx, IconButton } from './ui'

/** 진행 상황: 문서 업로드(홈), 기능 명세 내보내기·ERD 저장(ERD 화면 위), 확인 질문 답 반영(기능 명세 화면 위),
 * ERD 최종 확정 의미 검토(ERD·최종 산출물 화면 위) 작업이 도는 동안과 끝난 뒤 결과 */
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
  const tone = running ? 'border-info/40' : job.status === 'failed' ? 'border-danger/40' : warn ? 'border-warn/40' : 'border-ok/40'
  const steps = job.log.filter((l) => /^\s*(\d\d:\d\d:\d\d\s+)?(#\d+|\[|다시 설계|사용자 수정|데이터 설계 다시)/.test(l)).slice(-6)

  return (
    <Card aria-labelledby="job-title" className={cx('mb-4 border-2', tone)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="eyebrow">{job.source === 'run' ? 'Upload · 원본 요구서 → 요구사항·기능 명세 초안' : job.source === 'answers' ? 'Answers · 확인 질문 답 → 기능 명세' : job.source === 'spec' ? 'Export · 기능 명세 → ERD' : job.source === 'review' ? 'Final · ERD 최종 확정 → 최종본' : 'New version · ERD'}</p>
          <h2 id="job-title" role="status" className={cx('mt-1 flex items-center gap-2 text-subtitle font-medium',
            job.status === 'failed' && 'text-danger', warn && 'text-warn', job.status === 'done' && !warn && 'text-ok')}>
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
                ? '확정한 ERD로 최종본을 만들고, 추적 검토(코드) → API 설계(바뀐 기능만, 개발 스펙 문서 9개) → 의미 검토(ERD ↔ 기능 명세, LLM 1회)를 합니다 (보통 1~3분). 끝나면 최종본이 열립니다.'
                : job.source === 'answers'
                ? 'Agent가 답을 반영하고(분류·결정), 충돌을 다시 확인한 뒤 바뀐 기능만 다시 설계합니다. 끝나면 새 기능 명세 버전이 열립니다.'
                : 'Agent가 데이터 설계·검증·DDL을 만듭니다. 다른 화면으로 가도 계속 실행되고, 끝나면 새 ERD 버전이 열립니다.'}
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
        {job.status === 'done' && job.new_version && job.source !== 'review' && !opened && (
          <div className="flex justify-end">
            <Button variant="primary" icon={<ArrowRight />} onClick={() => onOpen(job.new_version!)}>{job.source === 'answers' || job.source === 'run' ? '기능 명세' : 'ERD'} v{job.new_version} 열기</Button>
          </div>
        )}
      </div>
    </Card>
  )
}
