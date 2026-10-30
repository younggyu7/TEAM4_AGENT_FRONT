import { createContext, useContext, useEffect, useRef } from 'react'
import type { Design, VersionRecord } from './types'

export type Tab =
  | 'overview' | 'requirements' | 'questions' | 'functions' | 'data' | 'ddl' | 'trace' | 'issues' | 'decisions'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '개요' },
  { id: 'requirements', label: '요구사항' },
  { id: 'questions', label: '확인 질문' },
  { id: 'functions', label: '기능 명세' },
  { id: 'data', label: '데이터 모델' },
  { id: 'ddl', label: 'DDL' },
  { id: 'trace', label: '추적' },
  { id: 'issues', label: '이슈' },
  { id: 'decisions', label: '판단 기록' },
]

/** 추적 관계를 양방향으로 찾기 쉽게 정리한 것 */
export interface Links {
  funcsOfReq: Map<string, string[]>      // 요구사항(기능·비기능) → 기능
  reqsOfFunc: Map<string, string[]>      // 기능 → 기능 요구사항
  nfrsOfFunc: Map<string, string[]>      // 기능 → 비기능 요구사항
  entitiesOfFunc: Map<string, string[]>  // 기능 → 엔티티
  funcsOfEntity: Map<string, string[]>   // 엔티티 → 기능
}

export interface DesignContextValue {
  design: Design
  project: string
  /** 보고 있는 설계 버전 번호 (design.json의 meta.design_version은 문자열인 경우가 있어 주소의 값을 쓴다) */
  versionNumber: string
  version?: VersionRecord
  /** 다른 탭의 항목으로 이동할 때 그 항목 ID */
  focus?: string
  go: (tab: Tab, focus?: string) => void
  /** ID → 그 항목을 보여주는 탭 */
  index: Map<string, Tab>
  links: Links
}

export const DesignContext = createContext<DesignContextValue | null>(null)

export function useDesign(): DesignContextValue {
  const ctx = useContext(DesignContext)
  if (!ctx) throw new Error('DesignContext 밖에서 사용함')
  return ctx
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

export function buildLinks(design: Design): Links {
  const links: Links = {
    funcsOfReq: new Map(), reqsOfFunc: new Map(), nfrsOfFunc: new Map(), entitiesOfFunc: new Map(), funcsOfEntity: new Map(),
  }
  for (const l of design.trace_links) {
    if (l.link_type === 'FUNC_ENTITY') {
      push(links.entitiesOfFunc, l.from_id, l.to_id)
      push(links.funcsOfEntity, l.to_id, l.from_id)
    } else {
      push(links.funcsOfReq, l.from_id, l.to_id)
      push(l.link_type === 'REQ_FUNC' ? links.reqsOfFunc : links.nfrsOfFunc, l.to_id, l.from_id)
    }
  }
  return links
}

export function buildIndex(design: Design): Map<string, Tab> {
  const index = new Map<string, Tab>()
  design.requirements.forEach((r) => index.set(r.requirement_id, 'requirements'))
  design.questions.forEach((q) => index.set(q.question_id, 'questions'))
  design.functions.forEach((f) => index.set(f.function_id, 'functions'))
  design.data_model.entities.forEach((e) => index.set(e.entity_id, 'data'))
  design.issues.forEach((i) => index.set(i.issue_id, 'issues'))
  return index
}

/** 다른 탭에서 이 항목으로 이동해 왔으면 화면에 보이도록 스크롤한다. */
export function useFocusTarget<T extends HTMLElement>(id: string) {
  const { focus } = useDesign()
  const ref = useRef<T>(null)
  const focused = focus === id
  useEffect(() => {
    if (!focused) return
    // CSS의 reduced-motion 설정은 JS 스크롤에 적용되지 않으므로 여기서 따로 확인한다
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [focused])
  return { ref, focused }
}
