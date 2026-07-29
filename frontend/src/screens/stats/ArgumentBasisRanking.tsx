import { Scale } from 'lucide-react'
import { basisConsumerTitle } from '../../lib/basisLabels'
import type { ArgumentBasisOverview } from '../../lib/api'
import styles from './ArgumentBasisRanking.module.css'

interface ArgumentBasisRankingProps {
  items: ArgumentBasisOverview[]
}

/** 이 서비스 데이터의 하이라이트 — 은행이 실제로 자주 쓰는 반박 논리와, 위원회가
    그걸 얼마나 받아들이지 않았는지를 소비자 문장으로 보여준다. 이미 건수 많은
    순으로 정렬되어 온다(백엔드). basisLabels에 매핑 없는 basis("기타" 등)는 제외. */
export function ArgumentBasisRanking({ items }: ArgumentBasisRankingProps) {
  const mapped = items
    .map((item) => ({ item, title: basisConsumerTitle(item.basis) }))
    .filter((x): x is { item: ArgumentBasisOverview; title: string } => x.title !== null)

  if (mapped.length === 0) return null

  return (
    <section className={`${styles.card} card`} aria-label="은행이 자주 쓰는 반박 논리">
      <div className={styles.titleRow}>
        <span className={styles.iconBadge} aria-hidden="true">
          <Scale size={16} />
        </span>
        <h2 className={styles.title}>은행이 자주 쓰는 반박 논리</h2>
      </div>
      <p className={styles.subtitle}>
        결정문에서 실제로 나온 반박이 얼마나 자주 나왔고, 위원회가 얼마나 받아들이지 않았는지예요
      </p>
      <ol className={styles.list}>
        {mapped.map(({ item, title }, i) => (
          <li key={item.basis} className={styles.row}>
            <span className={styles.rank}>{i + 1}</span>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>{title}</p>
              <p className={styles.rowStat}>
                {item.count}건 중 <span className="mono">{item.rejected_count}건</span> 배척
              </p>
              <div className={styles.track}>
                <div className={styles.bar} style={{ width: `${item.rejected_rate * 100}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
