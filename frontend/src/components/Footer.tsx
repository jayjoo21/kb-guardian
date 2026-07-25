import styles from './Footer.module.css'

const LINKS = ['서비스 소개', '데이터 출처', '이용 안내', '개인정보 처리방침']

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.inner} container`}>
        <nav className={styles.links} aria-label="관련 링크">
          {LINKS.map((label, i) => (
            <span key={label} className={styles.linkItem}>
              <a href="#" className={styles.link}>
                {label}
              </a>
              {i < LINKS.length - 1 && (
                <span className={styles.sep} aria-hidden="true">
                  |
                </span>
              )}
            </span>
          ))}
        </nav>

        <p className={styles.disclaimer}>
          본 서비스는 법률 자문이 아닌 참고 정보입니다. 실제 분쟁 대응은 금융감독원 또는 법률
          전문가와 상담하시기 바랍니다.
        </p>

        <div className={styles.meta}>
          <span>© 2026 금융분쟁 상담 프로젝트 · KB국민은행과 무관한 비공식 프로젝트입니다</span>
          <span className={styles.dot} aria-hidden="true">
            ·
          </span>
          <span>데이터 출처: 금융감독원 분쟁조정 사례, 금융소비자보호법</span>
        </div>
      </div>
    </footer>
  )
}
