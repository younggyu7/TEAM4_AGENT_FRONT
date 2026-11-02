import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getDraft, saveDraft, type DispositionChoice, type Dispositions } from '../../api'
import type { Attribute, Design, Entity, FunctionSpec } from '../../types'
import { listStoreKeys, readStore, removeStore, writeStore } from './storage'

// 초안 편집 상태. 원본 design.json은 그대로 두고, 바뀐 기능·테이블과 검토 체크만 따로 저장한다.
// 서버(POST /drafts)에 버전별로 저장해 같은 파트 회원이 함께 고치고(파트원 수정 → 파트장 확정), 이 브라우저(localStorage)는
// 바로 보여 줄 사본으로 둔다. 다른 사람이 먼저 저장했으면(409) '다시 불러오기'로 서버 초안을 받는다.

export interface DraftState {
  functions: Record<string, FunctionSpec>   // 바뀐 기능 (function_id → 수정본)
  entities: Record<string, Entity>          // 바뀐 테이블 (entity_id → 수정본)
  answers: Record<string, string>           // 확인 질문 답 (question_id → 답)
  checked: Record<string, boolean>          // 사람이 '확인함'으로 표시한 검토 항목
  dispositions?: Dispositions               // ERD 화면: 의미 검토 지적 처리 (이슈 ID → 반영함·문제 아님·미해결로 둠)
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

/** 서버 초안 동기화: loading(서버에서 읽는 중) · synced(서버와 같음) · saving · conflict(다른 사람이 먼저 저장) ·
 * readonly(이 단계를 고칠 권한 없음, 서버에 쓰지 않음) · error(서버에 못 씀, 이 브라우저에만 있음) */
export interface DraftSync {
  status: 'loading' | 'synced' | 'saving' | 'conflict' | 'readonly' | 'error'
  by?: string          // 서버 초안을 마지막으로 저장한 사람
  at?: string
  message?: string
}

const SERVER_DELAY = 1200   // 입력을 모아 서버에 쓰는 간격 (ms)

/** 다른 버전(단계별 진행 상황)의 초안을 서버에서 받아 이 브라우저 사본에 넣는다 */
export async function pullDraft(project: string, version: string): Promise<void> {
  const server = await getDraft<DraftState>(project, version)
  if (server.state) writeStore(draftKey(project, version), server.state)
}

export function useDraft(design: Design, project: string, version: string, canSave = true) {
  const key = draftKey(project, version)
  const [state, setState] = useState<DraftState>(() => readStore<DraftState>(key) ?? EMPTY)
  const [save, setSave] = useState<SaveStatus>('saved')
  const [savedAt, setSavedAt] = useState<string | undefined>(() => readStore<DraftState>(key)?.updatedAt)
  const [sync, setSync] = useState<DraftSync>({ status: 'loading' })
  // 저장소에서 읽은 그대로인 상태는 다시 쓰지 않는다 (손대지 않은 버전이 '편집 중'으로 잡히지 않게)
  const loaded = useRef<{ key: string; state: DraftState }>({ key, state })
  const rev = useRef(0)            // 서버 초안의 rev (저장할 때 함께 보내 늦은 저장을 막는다)
  const ready = useRef(false)      // 서버 초안을 읽기 전에는 서버에 쓰지 않는다 (옛 사본으로 덮지 않게)

  const inflight = useRef(false)
  const queued = useRef<DraftState | null>(null)   // 저장 중에 또 바뀐 내용 (끝나면 새 rev로 이어서 보낸다)
  const push = useCallback((next: DraftState) => {
    if (!canSave || !ready.current) return
    if (inflight.current) { queued.current = next; return }
    inflight.current = true
    setSync((s) => ({ ...s, status: 'saving' }))
    saveDraft(project, version, next, rev.current)
      .then((r) => {
        rev.current = r.rev
        setSync({ status: 'synced', by: r.updated_by?.name, at: r.updated_at })
      })
      .catch((e) => {
        queued.current = null
        setSync(e instanceof ApiError && e.status === 409
          ? { status: 'conflict', message: e.message }
          : e instanceof ApiError && e.status === 403
            ? { status: 'readonly', message: e.message }
            : { status: 'error', message: (e as Error).message })
      })
      .finally(() => {
        inflight.current = false
        const more = queued.current
        queued.current = null
        if (more) push(more)
      })
  }, [canSave, project, version])

  // 서버 초안을 읽는다 (버전을 바꾸거나 '다시 불러오기'). 서버에 없고 이 브라우저에만 수정이 있으면 올린다
  const pull = useCallback(() => {
    ready.current = false
    setSync({ status: 'loading' })
    getDraft<DraftState>(project, version).then((server) => {
      rev.current = server.rev
      ready.current = true
      const local = readStore<DraftState>(key)
      if (server.state) {
        writeStore(key, server.state)
        loaded.current = { key, state: server.state }
        setState(server.state)
        setSync({ status: canSave ? 'synced' : 'readonly', by: server.updated_by?.name, at: server.updated_at })
      } else {
        setSync({ status: canSave ? 'synced' : 'readonly' })
        if (local && canSave && local.updatedAt) push(local)
      }
    }).catch((e) => { ready.current = true; setSync({ status: 'error', message: (e as Error).message }) })
  }, [project, version, key, canSave, push])

  useEffect(() => {
    if (loaded.current.key !== key) {
      const next = readStore<DraftState>(key) ?? EMPTY
      loaded.current = { key, state: next }
      setState(next)
      setSave('saved')
    }
    pull()
  }, [key, pull])

  // 입력할 때마다 큰 객체를 쓰지 않도록 잠깐 모아서 이 브라우저에, 조금 더 모아서 서버에 저장한다
  useEffect(() => {
    if (state === loaded.current.state) return
    setSave('saving')
    const t = window.setTimeout(() => {
      const ok = writeStore(key, state)
      setSave(ok ? 'saved' : 'unsaved')
      if (ok) setSavedAt(new Date().toISOString())
    }, 400)
    const s = window.setTimeout(() => push(state), SERVER_DELAY)
    return () => { window.clearTimeout(t); window.clearTimeout(s) }
  }, [key, state, push])

  // 이 단계를 고칠 권한이 없으면 편집을 받지 않는다 (서버도 막지만 화면에서 고친 것처럼 보이지 않게)
  const update = useCallback((fn: (s: DraftState) => DraftState) => {
    if (!canSave) return
    setState((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }))
  }, [canSave])

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

