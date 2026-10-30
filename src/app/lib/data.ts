import { useEffect, useRef, useState } from 'react'
import { getDesign, getFile, getSpecFormat, listProjects } from '../../api'
import type { Design, Project } from '../../types'

export type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T }

// 같은 요청을 화면 여러 곳에서 써도 한 번만 부른다 (새로고침 버튼은 clearCache 후 다시 부른다)
const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function clearCache() {
  cache.clear()
}

// 한 버전의 산출물이 서버에서 바뀌었을 때(기술 스택 확정 등) 그 버전의 design·파일만 다시 부른다
const listeners = new Set<(prefix: string) => void>()

export function refreshVersion(project: string, version: string) {
  for (const prefix of [`design:${project}@${version}`, `file:${project}@${version}/`]) {
    for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key)
    listeners.forEach((fn) => fn(prefix))
  }
}

function useLoad<T>(key: string | null, load: () => Promise<T>, deps: unknown[]): Load<T> {
  const [value, setValue] = useState<Load<T>>({ state: 'loading' })
  const [tick, setTick] = useState(0)
  const shown = useRef<string | null>(null)   // 지금 보여 주는 값의 키 (같은 키를 다시 부를 때는 이전 값을 둔 채 바꾼다)
  useEffect(() => {
    if (key === null) return
    const onRefresh = (prefix: string) => { if (key.startsWith(prefix)) setTick((t) => t + 1) }
    listeners.add(onRefresh)
    return () => { listeners.delete(onRefresh) }
  }, [key])
  useEffect(() => {
    if (key === null) return
    let cancelled = false
    if (shown.current !== key) setValue({ state: 'loading' })
    shown.current = key
    cached(key, load)
      .then((data) => { if (!cancelled) setValue({ state: 'ready', data }) })
      .catch((e: Error) => { if (!cancelled) setValue({ state: 'error', message: e.message }) })
    return () => { cancelled = true }
  }, [key, tick, ...deps])
  return value
}

export function useProjects(reloadKey = 0): Load<Project[]> {
  return useLoad(`projects:${reloadKey}`, () => listProjects().then((r) => r.projects), [])
}

export function useDesign(project: string, version: string): Load<Design> {
  return useLoad(`design:${project}@${version}`, () => getDesign(project, version), [])
}

export function useFile(project: string, version: string, name: string): Load<string | null> {
  return useLoad(`file:${project}@${version}/${name}`, () => getFile(project, version, name), [])
}

/** 개발 스펙 문서 형식 정의 (SPEC_FORMAT.md). 열 때만 부른다 */
export function useSpecFormat(open: boolean): Load<string | null> {
  return useLoad(open ? 'spec-format' : null, getSpecFormat, [])
}

/** LLM 사용량. 버전마다 review_report.md의 'LLM 사용량' 줄에서 읽는다 (ERD 최종 확정의 추적·의미 검토는 최종본 v<ERD>.1의 보고서). */
export interface Usage {
  calls: number
  input: number
  output: number
  /** 그 버전을 만든 LLM 모델 ('- 모델:' 줄). 이 줄이 생기기 전에 만든 버전은 없다 */
  model?: string
}

const MODEL_LINE = /^- 모델:\s*(.+)$/m
const USAGE_LINE = /호출\s*([\d,]+)회\s*·\s*입력 토큰\s*([\d,]+)\s*·\s*출력 토큰\s*([\d,]+)/
const num = (s: string) => Number(s.replace(/,/g, ''))

export function parseUsage(report: string | null): Usage | null {
  const m = report && USAGE_LINE.exec(report)
  return m ? { calls: num(m[1]), input: num(m[2]), output: num(m[3]), model: MODEL_LINE.exec(report)?.[1].trim() } : null
}

export interface VersionUsage {
  project: string
  version: string
  usage: Usage | null
}

/** 프로젝트·버전 목록의 사용량을 한꺼번에 읽는다. 보고서가 없는 버전은 usage가 null. */
export function useUsages(targets: { project: string; version: string }[]): Load<VersionUsage[]> {
  const key = targets.map((t) => `${t.project}@${t.version}`).join('|')
  return useLoad(
    targets.length ? `usage:${key}` : null,
    () => Promise.all(targets.map((t) =>
      cached(`file:${t.project}@${t.version}/review_report.md`, () => getFile(t.project, t.version, 'review_report.md'))
        .then((report) => ({ ...t, usage: parseUsage(report) })),
    )),
    [],
  )
}
