import { PieChart } from 'lucide-react'
import { RatioHistogram } from '../../features/simulator/RatioHistogram'
import type { OverallRatioDistribution } from '../../lib/api'
import styles from './OverallRatioCard.module.css'

interface OverallRatioCardProps {
  distribution: OverallRatioDistribution
}

export function OverallRatioCard({ distribution: d }: OverallRatioCardProps) {
  if (d.n === 0 || d.median === null || d.min === null || d.max === null) return null

  return (
    <section className={`${styles.card} card`} aria-label="전체 배상비율 분포">
      <div className={styles.titleRow}>
        <span className={styles.iconBadge} aria-hidden="true">
          <PieChart size={16} />
        </span>
        <h2 className={styles.title}>배상비율은 이렇게 갈렸어요</h2>
      </div>
      <p className={styles.headline}>
        전체 사례에서 보통 <span className="mono">{d.median}%</span> 정도를 돌려받았어요
      </p>
      <p className={styles.range}>
        적게는 {d.min}%, 많게는 {d.max === 100 ? '전액' : `${d.max}%`}까지 사안에 따라 달라요
      </p>
      <RatioHistogram values={d.values} median={d.median} />
      <p className={styles.footnote}>배상비율이 확인된 사례 {d.n}건 기준</p>
    </section>
  )
}
