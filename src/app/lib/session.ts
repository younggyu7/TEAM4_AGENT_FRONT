import { useCallback, useState } from 'react'
import { readStore, removeStore, writeStore } from './storage'

// 백엔드 인증이 붙기 전의 개발용 로그인. 비밀번호는 저장하지 않고, 이 브라우저에 사용자 표시 정보만 남긴다.
// FastAPI 인증이 생기면 signIn을 POST /api/auth/login 호출로 바꾸고 토큰은 httpOnly 쿠키로 받는다.

export interface User {
  name: string
  email: string
  role: string
}

const KEY = 'session'

export function useSession() {
  const [user, setUser] = useState<User | null>(() => readStore<User>(KEY))

  const signIn = useCallback((email: string, remember: boolean) => {
    const local = email.split('@')[0] ?? email
    const next: User = { name: local, email, role: '설계 검토 담당' }
    if (remember) writeStore(KEY, next)
    setUser(next)
  }, [])

  const signOut = useCallback(() => {
    removeStore(KEY)
    setUser(null)
  }, [])

  return { user, signIn, signOut }
}

export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  // 한글 이름은 앞 두 글자, 영문은 앞 두 글자 대문자
  return /[가-힣]/.test(trimmed) ? trimmed.slice(0, 2) : trimmed.slice(0, 2).toUpperCase()
}
