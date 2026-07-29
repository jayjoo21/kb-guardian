import { Database } from 'lucide-react'
import { CountUp } from '../../components/CountUp'
import type { CorpusTotals } from '../../lib/api'
import styles from './CorpusOverviewCard.module.css'

interface CorpusOverviewCardProps {
  totalCases: number
  corpus: CorpusTotals
}

export function CorpusOverviewCard({ totalCases, corpus }: CorpusOverviewCardProps) {
  return (
    <section className={`${styles.card} card`} aria-label="분석 데이터 규모">
      <div className={styles.titleRow}>
        <span className={styles.iconBadge} aria-hidden="true">
          <Database size={16} />
        </span>
        <p className={styles.headline}>
          실제 금융감독원 분쟁조정 결정례{' '}
          <span className={`${styles.numberChip} mono`}>
            <CountUp value={totalCases} />건
          </span>
          을 분석했어요
        </p>
      </div>
      <dl className={styles.grid}>
        <div className={styles.item}>
          <dt className={styles.label}>참고 판례</dt>
          <dd className={`${styles.value} mono`}>{corpus.precedents}건</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>근거 법조항</dt>
          <dd className={`${styles.value} mono`}>{corpus.law_articles}건</dd>
        </div>
        <div className={styles.item}>
          <dt className={styles.label}>분쟁해결기준</dt>
          <dd className={`${styles.value} mono`}>{corpus.criteria}건</dd>
        </div>
      </dl>
      {corpus.date_range && (
        <p className={styles.period}>
          {corpus.date_range.from_year}년 ~ {corpus.date_range.to_year}년 결정례 기준
        </p>
      )}
    </section>
  )
}
