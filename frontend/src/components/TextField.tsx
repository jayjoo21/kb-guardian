import { useId, useState } from 'react'
import styles from './TextField.module.css'

interface TextFieldProps {
  label: string
  type?: 'text' | 'password' | 'tel'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: string | null
  autoComplete?: string
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a15.5 15.5 0 0 1-3.5 4.3M6.6 6.6C3.8 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

/** KB 앱 스타일 입력 필드 — 연회색 박스, 포커스 시 잉크색 테두리. type="password"면
    표시/숨김 토글이 자동으로 붙는다. */
export function TextField({ label, type = 'text', value, onChange, placeholder, error = null, autoComplete }: TextFieldProps) {
  const id = useId()
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (show ? 'text' : 'password') : type

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={`${styles.inputWrap} ${error ? styles.inputWrapError : ''}`}>
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={styles.input}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
