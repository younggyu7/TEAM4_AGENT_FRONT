import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attribute, Design, Entity, FunctionSpec } from '../../types'
import { listStoreKeys, readStore, removeStore, writeStore } from './storage'

// 초안 편집 상태. 원본 design.json은 그대로 두고, 바뀐 기능·테이블과 검토 체크만 따로 저장한다.
// 서버 저장 API가 생기기 전이라 이 브라우저(localStorage)에 남기고, '내보내기'로 수정본 design.json을 받는다.

export interface DraftState {
  functions: Record<string, FunctionSpec>   // 바뀐 기능 (function_id → 수정본)
  entities: Record<string, Entity>          // 바뀐 테이블 (entity_id → 수정본)
  answers: Record<string, string>           // 확인 질문 답 (question_id → 답)
  checked: Record<string, boolean>          // 사람이 '확인함'으로 표시한 검토 항목
  finalized?: { page: ConfirmStage; at: string }[]
  updatedAt?: string
}

/** 확정하는 단계: 기능 명세 · ERD · 최종 산출물 */
export type ConfirmStage = 'spec' | 'erd' | 'final'

const EMPTY: DraftState = { functions: {}, entities: {}, answers: {}, checked: {} }
const draftKey = (project: string, version: string) => `draft:${project}@v${version}`

/** 다른 버전의 초안 (진행 상황: 단계마다 그 단계 버전의 체크로 센다) */
export const readDraft = (project: string, version: string): DraftState => readStore<DraftState>(draftKey(project, version)) ?? EMPTY

/** 수정이 반영된 기능·테이블 (useDraft의 functions·entities와 같은 규칙) */
export const mergedFunctions = (design: Design, state: DraftState): FunctionSpec[] =>
  design.functions.map((f) => state.functions[f.function_id] ?? f)
export const mergedEntities = (design: Design, state: DraftState): Entity[] =>
  design.data_model.entities.map((e) => state.entities[e.entity_id] ?? e)

