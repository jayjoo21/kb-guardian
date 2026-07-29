import type { ReactNode } from 'react'
import styles from './BottomSheet.module.css'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/** 폰 프레임 내부 기준으로만 덮는 바텀시트(PhoneFrame의 .viewport가 position:relative라
    absolute가 프레임 밖으로 새지 않는다). 배경 탭 또는 닫기 버튼으로 닫힌다. */
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  if (!open) return null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        {children}
        <button type="button" className={styles.close} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  )
}
