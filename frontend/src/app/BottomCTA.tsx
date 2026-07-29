import type { ReactNode } from 'react'
import styles from './BottomCTA.module.css'

interface BottomCTAProps {
  label: string
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
  /** 버튼 아래 함께 고정될 보조 콘텐츠(링크 등) */
  children?: ReactNode
}

/** KB 앱 공통 하단 고정 CTA — 옐로 풀폭 버튼, 화면 하단에 sticky. */
export function BottomCTA({ label, type = 'button', onClick, disabled, children }: BottomCTAProps) {
  return (
    <div className={styles.wrap}>
      <button type={type} className={styles.cta} onClick={onClick} disabled={disabled}>
        {label}
      </button>
      {children}
    </div>
  )
}
