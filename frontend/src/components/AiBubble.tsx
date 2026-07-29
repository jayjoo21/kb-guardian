import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import styles from './AiBubble.module.css'

interface AiBubbleProps {
  children: ReactNode
}

/** AI 쪽 말풍선 — 홈 입력, 로딩 화면 되묻기(①)에서 "대화형으로 포장"할 때 쓰는
    공통 조각. 실제로 서버가 낸 문장(질문 안내문·decision_reason)만 넣는다 —
    이 컴포넌트 자체는 문구를 지어내지 않는다. */
export function AiBubble({ children }: AiBubbleProps) {
  return (
    <div className={styles.row}>
      <span className={styles.avatar} aria-hidden="true">
        <Sparkles size={13} />
      </span>
      <p className={styles.bubble}>{children}</p>
    </div>
  )
}
