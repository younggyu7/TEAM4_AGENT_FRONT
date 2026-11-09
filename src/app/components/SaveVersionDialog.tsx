import { ArrowsClockwise, DownloadSimple, FloppyDisk, PaperPlaneTilt, X } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { getCapabilities } from '../../api'
import type { Design } from '../../types'
import type { Draft } from '../lib/draft'
import { startJob } from '../lib/jobs'
import { assumptionId, isRequirementQuestion, isStackQuestion, newAnswers, ruleMark } from '../lib/review'
import { functionsMd, specChanges, specChangeText } from '../lib/specMd'
import { Button, IconButton, Label, TextArea, TextInput } from './ui'

/**
 * 새 ERD 버전을 만드는 창. 입력만 받고 작업을 시작하면 닫는다 (진행 상황은 ERD 화면의 JobPanel).
 *   spec: 기능 명세 내보내기 — 수정한 기능 명세(Markdown·JSON)를 Agent에 넘겨 이 기능 명세로 ERD를 만든다 → v<N>.1 …
 *   erd : ERD 저장 — 고친 테이블을 넘겨 데이터 설계를 다시 만든다 → 같은 기능 명세 아래 다음 ERD 번호
 * spec 내보내기에 새로 답한 확인 질문이 있으면 백엔드가 LLM 없이 코드로 반영한다 (추천과 같은 답은 '결정' 표시,
 *   다른 답은 그 규칙을 답으로 바꿈). '(확인 필요)'·'(가정)' 규칙을 '추천안 맞음'·'가정 맞음'으로 확인했으면 그 규칙도 LLM 없이 '(결정)'으로 바꾼다
 *   (한 번 결정한 규칙은 기능 명세를 다시 만들어도 다시 묻지 않는다: 백엔드 function_designer.carry_decisions).
 *   aiAnswers면 ERD 대신 '답 반영'을 한다: LLM이 답이 바꾼 기능만 다시 설계 → 기능 명세 새 버전.
 *   redo면 확정한 기능 명세에서 새 기능 명세 버전을 만든다 (답이 없어도 수정·의견으로, 확정은 되돌리지 않음).
 * erd 저장에는 '확인 필요'에서 고른 의미 검토 지적 처리를 함께 넘겨 새 ERD 버전에 남긴다 (LLM 없음).
 */
