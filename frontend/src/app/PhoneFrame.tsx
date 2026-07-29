import type { ReactNode } from 'react'
import styles from './PhoneFrame.module.css'

interface PhoneFrameProps {
  children: ReactNode
}

/**
 * 앱 전체에서 유일한 반응형 분기점. 768px 초과(데스크톱)에서는 화면 중앙에
 * iPhone 14 Pro 크기(390x844) 폰 프레임을 렌더링하고, 768px 이하(모바일)에서는
 * 프레임 없이 전체화면으로 렌더링한다. 내부 화면들은 이 컴포넌트 덕분에 항상
 * 390px 폭 기준 레이아웃 하나만 가지면 되고, 각자 미디어쿼리를 두지 않는다.
 */
export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className={styles.page}>
      <div className={styles.aside} aria-hidden="true">
        <span className={styles.asideName}>KB 미리봄</span>
        <p className={styles.asideTag}>내 상황, 결과를 미리 보는 금융분쟁 상담</p>
      </div>
      <div className={styles.frame}>
        <div className={styles.notch} aria-hidden="true" />
        <div className={styles.viewport}>{children}</div>
      </div>
    </div>
  )
}
