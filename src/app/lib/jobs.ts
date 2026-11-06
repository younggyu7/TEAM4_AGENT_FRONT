import { useSyncExternalStore } from 'react'
import { createVersion, getJob, getRunningJob, pushGit, startDevelop, startReview, startRun, type Dispositions, type Job } from '../../api'

// 새 버전 만들기 작업 상태. Agent 실행은 몇 분 걸리므로 화면을 옮겨도 진행 상황이 남도록 모듈에 둔다.
// 새로고침·로그아웃하면 여기 상태는 비지만, 프로젝트를 열 때 서버에서 진행 중인 작업을 찾아 이어 본다 (resumeJob).

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

/** ERD 최종 확정 → 최종본 v<ERD>.1 (지적 처리를 남기고 DDL 검증·추적 검토·API 설계) */
export async function startReviewJob(project: string, version: string, dispositions: Dispositions, onFinish: (job: Job) => void): Promise<void> {
  track(await startReview(project, version, dispositions), onFinish)
}

/** 최종 개발하기: 승인한 최종본 → 코드 + 미리보기 화면 (logic이면 업무 로직 빈칸도 AI가 채움) */
export async function startDevelopJob(project: string, version: string, ai: { build: boolean; logic?: boolean; model?: string; effort?: string; theme?: string },
  onFinish: (job: Job) => void): Promise<void> {
  track(await startDevelop(project, version, ai), onFinish)
}

/** git 올리기: 서버의 코드 폴더 → 화면·백엔드 저장소 */
export async function startGitJob(project: string, version: string, onFinish: (job: Job) => void): Promise<void> {
  track(await pushGit(project, version), onFinish)
}

/** 원본 요구서 업로드 → 기능 명세 초안까지 실행. 작업은 프로젝트 ID(업로드한 프로젝트 이름)로 기록한다.
 * Slack이 켜져 있으면 만든 프로젝트 채널(slack)도 돌려준다. */
export async function startUpload(
  file: File,
  opts: Parameters<typeof startRun>[1],
  onFinish: (job: Job) => void,
): ReturnType<typeof startRun> {
  const started = await startRun(file, opts)
  track(started.job, onFinish)
  return started
}

/** 서버에서 이 프로젝트에 진행 중인 작업이 있으면 진행 창을 다시 띄워 끝날 때까지 이어 본다 (이미 보고 있으면 그대로) */
const resuming = new Set<string>()      // 같은 프로젝트를 두 번 이어 보지 않게 (조회 중)
const watching = (project: string) => jobs[project]?.status === 'running'
export async function resumeJob(project: string, onFinish: (job: Job) => void): Promise<void> {
  if (watching(project) || resuming.has(project)) return
  resuming.add(project)
  try {
    const job = await getRunningJob(project).catch(() => null)
    if (job && !watching(project)) track(job, onFinish)
  } finally {
    resuming.delete(project)
  }
}

function track(job: Job, onFinish: (job: Job) => void) {
  set(job.project, job)
  const poll = async () => {
    try {
      const next = await getJob(job.id)
      set(job.project, next)
      if (next.status === 'running') window.setTimeout(poll, POLL_MS)
      else {
        onFinish(next)
        window.dispatchEvent(new Event('notices:changed'))   // 일 알림(분석 완료·ERD 초안·개발 초안)을 바로 보이게
      }
    } catch (e) {
      set(job.project, { ...job, status: 'failed', message: (e as Error).message })
    }
  }
  window.setTimeout(poll, POLL_MS)
}
