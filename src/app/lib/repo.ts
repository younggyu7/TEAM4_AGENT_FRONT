import { useEffect, useState } from 'react'
import { readStore, writeStore } from './storage'

// 최종 개발물 코드 저장소: 지금 보는 브랜치를 오른쪽 '코드 저장소' 카드와 1단계 코드 보기가 같이 쓴다 (프로젝트마다 기억).
// 저장하기·합치기·메인 가져오기처럼 저장소가 바뀌면 REPO_CHANGED를 보내 둘 다 다시 읽는다.

const BRANCH_CHANGED = 'repo:branch'
export const REPO_CHANGED = 'repo:changed'

export const repoChanged = () => window.dispatchEvent(new Event(REPO_CHANGED))

export function setRepoBranch(project: string, branch: string) {
  writeStore(`repo-branch.${project}`, branch)
  window.dispatchEvent(new CustomEvent(BRANCH_CHANGED, { detail: { project, branch } }))
}

/** [지금 브랜치, 바꾸기]. 기본 main */
export function useRepoBranch(project: string): [string, (branch: string) => void] {
  const [branch, setBranch] = useState(() => readStore<string>(`repo-branch.${project}`) || 'main')
  useEffect(() => {
    setBranch(readStore<string>(`repo-branch.${project}`) || 'main')
    const on = (e: Event) => { const d = (e as CustomEvent<{ project: string; branch: string }>).detail; if (d.project === project) setBranch(d.branch) }
    window.addEventListener(BRANCH_CHANGED, on)
    return () => window.removeEventListener(BRANCH_CHANGED, on)
  }, [project])
  return [branch, (b: string) => setRepoBranch(project, b)]
}

/** 저장소가 바뀔 때마다 늘어나는 숫자 (다시 읽기 키) */
export function useRepoVersion(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const on = () => setN((x) => x + 1)
    window.addEventListener(REPO_CHANGED, on)
    return () => window.removeEventListener(REPO_CHANGED, on)
  }, [])
  return n
}
