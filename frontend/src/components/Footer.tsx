import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p className={styles.disclaimer}>
        본 서비스는 법률 자문이 아닌 참고 정보입니다. 실제 분쟁 대응은 금융감독원 또는
        법률 전문가와 상담하시기 바랍니다.
      </p>
      <div className={styles.meta}>
        <span>© 2026 KB Guardian</span>
        <span className={styles.dot} aria-hidden="true">·</span>
        <span>데이터 출처: 금융감독원 분쟁조정 사례, 금융소비자보호법</span>
      </div>
    </footer>
  )
}
