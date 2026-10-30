// localStorage는 사생활 보호 모드·차단 설정에서 예외를 던지거나 비어 있을 수 있다. 화면은 저장 없이도 동작해야 한다.
const PREFIX = 'req-agent.'

export function readStore<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** 저장에 성공했는지 돌려준다 (실패하면 화면에 '저장 안 됨'을 보여준다) */
export function writeStore(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeStore(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}

export function listStoreKeys(prefix: string): string[] {
  try {
    return Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .map((k) => k.slice(PREFIX.length))
  } catch {
    return []
  }
}
