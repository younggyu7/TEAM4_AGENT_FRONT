import { useCallback, useEffect, useState } from 'react'
import { getFile, type SemanticReview } from '../../api'
import { readStore, writeStore } from './storage'

// 최종본의 의미 검토 결과(semantic_review.json)와, 사람이 지적을 '확인함'으로 표시한 것.
// 최종 산출물 화면의 의미 검토 카드와 오른쪽 진행 상황이 같이 쓴다 (확인 표시는 이 브라우저에 저장).

/** 지적 하나의 키 (같은 이슈에 지적이 여러 개 합쳐져 있으면 순서로 나눈다) */
export const remarkKey = (r: SemanticReview['remarks'][number], index: number) => `${r.issue_id}:${index}`

/** 의미 검토 결과. undefined: 읽는 중, null: 아직 없음. refresh가 바뀌면 다시 읽는다 (검토 작업이 끝났을 때) */
export function useSemanticReview(project: string, version: string, enabled = true, refresh?: string): SemanticReview | null | undefined {
  const [result, setResult] = useState<SemanticReview | null | undefined>(undefined)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setResult(undefined)
    getFile(project, version, 'semantic_review.json').then((text) => {
      if (cancelled) return
      try { setResult(text ? JSON.parse(text) as SemanticReview : null) } catch { setResult(null) }
    })
    return () => { cancelled = true }
  }, [project, version, enabled, refresh])
  return result
}

const listeners = new Set<() => void>()
const checksKey = (project: string, version: string) => `semantic:${project}@v${version}`

/** 지적별 '확인함' 표시. 한 화면에서 바꾸면 같은 버전을 보는 다른 곳(진행 상황)도 바로 바뀐다 */
export function useSemanticChecks(project: string, version: string) {
  const key = checksKey(project, version)
  const [checked, setChecked] = useState<Record<string, boolean>>(() => readStore(key) ?? {})
  useEffect(() => {
    const load = () => setChecked(readStore<Record<string, boolean>>(key) ?? {})
    load()
    listeners.add(load)
    return () => { listeners.delete(load) }
  }, [key])
  const toggle = useCallback((id: string) => {
    const current = readStore<Record<string, boolean>>(key) ?? {}
    writeStore(key, { ...current, [id]: !current[id] })
    listeners.forEach((l) => l())
  }, [key])
  return { checked, toggle }
}
