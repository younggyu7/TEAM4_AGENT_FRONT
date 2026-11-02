import { BookOpen, Check, Copy, DownloadSimple } from '@phosphor-icons/react'
import { useState } from 'react'
import type { Design } from '../../types'
import { Markdown } from '../components/Markdown'
import { Badge, Button, cx, Empty, ErrorNote, fmt, Loading } from '../components/ui'
import { DEV_SPEC_FILES, fileUrl } from '../lib/artifacts'
import { useFile, useSpecFormat } from '../lib/data'
import type { Page } from '../lib/route'

// 산출물 보기 → 개발 스펙: 'ERD 최종 확정'으로 만든 최종본에 생긴 개발 AI용 문서 9개를 읽는 순서대로 보여 주고,
// 그 문서들의 형식 정의(backend/SPEC_FORMAT.md)도 같은 자리에서 본다. 문서를 고르면 주소(#/…/dev-spec/<파일>)에 남는다.

const FORMAT = 'SPEC_FORMAT.md'
const BASIS_LABEL: Record<string, string> = {
  원문: '원문에 정해짐', 확정: '고객 답으로 확정', 가정: '추천안으로 가정 — 확인 필요', 없음: '아키텍처 요약 없음',
}

export function DevSpecView({ design, project, version, focus, onOpen }: {
  design: Design
  project: string
  version: string
  focus?: string
  onOpen: (page: Page, focus?: string) => void
}) {
  const meta = design.meta.dev_spec
  if (!meta) {
    return (
      <Empty title={`v${version}에는 개발 스펙이 없습니다`}
        action={<Button size="sm" variant="secondary" onClick={() => onOpen('final')}>최종 산출물로 가기</Button>}>
        개발 스펙은 'ERD 최종 확정'으로 만든 최종본(v&lt;ERD&gt;.1 …)에만 생깁니다 (API 설계 Agent가 그때 한 번 돕니다).
      </Empty>
    )
  }
  const selected = focus === FORMAT ? FORMAT : DEV_SPEC_FILES.find((f) => f.name === focus)?.name ?? DEV_SPEC_FILES[0].name
  const stackQuestion = design.questions.find((q) => q.stage === 'api_designer' && q.status !== 'ANSWERED')
  const item = DEV_SPEC_FILES.find((f) => f.name === selected)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-small text-fg-2">
        <Badge tone="info">{meta.format}</Badge>
        <span>기술 스택: <strong className="text-fg">{meta.stack || '정해지지 않음'}</strong> ({BASIS_LABEL[meta.stack_basis] ?? meta.stack_basis})</span>
      </div>
      {stackQuestion && (
        <div role="note" className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-small text-warn">
          <span className="min-w-0 flex-1">
            원문에 개발 언어·프레임워크가 없어 추천안({stackQuestion.recommended})을 가정으로 썼습니다 ({stackQuestion.question_id}).
            바꾸려면 기능 명세 화면에서 이 질문에 답하고 새 버전으로 다시 만든 뒤 ERD를 다시 최종 확정하세요.
          </span>
          <Button size="sm" variant="secondary" onClick={() => onOpen('spec', stackQuestion.question_id)}>기능 명세로 가기</Button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="개발 스펙 문서" className="space-y-3">
          <ol className="space-y-1">
            {DEV_SPEC_FILES.map((f, i) => (
              <li key={f.name}>
                <button
                  type="button"
                  aria-current={selected === f.name ? 'page' : undefined}
                  onClick={() => onOpen('dev-spec', f.name)}
                  className={cx(
                    'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors duration-150',
                    selected === f.name ? 'bg-sunken text-fg' : 'text-fg-2 hover:bg-sunken hover:text-fg',
                  )}
                >
                  <span className="mt-0.5 w-4 shrink-0 font-mono text-micro text-fg-3">{i + 1}</span>
                  <span className="min-w-0">
                    <span className={cx('block text-label', selected === f.name && 'font-semibold')}>{f.label}</span>
                    <span className="block truncate font-mono text-micro text-fg-3">{f.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            aria-current={selected === FORMAT ? 'page' : undefined}
            onClick={() => onOpen('dev-spec', FORMAT)}
            className={cx(
              'flex w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-left text-label transition-colors duration-150',
              selected === FORMAT ? 'bg-sunken font-semibold text-fg' : 'text-fg-2 hover:bg-sunken hover:text-fg',
            )}
          >
            <BookOpen size={16} aria-hidden="true" />
            형식 정의 보기 ({meta.format})
          </button>
        </nav>
        <article aria-label={selected} className="min-w-0 rounded-lg border border-line p-4">
          {selected === FORMAT
            ? <FormatDoc />
            : <SpecDoc project={project} version={version} name={selected} summary={item?.summary ?? ''} />}
        </article>
      </div>
    </div>
  )
}

function SpecDoc({ project, version, name, summary }: { project: string; version: string; name: string; summary: string }) {
  const file = useFile(project, version, name)
  const [copied, setCopied] = useState(false)
  if (file.state === 'loading') return <Loading label={`${name}을 불러오는 중`} lines={10} />
  if (file.state === 'error') return <ErrorNote message={file.message} />
  if (file.data === null) return <Empty title={`이 버전에는 ${name}이 없습니다`} />
  const text = file.data
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
  const download = () => Object.assign(document.createElement('a'), {
    href: fileUrl(project, version, name), download: name.replace(/(\.\w+)$/, `.v${version}$1`),
  }).click()
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <p className="text-small text-fg-3">{summary} · {fmt(text.split('\n').length)}줄</p>
        <span className="flex gap-2">
          <Button size="sm" icon={copied ? <Check /> : <Copy />} onClick={copy}>{copied ? '복사함' : '복사'}</Button>
          <Button size="sm" icon={<DownloadSimple />} onClick={download}>받기</Button>
        </span>
      </div>
      {name.endsWith('.yaml')
        ? <pre className="max-h-[70vh] overflow-auto rounded-lg bg-sunken p-4 font-mono text-small leading-relaxed"><code>{text}</code></pre>
        : <Markdown text={text} idPrefix={name.replace(/\W/g, '-')} toc />}
    </>
  )
}

function FormatDoc() {
  const doc = useSpecFormat(true)
  if (doc.state === 'loading') return <Loading label="형식 정의를 불러오는 중" lines={10} />
  if (doc.state === 'error') return <ErrorNote message={doc.message} />
  if (doc.data === null) return <Empty title="형식 정의 파일(SPEC_FORMAT.md)을 찾지 못했습니다" />
  return (
    <>
      <p className="mb-3 border-b border-line pb-3 text-small text-fg-3">
        개발 스펙 문서 9개는 이 형식대로 코드가 만듭니다 (같은 입력이면 같은 문서). 형식을 바꾸면 번호가 올라갑니다.
      </p>
      <Markdown text={doc.data} idPrefix="spec-format" toc />
    </>
  )
}