  const setDisposition = useCallback((issueId: string, choice: DispositionChoice | null, note?: string) => {
    update((s) => {
      const { [issueId]: current, ...rest } = s.dispositions ?? {}
      if (!choice) return { ...s, dispositions: rest }
      return { ...s, dispositions: { ...rest, [issueId]: { choice, note: note ?? current?.note ?? '' } } }
    })
  }, [update])

  // 확정은 누르자마자 다른 버전 화면으로 넘어가므로(이 화면이 사라져 지연 저장이 취소됨) 바로 쓴다.
  // updatedAt을 확정 시각과 같게 두어 '확정(내보내기) 뒤 고친 것'을 updatedAt > at으로 알 수 있게 한다
  const finalize = useCallback((page: ConfirmStage) => {
    const at = new Date().toISOString()
    const next = { ...state, finalized: [...(state.finalized ?? []).filter((f) => f.page !== page), { page, at }], updatedAt: at }
    writeStore(key, next)
    loaded.current = { key, state: next }
    setState(next)
    push(next)   // 확정 기록은 서버에도 바로 (화면이 곧 다른 버전으로 넘어간다)
  }, [key, state, push])

  /** '저장' 버튼: 기다리지 않고 바로 쓴다 (백엔드가 생기면 서버 초안 저장으로 바꾼다) */
  const saveNow = useCallback((): boolean => {
    const ok = writeStore(key, state)
    setSave(ok ? 'saved' : 'unsaved')
    if (ok) setSavedAt(new Date().toISOString())
    push(state)
    return ok
  }, [key, state, push])

  const reset = useCallback(() => {
    removeStore(key)
    loaded.current = { key, state: EMPTY }
    setState(EMPTY)
    setSave('saved')
    push(EMPTY)   // 함께 고치는 서버 초안도 비운다
  }, [key, push])

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
    sync,
    reloadServer: pull,
    readOnly: !canSave,
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
    setDisposition,
    finalize,
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
