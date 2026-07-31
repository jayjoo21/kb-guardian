import { useState, type FormEvent } from 'react'
import { LogoMark } from '../components/Logo'
import { TextField } from '../components/TextField'
import { Checkbox } from '../components/Checkbox'
import { BottomCTA } from '../app/BottomCTA'
import { BottomSheet } from '../app/BottomSheet'
import { login, loginAsGuest, getRememberedId, setRememberedId } from '../lib/auth'
import styles from './LoginScreen.module.css'

interface LoginScreenProps {
  onLogin: () => void
  onNavigateSignup: () => void
  onSkip: () => void
}

// 데모용 목업 로그인 화면 — 실제 서버 인증이 없다(src/lib/auth.ts). 아이디/비밀번호에
// 값만 있으면 통과하고, 빈 값이면 에러 문구를 보여준다. "로그인 없이 둘러보기"는
// 로그인 상태를 저장하지 않는 별도 진입 경로(심사·데모용)다.
export function LoginScreen({ onLogin, onNavigateSignup, onSkip }: LoginScreenProps) {
  const [username, setUsername] = useState(() => getRememberedId())
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => getRememberedId() !== '')
  const [error, setError] = useState<string | null>(null)
  const [showContact, setShowContact] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = login(username, password)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setRememberedId(remember ? username : null)
    onLogin()
  }

  function handleSkip() {
    loginAsGuest()
    onSkip()
  }

  return (
    <form className={styles.screen} onSubmit={handleSubmit}>
      <div className={styles.body}>
        <div className={styles.brand}>
          <LogoMark size={72} />
          <h1 className={styles.name}>KB 미리봄</h1>
          <p className={styles.subtitle}>내 상황, 결과를 미리 보는 금융분쟁 상담</p>
        </div>

        <div className={styles.description}>
          실제 분쟁조정 사례를 바탕으로 고객님의 상황을 객관적으로 분석해 드립니다.
        </div>

        <div className={styles.fields}>
          <TextField
            label="아이디"
            value={username}
            onChange={(v) => {
              setUsername(v)
              setError(null)
            }}
            placeholder="아이디를 입력하세요"
            autoComplete="username"
          />
          <TextField
            label="비밀번호"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v)
              setError(null)
            }}
            placeholder="비밀번호를 입력하세요"
            error={error}
            autoComplete="current-password"
          />
        </div>

        <Checkbox checked={remember} onChange={setRemember}>
          아이디 저장
        </Checkbox>
      </div>

      <BottomCTA label="로그인" type="submit">
        <nav className={styles.links} aria-label="계정 관련 메뉴">
          <button type="button" className={styles.link} onClick={onNavigateSignup}>
            회원가입
          </button>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          <button type="button" className={styles.link} onClick={() => setShowContact(true)}>
            아이디 찾기
          </button>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          <button type="button" className={styles.link} onClick={() => setShowContact(true)}>
            비밀번호 찾기
          </button>
        </nav>
        <button type="button" className={styles.skip} onClick={handleSkip}>
          로그인 없이 둘러보기
        </button>
      </BottomCTA>

      <BottomSheet open={showContact} onClose={() => setShowContact(false)}>
        <p className={styles.contactMessage}>
          고객센터 1588-9999로
          <br />
          문의해 주세요
        </p>
      </BottomSheet>
    </form>
  )
}
