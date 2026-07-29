import { useState, type FormEvent } from 'react'
import { TopAppBar } from '../app/TopAppBar'
import { TextField } from '../components/TextField'
import { Checkbox } from '../components/Checkbox'
import { BottomCTA } from '../app/BottomCTA'
import { signup } from '../lib/auth'
import styles from './SignupScreen.module.css'

interface SignupScreenProps {
  onBack: () => void
  onSignedUp: () => void
}

interface FieldErrors {
  username?: string
  password?: string
  passwordConfirm?: string
  name?: string
  phone?: string
  terms?: string
}

// 데모용 목업 회원가입 — 실제 서버 저장이 없다(src/lib/auth.ts, localStorage만 사용).
// 유효성 검사를 통과하면 즉시 로그인 상태로 저장하고 홈으로 이동한다.
export function SignupScreen({ onBack, onSignedUp }: SignupScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})

  const allAgreed = agreeTerms && agreePrivacy

  function toggleAll(checked: boolean) {
    setAgreeTerms(checked)
    setAgreePrivacy(checked)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const next: FieldErrors = {}
    if (!username.trim()) next.username = '아이디를 입력해주세요.'
    if (!password.trim()) next.password = '비밀번호를 입력해주세요.'
    if (!passwordConfirm.trim()) next.passwordConfirm = '비밀번호 확인을 입력해주세요.'
    else if (password !== passwordConfirm) next.passwordConfirm = '비밀번호가 일치하지 않습니다.'
    if (!name.trim()) next.name = '이름을 입력해주세요.'
    if (!phone.trim()) next.phone = '휴대폰번호를 입력해주세요.'
    if (!agreeTerms || !agreePrivacy) next.terms = '약관에 모두 동의해주세요.'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    signup({ username, password, name, phone })
    onSignedUp()
  }

  return (
    <form className={styles.screen} onSubmit={handleSubmit}>
      <TopAppBar title="회원가입" onBack={onBack} />
      <div className={styles.body}>
        <TextField
          label="아이디"
          value={username}
          onChange={setUsername}
          placeholder="아이디를 입력하세요"
          error={errors.username}
          autoComplete="username"
        />
        <TextField
          label="비밀번호"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="비밀번호를 입력하세요"
          error={errors.password}
          autoComplete="new-password"
        />
        <TextField
          label="비밀번호 확인"
          type="password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          placeholder="비밀번호를 다시 입력하세요"
          error={errors.passwordConfirm}
          autoComplete="new-password"
        />
        <TextField
          label="이름"
          value={name}
          onChange={setName}
          placeholder="이름을 입력하세요"
          error={errors.name}
          autoComplete="name"
        />
        <TextField
          label="휴대폰번호"
          type="tel"
          value={phone}
          onChange={setPhone}
          placeholder="- 없이 입력하세요"
          error={errors.phone}
          autoComplete="tel"
        />

        <div className={styles.terms}>
          <Checkbox checked={allAgreed} onChange={toggleAll}>
            <span className={styles.allAgree}>전체 동의</span>
          </Checkbox>
          <div className={styles.termsList}>
            <Checkbox checked={agreeTerms} onChange={setAgreeTerms}>
              서비스 이용약관 동의 (필수)
            </Checkbox>
            <Checkbox checked={agreePrivacy} onChange={setAgreePrivacy}>
              개인정보 처리방침 동의 (필수)
            </Checkbox>
          </div>
          {errors.terms && <p className={styles.termsError}>{errors.terms}</p>}
        </div>
      </div>

      <BottomCTA label="가입하기" type="submit" />
    </form>
  )
}
