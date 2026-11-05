import { useCallback, useEffect, useState } from 'react'
import { AUTH_EXPIRED, getMe, login, logout, type Member, type Permission } from '../../api'
import { removeStore } from './storage'

// 로그인 세션: 백엔드(POST /auth/login)가 httpOnly 쿠키로 준다. 화면은 GET /auth/me로 누구인지·무엇을 할 수 있는지만 안다.
// 권한 검사는 서버가 다시 하므로, 화면의 can()은 버튼을 끄고 이유를 보여 주는 용도다.

export type User = Member

/** 이 회원이 그 일을 할 수 있는지 (백엔드 app/core/auth.py PERMISSIONS와 같은 이름) */
export const can = (user: User | null | undefined, permission: Permission) => Boolean(user?.permissions.includes(permission))

/** 권한이 없을 때 버튼에 보여 줄 이유 */
export const NEEDS: Record<Permission, string> = {
  upload: '새 문서 업로드는 기획 파트원·기획 파트장·팀장만 할 수 있습니다',
  spec_edit: '기능 명세 수정은 기획 파트원·기획 파트장·팀장만 할 수 있습니다',
  spec_confirm: '기능 명세 확정(내보내기)은 기획 파트장·팀장만 할 수 있습니다',
  erd_edit: 'ERD 수정은 데이터 파트원·데이터 파트장·팀장만 할 수 있습니다',
  erd_confirm: 'ERD 최종 확정은 데이터 파트장·팀장만 할 수 있습니다',
  final_decide: '최종 승인·수정 지시와 기술 스택은 팀장만 정할 수 있습니다',
  develop: '최종 개발하기·합치기·원격 올리기는 개발 파트장만 할 수 있습니다',
  preview_stop: '실행 미리보기 끄기는 팀장·개발 파트장만 할 수 있습니다',
  repo_write: '브랜치·코드 고치기·저장하기·합치기 요청은 개발 파트원·개발 파트장만 할 수 있습니다',
  app_accounts: '앱 시연 계정은 개발 파트원·개발 파트장·팀장만 볼 수 있습니다',
  project_delete: '프로젝트 삭제는 팀장만 할 수 있습니다',
}

export function useSession() {
  // undefined: 확인 중 · null: 로그인 안 함
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    removeStore('session')   // 예전 개발용 로그인이 남긴 표시 정보
    getMe().then(setUser).catch(() => setUser(null))
    const expired = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED, expired)
    return () => window.removeEventListener(AUTH_EXPIRED, expired)
  }, [])

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    setUser(await login(email, password, remember))
  }, [])

  const signOut = useCallback(() => {
    logout().catch(() => undefined).finally(() => setUser(null))
  }, [])

  return { user, signIn, signOut }
}

export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  // 한글 이름은 앞 두 글자, 영문은 앞 두 글자 대문자
  return /[가-힣]/.test(trimmed) ? trimmed.slice(0, 2) : trimmed.slice(0, 2).toUpperCase()
}