export function SaveVersionDialog({ mode, aiAnswers, redo, open, onClose, draft, design, project, version, onStarted, onFinished }: {
  mode: 'spec' | 'erd'
  /** 기능 명세 화면의 'AI로 답 반영' 버튼: 새 답을 LLM으로 반영해 기능 명세 새 버전을 만든다 */
  aiAnswers?: boolean
  /** 확정한 기능 명세의 '기능 명세 다시 만들기 (새 버전)' */
  redo?: boolean
  open: boolean
  onClose: () => void
  draft: Draft
  design: Design
  project: string
  version: string
  onStarted: (kind: 'erd' | 'answers') => void
  onFinished: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const ids = { title: useId(), feedback: useId(), help: useId() }
  const [title, setTitle] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [caps, setCaps] = useState<{ design: boolean; spec_md: boolean; confirm_rules?: boolean } | null>(null)

  const editedTables = Object.values(draft.state.entities).map((e) => e.entity_id)
  const changes = useMemo(() => specChanges(design.functions, draft.state.functions), [design.functions, draft.state.functions])
  const answers = Object.values(draft.state.answers).filter((a) => a.trim()).length
  const fresh = useMemo(() => (mode === 'spec' ? newAnswers(design, draft.state) : {}), [mode, design, draft.state])
  const freshIds = Object.keys(fresh)
  // '추천안 맞음'·'가정 맞음'으로 확인한 '(확인 필요)'·'(가정)' 규칙 → 백엔드가 LLM 없이 '(결정)'으로 바꾼다 (내보내기·AI로 답 반영·다시 만들기)
  const confirms = useMemo(() => (mode === 'spec' ? draft.functions.flatMap((f) => f.business_rules
    .filter((r) => Boolean(ruleMark(r)) && draft.state.checked[assumptionId(f.function_id, r)])
    .map((rule) => ({ function_id: f.function_id, rule }))) : []), [mode, draft.functions, draft.state.checked])
  // 기능 명세 새 버전: 'AI로 답 반영'(새 답이 있을 때) 또는 확정한 기능 명세의 '다시 만들기'
  const answering = (Boolean(aiAnswers) && freshIds.length > 0) || Boolean(redo)
  const dispositions = mode === 'erd' ? draft.state.dispositions ?? {} : {}
  const disposed = Object.keys(dispositions).length
  // 추천과 다른 답 중 기능 규칙을 바꾸는 것 (기술 스택은 개발 스펙에만 쓰여 규칙을 바꾸지 않는다)
  const freshDiffer = design.questions.filter((q) => fresh[q.question_id] && !isStackQuestion(q) && fresh[q.question_id] !== (q.recommended ?? '').trim()).length
  const freshRequirement = design.questions.filter((q) => fresh[q.question_id] && isRequirementQuestion(q)).length
  const md = useMemo(
    () => (mode === 'spec' ? functionsMd(draft.merged, draft.functions, `웹에서 확정한 기능 명세 (수정 ${changes.length}건, 질문 답 ${answers}건)`) : ''),
    [mode, draft.merged, draft.functions, changes.length, answers],
  )

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      setError('')
      setTitle(mode === 'spec'
        ? redo ? `기능 명세 v${version} 다시 만들기${changes.length ? ` (수정 ${changes.length}건)` : ''}`
        : answering ? `기능 명세 v${version} 확인 반영 (질문 답 ${freshIds.length}건 · 확인한 규칙 ${confirms.length}건)`
        : `기능 명세 v${version}${changes.length ? ` 수정 ${changes.length}건` : ''} → ERD`
        : editedTables.length ? `ERD 수정: ${editedTables.slice(0, 2).join(', ')}${editedTables.length > 2 ? ` 외 ${editedTables.length - 2}개` : ''}` : '')
      if (mode === 'spec') getCapabilities().then(setCaps).catch(() => setCaps(null))
    }
    if (!open && d.open) d.close()
    // 열 때 한 번만 제목을 채운다 (입력 중에 덮어쓰지 않게 open만 본다)
  }, [open])

  const canSend = redo ? changes.length + freshIds.length + confirms.length > 0 || feedback.trim().length > 0
    : mode === 'spec' || editedTables.length > 0 || feedback.trim().length > 0
  const passesSpec = Boolean(caps?.design || caps?.spec_md)

  const submit = async () => {
    setSending(true)
    setError('')
    try {
      await startJob(
        mode === 'spec' && answering
          ? {
              project, base: version, source: 'answers', title, feedback, answers: freshIds.length ? fresh : undefined,
              confirm_rules: confirms.length ? confirms : undefined,
              // 사람이 고친 기능은 그대로 넘겨 새 버전에서도 고친 그대로 둔다 (LLM이 다시 설계하지 않음)
              functions: changes.length ? changes.map((c) => draft.state.functions[c.id]) : undefined,
            }
          : mode === 'spec'
          ? {
              project, base: version, source: 'spec', title, feedback,
              design: draft.merged, functions_md: md,
              confirm_rules: confirms.length ? confirms : undefined,
              spec_summary: specChangeText(design.functions, draft.state.functions),
            }
          : {
              project, base: version, source: 'erd', title, feedback,
              // rerun은 고친 data_model.json을 생성 당시 원본과 비교한다. 관계(relations)는 백엔드가 다시 계산한다.
              data_model: editedTables.length ? { entities: draft.entities, relations: design.data_model.relations } : undefined,
              dispositions: disposed ? dispositions : undefined,
            },
        (finished) => {
          if (finished.status === 'done' && mode === 'erd') draft.clearEntityEdits()   // 고친 테이블은 새 버전에 들어갔다
          onFinished()
        },
      )
      onClose()
      onStarted(answering ? 'answers' : 'erd')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const downloadMd = () => {
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `functions.v${version}.edited.md` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="save-title"
      onClose={onClose}
      className="m-auto w-[min(580px,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-fg backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">{answering ? 'Answers to agent' : mode === 'spec' ? 'Export to agent' : 'New version'}</p>
          <h2 id="save-title" className="mt-1 text-subtitle font-medium">
            {redo ? '기능 명세 다시 만들기 (새 버전)' : answering ? '확인 질문 답 반영 → 기능 명세 다시 만들기' : mode === 'spec' ? '기능 명세 내보내기 → ERD 만들기' : 'ERD 저장하고 새 버전 만들기'}
          </h2>
          <p className="mt-1 text-small text-fg-3">
            {answering
              ? `기능 명세 v${version} → 기능 명세 v${version}.N (답을 반영한 새 기능 명세. 확인한 뒤 다시 내보내면 ERD를 만듭니다)`
              : mode === 'spec'
              ? `기능 명세 v${version} → ERD v${version}.N (Agent가 이 기능 명세로 데이터 설계)`
              : `ERD v${version} → 같은 기능 명세 아래 다음 ERD 번호`}
          </p>
        </div>
        <IconButton label="닫기" icon={<X />} onClick={onClose} />
      </div>

      <form className="space-y-5 px-5 py-5" onSubmit={(e) => { e.preventDefault(); if (canSend) void submit() }}>
        {answering ? (
          <div className="space-y-2">
            <p className="text-label font-medium">
              새로 답한 질문 {freshIds.length}건 · 요구사항 확인 {freshRequirement}건 · 기능 명세 질문 {freshIds.length - freshRequirement}건
              {confirms.length > 0 && ` · 확인한 규칙 ${confirms.length}건`}
              {changes.length > 0 && ` · 기능 수정 ${changes.length}건`}
            </p>
            {freshIds.length > 0 && (
              <ul className="max-h-28 space-y-0.5 overflow-auto rounded-md bg-sunken px-3 py-2 text-small">
                {freshIds.map((id) => <li key={id}><span className="font-mono text-micro text-fg-3">{id}</span> {fresh[id]}</li>)}
              </ul>
            )}
            <p className="text-small text-fg-3">
              {redo && `확정한 기능 명세 v${version}는 그대로 두고, 아래 내용으로 새 기능 명세 버전(v${version}.N)을 만듭니다. `}
              요구사항 검토 Agent가 답으로 바뀐 요구사항의 충돌을 다시 확인하고, 기능 명세 Agent가 추천안과 다른 답이 바꾼 기능만 다시 설계합니다.
              추천안과 같은 답과 '추천안 맞음'·'가정 맞음'으로 확인한 규칙은 '(결정)' 표시만 합니다 (LLM 사용 없음, 다시 만들어도 다시 묻지 않음).
              {changes.length > 0 && ` 직접 고친 기능 ${changes.length}개는 고친 그대로 두고 다시 설계하지 않습니다 (의견이 없으면 LLM 사용 없음).`}
            </p>
            {redo && changes.length + freshIds.length + confirms.length === 0 && (
              <p className="text-small text-warn">고친 기능·새 답·확인한 규칙이 없으면 아래 의견에 바꿀 내용을 적어야 새 버전을 만들 수 있습니다.</p>
            )}
            {confirms.length > 0 && caps && !caps.confirm_rules && (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-small text-warn">
                지금 백엔드는 확인한 규칙을 받지 못해(rerun --confirm-rules 없음) 이번 버전에는 반영되지 않습니다.
              </p>
            )}
          </div>
        ) : mode === 'spec' ? (
          <div className="space-y-2">
            <p className="text-label font-medium">넘길 기능 명세: 기능 {draft.functions.length}개 · 수정 {changes.length}건 · 질문 답 {answers}건</p>
            {changes.length > 0 && (
              <ul className="max-h-28 space-y-0.5 overflow-auto rounded-md bg-sunken px-3 py-2 text-small">
                {changes.map((c) => <li key={c.id}><span className="font-mono text-micro text-fg-3">{c.id}</span> {c.name} — {c.fields.join(', ')}</li>)}
              </ul>
            )}
            <p className="text-small text-fg-3">
              화면에서 확정한 기능 명세(JSON)를 그대로 데이터 설계 Agent에 넘깁니다 (기능 명세는 다시 만들지 않음). 넘긴 Markdown은 새 버전 폴더에 functions.submitted.md로 남습니다.
            </p>
            {confirms.length > 0 && (
              <p className="rounded-md bg-info-soft px-3 py-2 text-small text-info">
                '추천안 맞음'·'가정 맞음'으로 확인한 규칙 {confirms.length}건은 LLM 없이 '(결정)'으로 바꿉니다.
                표시만 바뀌므로 데이터 설계 Agent는 그 기능의 테이블을 다시 설계하지 않습니다.
              </p>
            )}
            {freshIds.length > 0 && (
              <p className="rounded-md bg-info-soft px-3 py-2 text-small text-info">
                새로 답한 확인 질문 {freshIds.length}건은 LLM 없이 반영합니다: 추천안과 같은 답은 '결정' 표시만,
                다른 답 {freshDiffer}건은 그 규칙을 고른 답으로 바꿉니다.
                {freshDiffer > 0 && ' 답이 흐름·입력·데이터에도 영향을 주면 기능 명세에서 직접 고치거나, 오른쪽 위 \'AI로 답 반영\'을 쓰세요.'}
              </p>
            )}
            {caps && !passesSpec && changes.length > 0 && (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-small text-warn">
                지금 백엔드는 기능 명세 수정본을 직접 받지 못해(rerun --design·--spec-md 없음) 수정 내용을 Agent 의견으로 넘깁니다. 백엔드에 옵션이 생기면 자동으로 파일을 넘깁니다.
              </p>
            )}
            <Button size="sm" variant="ghost" icon={<DownloadSimple />} onClick={downloadMd}>넘길 Markdown 받아 보기</Button>
          </div>
        ) : (
          <div>
            <p className="text-label font-medium">바뀐 테이블 {editedTables.length}개</p>
            <p className="mt-1 font-mono text-micro text-fg-3">{editedTables.join(', ') || '없음'}</p>
            <p className="mt-1.5 text-small text-fg-3">고친 테이블은 고정되어 Agent가 다시 설계하지 않습니다. Agent는 참조 정리·검증·DDL 재생성을 합니다.</p>
            {disposed > 0 && (
              <p className="mt-1.5 rounded-md bg-info-soft px-3 py-2 text-small text-info">
                의미 검토 지적 처리 {disposed}건을 새 버전에 남깁니다 (LLM 없음). 고친 ERD만 저장하면 의미 검토를 다시 하지 않습니다.
              </p>
            )}
          </div>
        )}
        <div>
          <Label htmlFor={ids.title} hint="버전 목록에 보입니다">{answering ? '새 기능 명세 버전 제목' : '새 ERD 버전 제목'}</Label>
          <TextInput id={ids.title} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 담당자-기업 관계 정리" />
        </div>
        <div>
          <Label htmlFor={ids.feedback} hint="선택">Agent에게 남길 의견</Label>
          <TextArea id={ids.feedback} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={answering ? '예: 신청 취소는 승인 전까지만 가능하게' : '예: 담당자 테이블에 연락처 컬럼을 추가해 주세요'} aria-describedby={ids.help} />
          <p id={ids.help} className="mt-1.5 text-small text-fg-3">의견을 적으면 관련 {answering ? '기능' : '테이블'}을 Agent가 다시 설계합니다 (LLM 호출, 토큰 사용).</p>
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        {!canSend && <p className="text-small text-warn">고친 테이블이나 의견이 있어야 새 버전을 만들 수 있습니다.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" icon={answering ? <ArrowsClockwise /> : mode === 'spec' ? <PaperPlaneTilt /> : <FloppyDisk />} disabled={!canSend || sending}>
            {sending ? '시작하는 중…' : answering ? '답 반영하고 기능 명세 다시 만들기' : mode === 'spec' ? '내보내고 ERD 만들기' : '새 버전 만들기'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
