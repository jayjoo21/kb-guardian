import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import styles from './Checkbox.module.css'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}

/** 커스텀 체크박스 — 네이티브 input은 접근성용으로 시각적으로만 숨기고, 실제 보이는
    박스는 체크 시 옐로 배경 + 가벼운 스케일 팝 애니메이션(reduced-motion 존중). */
export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className={styles.row}>
      <span className={styles.boxWrap}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={styles.input}
        />
        <span className={`${styles.box} ${checked ? styles.boxChecked : ''}`} aria-hidden="true">
          <Check className={styles.checkIcon} size={14} strokeWidth={3} />
        </span>
      </span>
      <span className={styles.text}>{children}</span>
    </label>
  )
}
