import type { VersionRecord } from '../../types'
import type { StagePage } from './route'

// 버전 번호와 단계 (팀 규칙: 단계별로 번호를 이어 붙인다)
//   v1      기능 명세 (요구사항·기능 명세를 만든 실행)
//   v1.2    그 기능 명세로 만든 ERD (같은 기능 명세에서 다시 만들면 v1.1, v1.2 …)
//   v1.2.1  그 ERD로 확정한 최종 산출물
// 예전 전체 실행(v1~v4)은 기능 명세와 ERD를 함께 만들었으므로 v1 안에도 ERD 초안이 들어 있다.
// 기능 명세를 다시 만든 버전(답 AI로 반영·다시 만들기·내보낸 뒤 고쳐 다시 내보내기, stage = function_designer)은
// 다음 최상위 번호(v2)를 받는다: 그 아래가 ERD(v2.1), 그 아래가 최종(v2.1.1).
// 예전 버전에는 기준 아래 번호(v1.3)인 기능 명세도 있다: 그 아래가 ERD(v1.3.1), 그 아래가 최종(v1.3.1.1).

export const STAGE_OF_DEPTH: StagePage[] = ['spec', 'erd', 'final']
const SPEC_STAGE = 'function_designer'

export const depth = (v: string) => v.split('.').length - 1

/** 앞에서 n+1개 마디까지 자른 번호 (truncate('1.2.1', 1) = '1.2') */
export const truncate = (v: string, d: number) => v.split('.').slice(0, d + 1).join('.')

const isSpecRerun = (versions: VersionRecord[], v: string) =>
  versions.some((r) => r.design_version === v && r.stage === SPEC_STAGE)

/** v가 속한 기능 명세 버전: 계보에서 가장 가까운 '기능 명세 다시 만들기' 버전, 없으면 맨 앞 번호 */
export function specOf(versions: VersionRecord[], v: string): string {
  for (let d = depth(v); d >= 1; d--) {
    const p = truncate(v, d)
    if (isSpecRerun(versions, p)) return p
  }
  return truncate(v, 0)
}

/** 기능 명세 버전에서 몇 단계 아래인지 (0 기능 명세, 1 ERD, 2 최종) */
export const levelOf = (versions: VersionRecord[], v: string) => depth(v) - depth(specOf(versions, v))

export function stageOf(versions: VersionRecord[], v: string): StagePage {
  return STAGE_OF_DEPTH[Math.min(levelOf(versions, v), 2)]
}

/** 바로 아래 번호 버전들 (v1 → v1.1, v1.2 …), 최신이 먼저 */
export function childrenOf(versions: VersionRecord[], parent: string): VersionRecord[] {
  const d = depth(parent) + 1
  return versions
    .filter((v) => depth(v.design_version) === d && v.design_version.startsWith(parent + '.'))
    .sort((a, b) => compare(b.design_version, a.design_version))
}

/** 기능 명세 버전으로 만든 ERD들 (같은 번호 아래의 '기능 명세 다시 만들기' 버전은 뺀다), 최신이 먼저 */
export function erdsOf(versions: VersionRecord[], spec: string): VersionRecord[] {
  return childrenOf(versions, spec).filter((v) => v.stage !== SPEC_STAGE)
}

export function compare(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1)
    if (d) return d
  }
  return 0
}

/**
 * 각 단계로 갈 때 열 버전. 지금 보는 버전의 계보를 따른다.
 *   기능 명세 → 계보의 기능 명세 번호 / ERD → 지금 ERD 번호, 없으면 그 기능 명세의 최신 ERD, 그것도 없으면 기능 명세 버전(함께 만든 초안)
 *   최종 산출물 → 지금 최종 번호, 없으면 그 ERD의 최신 최종본, 없으면 ERD 버전(확정 전 미리 보기)
 */
export function stageTargets(versions: VersionRecord[], current: string): Record<StagePage, string> {
  const spec = specOf(versions, current)
  const level = depth(current) - depth(spec)
  const erd = level >= 1 ? truncate(current, depth(spec) + 1) : erdsOf(versions, spec)[0]?.design_version ?? spec
  const final = level >= 2 ? current : (erd !== spec ? childrenOf(versions, erd)[0]?.design_version : undefined) ?? erd
  return { spec, erd, final }
}

/** 단계 화면의 오른쪽 '설계 버전' 목록: 그 단계 번호만, 계보에 맞춰 */
export function stageVersions(versions: VersionRecord[], page: StagePage, current: string): VersionRecord[] {
  if (page === 'spec') return versions.filter((v) => levelOf(versions, v.design_version) === 0).sort((a, b) => compare(b.design_version, a.design_version))
  const spec = specOf(versions, current)
  if (page === 'erd') {
    const own = versions.find((v) => v.design_version === spec && v.stage !== SPEC_STAGE)
    // 예전 전체 실행의 기능 명세 버전에는 함께 만든 ERD 초안이 있어 목록 끝에 둔다
    return [...erdsOf(versions, spec), ...(own ? [own] : [])]
  }
  const erd = levelOf(versions, current) >= 1 ? truncate(current, depth(spec) + 1) : current
  return childrenOf(versions, erd)
}
