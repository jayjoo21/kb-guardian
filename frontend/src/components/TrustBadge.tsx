import { Bot } from 'lucide-react'
import styles from './TrustBadge.module.css'

/** 9-3 신뢰 뱃지 — "전문가 감수" 등 오해 소지 표현은 절대 쓰지 않고, AI가 만든
    참고 정보이며 법률 자문이 아니라는 사실만 상시 표시한다. */
export function TrustBadge() {
  return (
    <span className={styles.badge}>
      <Bot size={12} aria-hidden="true" />
      AI 분석 · 법률 자문 아님
    </span>
  )
}
