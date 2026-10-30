import { useSyncExternalStore } from 'react'
import { createVersion, getJob, startReview, startRun, type Job } from '../../api'

// 새 버전 만들기 작업 상태. Agent 실행은 몇 분 걸리므로 화면을 옮겨도 진행 상황이 남도록 모듈에 둔다.
// 백엔드 서버를 다시 띄우면 서버 쪽 작업 기록이 사라지므로 여기 상태도 새로고침하면 비운다.

const POLL_MS = 2000
let jobs: Record<string, Job> = {}       // 프로젝트 ID → 마지막 작업
const listeners = new Set<() => void>()

function set(project: string, job: Job) {
  jobs = { ...jobs, [project]: job }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useJob(project: string): Job | undefined {
  return useSyncExternalStore(subscribe, () => jobs[project])
}

export function clearJob(project: string) {
  const { [project]: _, ...rest } = jobs
  jobs = rest
  listeners.forEach((l) => l())
}

/** 작업을 시작하고 끝날 때까지 상태를 갱신한다. 끝나면 onFinish를 부른다 (새 버전 목록 다시 읽기 등). */
export async function startJob(
  body: Parameters<typeof createVersion>[0],
  onFinish: (job: Job) => void,
): Promise<void> {
  track(await createVersion(body), onFinish)
}

/** ERD 최종 확정 → 의미 검토 1회 (새 버전 없이 그 버전 폴더에 결과) */
export async function startReviewJob(project: string, version: string, onFinish: (job: Job) => void): Promise<void> {
  track(await startReview(project, version), onFinish)
}

/** 원본 요구서 업로드 → 기능 명세 초안까지 실행. 작업은 프로젝트 ID(업로드한 프로젝트 이름)로 기록한다. */
export async function startUpload(
  file: File,
  opts: Parameters<typeof startRun>[1],
  onFinish: (job: Job) => void,
): Promise<Job> {
  const job = await startRun(file, opts)
  track(job, onFinish)
  return job
}

function track(job: Job, onFinish: (job: Job) => void) {
  set(job.project, job)
  const poll = async () => {
    try {
      const next = await getJob(job.id)
      set(job.project, next)
      if (next.status === 'running') window.setTimeout(poll, POLL_MS)
      else onFinish(next)
    } catch (e) {
      set(job.project, { ...job, status: 'failed', message: (e as Error).message })
    }
  }
  window.setTimeout(poll, POLL_MS)
}
