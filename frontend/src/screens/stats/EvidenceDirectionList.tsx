import { FileCheck, TrendingUp, TrendingDown } from 'lucide-react'
import type { EvidenceTypeOverview } from '../../lib/api'
import styles from './EvidenceDirectionList.module.css'

function DirectionIcon({ favorable }: { favorable: boolean }) {
  return (
    <span
      className={`${styles.direction} ${favorable ? styles.favorable : styles.unfavorable}`}
      role="img"
      aria-label={favorable ? '유리하게 작용' : '불리하게 작용'}
    >
      {favorable ? <TrendingUp size={14} strokeWidth={2.2} /> : <TrendingDown size={14} strokeWidth={2.2} />}
    </span>
  )
}

interface EvidenceDirectionListProps {
  items: EvidenceTypeOverview[]
}

/** "결과를 가르는 자료" — 전체 코퍼스 기준 EvidenceType별 유리/불리 방향. 이미 유리율
    높은 순으로 정렬되어 온다(백엔드). */
export function EvidenceDirectionList({ items }: EvidenceDirectionListProps) {
  if (items.length === 0) return null

  return (
    <section className={`${styles.card} card`} aria-label="결과를 가르는 자료">
      <div className={styles.titleRow}>
        <span className={styles.iconBadge} aria-hidden="true">
          <FileCheck size={16} />
        </span>
        <h2 className={styles.title}>결과를 가르는 자료</h2>
      </div>
      <ul className={styles.list}>
        {items.map((e) => {
          const favorable = e.favorable_rate >= e.unfavorable_rate
          const label = e.source_terms.length > 0 ? e.source_terms.join(', ') : e.type
          return (
            <li key={e.type} className={styles.row}>
              <DirectionIcon favorable={favorable} />
              <span className={styles.rowLabel}>{label}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