export type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function useDraft(design: Design, project: string, version: string) {
  const key = draftKey(project, version)
  const [state, setState] = useState<DraftState>(() => readStore<DraftState>(key) ?? EMPTY)
  const [save, setSave] = useState<SaveStatus>('saved')
  const [savedAt, setSavedAt] = useState<string | undefined>(() => readStore<DraftState>(key)?.updatedAt)
  // 저장소에서 읽은 그대로인 상태는 다시 쓰지 않는다 (손대지 않은 버전이 '편집 중'으로 잡히지 않게)
  const loaded = useRef<{ key: string; state: DraftState }>({ key, state })

  // 다른 버전으로 바꾸면 그 버전의 초안을 읽는다
  useEffect(() => {
    if (loaded.current.key === key) return
    const next = readStore<DraftState>(key) ?? EMPTY
    loaded.current = { key, state: next }
    setState(next)
    setSave('saved')
  }, [key])

  // 입력할 때마다 큰 객체를 쓰지 않도록 잠깐 모아서 저장한다
  useEffect(() => {
    if (state === loaded.current.state) return
    setSave('saving')
    const t = window.setTimeout(() => {
      const ok = writeStore(key, state)
      setSave(ok ? 'saved' : 'unsaved')
      if (ok) setSavedAt(new Date().toISOString())
    }, 400)
    return () => window.clearTimeout(t)
  }, [key, state])

  const update = useCallback((fn: (s: DraftState) => DraftState) => {
    setState((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }))
  }, [])

  const functions = useMemo(() => mergedFunctions(design, state), [design, state])
  const entities = useMemo(() => mergedEntities(design, state), [design, state])

  const updateFunction = useCallback((id: string, patch: Partial<FunctionSpec>) => {
    const base = design.functions.find((f) => f.function_id === id)
    if (!base) return
    update((s) => ({ ...s, functions: { ...s.functions, [id]: { ...(s.functions[id] ?? base), ...patch } } }))
  }, [design.functions, update])

  const updateEntity = useCallback((id: string, patch: Partial<Entity>) => {
    const base = design.data_model.entities.find((e) => e.entity_id === id)
    if (!base) return
    update((s) => ({ ...s, entities: { ...s.entities, [id]: { ...(s.entities[id] ?? base), ...patch } } }))
  }, [design.data_model.entities, update])

  const updateAttributes = useCallback((id: string, change: (attrs: Attribute[]) => Attribute[]) => {
    const base = design.data_model.entities.find((e) => e.entity_id === id)
    if (!base) return
    update((s) => {
      const current = s.entities[id] ?? base
      return { ...s, entities: { ...s.entities, [id]: { ...current, attributes: change(current.attributes) } } }
    })
  }, [design.data_model.entities, update])

  const revertFunction = useCallback((id: string) => {
    update((s) => { const { [id]: _, ...rest } = s.functions; return { ...s, functions: rest } })
  }, [update])

  /** 테이블 수정을 새 버전으로 저장한 뒤 이 버전의 테이블 수정을 비운다 (질문 답·체크는 둔다) */
  const clearEntityEdits = useCallback(() => {
    update((s) => ({ ...s, entities: {} }))
  }, [update])

  const revertEntity = useCallback((id: string) => {
    update((s) => { const { [id]: _, ...rest } = s.entities; return { ...s, entities: rest } })
  }, [update])

  const setAnswer = useCallback((questionId: string, answer: string) => {
    update((s) => ({ ...s, answers: { ...s.answers, [questionId]: answer } }))
  }, [update])

  const setChecked = useCallback((itemId: string, value: boolean) => {
    update((s) => ({ ...s, checked: { ...s.checked, [itemId]: value } }))
  }, [update])

  const finalize = useCallback((page: ConfirmStage) => {
    update((s) => ({
      ...s,
      finalized: [...(s.finalized ?? []).filter((f) => f.page !== page), { page, at: new Date().toISOString() }],
    }))
  }, [update])

  const unfinalize = useCallback((page: ConfirmStage) => {
    update((s) => ({ ...s, finalized: (s.finalized ?? []).filter((f) => f.page !== page) }))
  }, [update])

  /** '저장' 버튼: 기다리지 않고 바로 쓴다 (백엔드가 생기면 서버 초안 저장으로 바꾼다) */
  const saveNow = useCallback((): boolean => {
    const ok = writeStore(key, state)
    setSave(ok ? 'saved' : 'unsaved')
    if (ok) setSavedAt(new Date().toISOString())
    return ok
  }, [key, state])

  const reset = useCallback(() => {
    removeStore(key)
    loaded.current = { key, state: EMPTY }
    setState(EMPTY)
    setSave('saved')
  }, [key])

  /** 수정 내용을 반영한 design.json */
  const merged = useMemo<Design>(() => ({
    ...design,
    functions,
    data_model: { ...design.data_model, entities },
    questions: design.questions.map((q) => {
      const answer = state.answers[q.question_id]?.trim()
      return answer ? { ...q, answer, status: 'ANSWERED' as const } : q
    }),
  }), [design, functions, entities, state.answers])


  return {
    state,
    save,
    savedAt,
    saveNow,
    functions,
    entities,
    merged,
    editedFunctions: Object.keys(state.functions).length,
    editedEntities: Object.keys(state.entities).length,
    finalizedAt: (page: ConfirmStage) => state.finalized?.find((f) => f.page === page)?.at,
    updateFunction,
    updateEntity,
    updateAttributes,
    revertFunction,
    revertEntity,
    clearEntityEdits,
    setAnswer,
    setChecked,
    finalize,
    unfinalize,
    reset,
  }
}

export type Draft = ReturnType<typeof useDraft>

/** 홈·사이드바 요약용: 이 브라우저에 남은 초안들의 상태 */
export function draftSummaries(): { project: string; version: string; edited: number; finalized: number; updatedAt?: string }[] {
  return listStoreKeys('draft:').flatMap((k) => {
    const m = /^draft:(.+)@v(\d+(?:\.\d+)*)$/.exec(k)
    const s = readStore<DraftState>(k)
    if (!m || !s) return []
    return [{
      project: m[1],
      version: m[2],
      edited: Object.keys(s.functions).length + Object.keys(s.entities).length,
      finalized: s.finalized?.length ?? 0,
      updatedAt: s.updatedAt,
    }]
  })
}
