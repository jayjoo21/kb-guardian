import styles from './GraphCanvasPlaceholder.module.css'

/** 2단계에서 react-force-graph-2d로 교체된다. 지금은 노드 타입별 시각 언어
    (Case=페이퍼 원, Issue=옐로 링, LawArticle/Precedent=슬레이트 사각)를
    미리 보여주는 정적 목업. */
export function GraphCanvasPlaceholder() {
  return (
    <div className={styles.canvas}>
      <svg
        className={styles.mock}
        viewBox="0 0 320 220"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="160" y1="110" x2="90" y2="60" className={styles.edge} />
        <line x1="160" y1="110" x2="230" y2="55" className={styles.edge} />
        <line x1="160" y1="110" x2="235" y2="140" className={styles.edge} />
        <line x1="160" y1="110" x2="95" y2="160" className={styles.edge} />
        <line x1="160" y1="110" x2="150" y2="185" className={styles.edge} />

        {/* Case (중심, 활성) */}
        <circle cx="160" cy="110" r="16" className={styles.nodeCaseActive} />
        {/* Issue */}
        <circle cx="90" cy="60" r="10" className={styles.nodeIssue} />
        <circle cx="150" cy="185" r="10" className={styles.nodeIssue} />
        {/* LawArticle / Precedent */}
        <rect x="220" y="45" width="18" height="18" className={styles.nodeLaw} />
        <rect x="225" y="132" width="18" height="18" className={styles.nodeLaw} />
        {/* 유사 Case (작은 페이퍼 원) */}
        <circle cx="95" cy="160" r="7" className={styles.nodeSimilar} />
      </svg>

      <p className={styles.caption}>그래프는 2단계에서 실제 데이터로 연결됩니다</p>

      <ul className={styles.legend}>
        <li>
          <span className={`${styles.swatch} ${styles.swCase}`} /> Case
        </li>
        <li>
          <span className={`${styles.swatch} ${styles.swIssue}`} /> Issue
        </li>
        <li>
          <span className={`${styles.swatch} ${styles.swLaw}`} /> 법조항·판례
        </li>
      </ul>
    </div>
  )
}
