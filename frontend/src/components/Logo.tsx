import styles from './Logo.module.css'

interface LogoProps {
  /** 최초 1회 점화 애니메이션(로딩 화면 전용) */
  ignite?: boolean
  size?: number
}

/** 옐로 마크 — 그래프의 "활성 노드"와 같은 조형(채움+잉크 테두리)을 브랜드 마크로 재사용 */
export function LogoMark({ ignite = false, size = 20 }: LogoProps) {
  return (
    <span
      className={`${styles.mark} ${ignite ? styles.ignite : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

export function Logo({ ignite = false }: { ignite?: boolean }) {
  return (
    <div className={styles.lockup}>
      <LogoMark ignite={ignite} />
      <span className={styles.wordmark}>
        KB Guardian
        <span className={styles.tagline}>금융분쟁 근거 탐색</span>
      </span>
    </div>
  )
}
