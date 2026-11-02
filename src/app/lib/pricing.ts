import type { Usage } from './data'

// 모델별 토큰 단가 (USD / 1M 토큰, Anthropic 1st-party API 정가, 2026-10-06 기준).
// 캐시 읽기는 입력 단가의 0.1배, 캐시 쓰기(5분 캐시)는 1.25배 (공개 단가가 따로 있으면 그 값).
// Haiku 5.5는 요청 하나의 입력이 100K 토큰 이하일 때 단가다 (넘으면 $0.50 / $2.50). 보고서에는 합계만 있어 이 단가로 센다.
// 여기 없는 모델(OpenAI 등)은 단가를 모르므로 금액에서 빼고 '단가 미등록'으로 표시한다.
const PRICES: Record<string, { input: number; output: number; cacheRead?: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50 },
}

/** 날짜가 붙은 ID(claude-haiku-4-5-20251001)도 같은 모델로 본다 */
function priceOf(model?: string) {
  if (!model) return undefined
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model === k || model.startsWith(`${k}-`))
  return key ? PRICES[key] : undefined
}

/** 한 버전의 비용(USD). 모델 기록이 없거나 단가를 모르면 undefined */
export function costOf(usage: Usage): number | undefined {
  const p = priceOf(usage.model)
  if (!p) return undefined
  const cacheRead = p.cacheRead ?? p.input * 0.1
  return (usage.input * p.input + usage.output * p.output
    + (usage.cacheRead ?? 0) * cacheRead + (usage.cacheWrite ?? 0) * p.input * 1.25) / 1_000_000
}

/** 화면용 짧은 모델 이름: claude-haiku-5-5 → Haiku 5.5 (모르는 형식은 그대로) */
export function shortModel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-\d{8})?$/.exec(model)
  if (!m) return model
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[3] ? `${m[2]}.${m[3]}` : m[2]}`
}

/** $0.0123 / $1.23: 작은 금액도 0으로 보이지 않게 */
export function usd(n: number): string {
  return n < 0.01 ? `$${n.toFixed(4)}` : n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString('en-US')}`
}
