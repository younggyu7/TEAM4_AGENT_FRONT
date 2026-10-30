import type { Design, FunctionSpec } from '../../types'

// 기능 명세를 Agent에 넘길 Markdown. 백엔드 exporter.py의 _functions_md와 같은 모양으로 써서
// Agent(또는 백엔드 파서)가 CLI가 만든 functions.md와 똑같이 읽을 수 있게 한다.

const cell = (text: unknown) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>')

function table(headers: string[], rows: unknown[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    '|' + '---|'.repeat(headers.length),
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n')
}

export function functionsMd(design: Design, functions: FunctionSpec[], note: string): string {
  const titles = new Map(design.requirements.map((r) => [r.requirement_id, r.title]))
  const doc = design.meta.document
  const head = `> 문서: ${doc.file_name} (\`${doc.document_id}\` / ${doc.document_version})  \n`
    + `> 프로젝트: **${design.meta.project ?? ''}** · 기준 설계 버전: **v${design.meta.design_version}** · ${note}\n`
  const out = ['# 기능 명세서', '', head, '## 기능 목록', '',
    table(['기능 ID', '기능명', '근거 요구사항', '액터', '데이터 객체'],
      functions.map((f) => [f.function_id, f.name, f.requirement_ids.join(', '), f.actors.filter(Boolean).join(', '), f.data_objects.join(', ')])), '']
  for (const f of functions) {
    out.push(`## ${f.function_id} ${f.name}`, '', f.description, '',
      '- 근거 요구사항: ' + f.requirement_ids.map((id) => `${id}(${titles.get(id) ?? ''})`).join(', '),
      '- 관련 비기능 요구사항: ' + (f.nfr_ids.join(', ') || '없음'),
      '- 액터: ' + (f.actors.filter(Boolean).join(', ') || '-'),
      '- 사전 조건: ' + (f.preconditions.filter(Boolean).join('; ') || '-'),
      '- 데이터 객체: ' + (f.data_objects.join(', ') || '없음'), '')
    const inputs = f.inputs.filter((i) => i.name.trim())
    const outputs = f.outputs.filter((o) => o.name.trim())
    if (inputs.length) out.push('**입력**', '', table(['항목', '설명', '필수'], inputs.map((i) => [i.name, i.description, i.required ? 'Y' : 'N'])), '')
    if (outputs.length) out.push('**출력**', '', table(['항목', '설명'], outputs.map((o) => [o.name, o.description])), '')
    const rules = f.business_rules.filter((b) => b.trim())
    if (rules.length) out.push('**업무 규칙**', '', ...rules.map((b) => `- ${b}`), '')
    const steps = f.normal_flow.filter((s) => s.trim()).map((s) => s.replace(/^\s*\d+\s*[.)]\s*/, ''))
    if (steps.length) out.push('**정상 흐름**', '', ...steps.map((s, i) => `${i + 1}. ${s}`), '')
    const ex = f.exception_flows.filter((e) => e.condition.trim() || e.handling.trim())
    if (ex.length) out.push('**예외 흐름**', '', table(['조건', '처리'], ex.map((e) => [e.condition, e.handling])), '')
  }
  return out.join('\n') + '\n'
}

const FIELD_LABEL: Partial<Record<keyof FunctionSpec, string>> = {
  name: '이름', description: '설명', actors: '행위자', preconditions: '선행 조건', inputs: '입력', outputs: '출력',
  business_rules: '업무 규칙', normal_flow: '처리 순서', exception_flows: '예외 처리',
}

/** 바뀐 기능과 칸 (백엔드가 수정본을 받지 못할 때 Agent 의견으로 넘기는 요약에도 쓴다) */
export function specChanges(original: FunctionSpec[], edited: Record<string, FunctionSpec>): { id: string; name: string; fields: string[] }[] {
  return Object.values(edited).flatMap((f) => {
    const before = original.find((o) => o.function_id === f.function_id)
    if (!before) return []
    const fields = (Object.keys(FIELD_LABEL) as (keyof FunctionSpec)[])
      .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(f[k]))
      .map((k) => FIELD_LABEL[k]!)
    return fields.length ? [{ id: f.function_id, name: f.name, fields }] : []
  })
}

export function specChangeText(original: FunctionSpec[], edited: Record<string, FunctionSpec>, limit = 1800): string {
  const lines = specChanges(original, edited).map((c) => {
    const f = edited[c.id]
    const rules = f.business_rules.filter((b) => b.trim()).slice(0, 6).map((b) => `  · ${b}`).join('\n')
    return `- ${c.id} ${c.name}: ${c.fields.join(', ')} 수정${c.fields.includes('업무 규칙') && rules ? `\n${rules}` : ''}`
  })
  const text = lines.length ? `기능 명세 수정 ${lines.length}건 (이 수정에 맞게 데이터 설계를 고쳐 주세요)\n${lines.join('\n')}` : ''
  return text.length > limit ? text.slice(0, limit) + '\n…' : text
}
