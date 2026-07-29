// 데모용 목업 인증 — 실제 서버 검증이 전혀 없다. 아이디/비밀번호에 값이 있으면
// 무조건 통과시키고 localStorage에 로그인 상태를 저장한다. 프로덕션 인증 방식이
// 아니라 심사·데모 목적의 화면/흐름 시연용이다.
const AUTH_KEY = 'kb-mirybom-auth'
const REMEMBER_KEY = 'kb-mirybom-remember-id'

export interface StoredUser {
  username: string
  name: string
}

export type AuthResult = { ok: true } | { ok: false; message: string }

export function login(username: string, password: string): AuthResult {
  if (!username.trim() || !password.trim()) {
    return { ok: false, message: '아이디와 비밀번호를 입력해주세요.' }
  }
  const user: StoredUser = { username: username.trim(), name: username.trim() }
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  return { ok: true }
}

interface SignupInput {
  username: string
  password: string
  name: string
  phone: string
}

export function signup(input: SignupInput): AuthResult {
  const user: StoredUser = { username: input.username.trim(), name: input.name.trim() }
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  return { ok: true }
}

// "로그인 없이 둘러보기"도 로그인 상태로 저장한다 — 새로고침·뒤로가기 시 매번
// 로그인 화면으로 튕기지 않도록 하기 위함(심사·데모 진입 경로를 매끄럽게 유지).
export function loginAsGuest(): void {
  const user: StoredUser = { username: 'guest', name: '게스트' }
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
}

export function isLoggedIn(): boolean {
  return localStorage.getItem(AUTH_KEY) !== null
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY)
}

export function getRememberedId(): string {
  return localStorage.getItem(REMEMBER_KEY) ?? ''
}

export function setRememberedId(id: string | null): void {
  if (id) localStorage.setItem(REMEMBER_KEY, id)
  else localStorage.removeItem(REMEMBER_KEY)
}
