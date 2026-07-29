import { BarChart3 } from 'lucide-react'
import type { IssueStat } from '../../lib/api'
import styles from './IssueBarChart.module.css'

interface IssueBarChartProps {
  issues: IssueStat[]
  /** 이 브라우저의 상담 이력(localStorage)에서 실제로 나온 쟁점별 건수. 없으면
      빈 객체 — 옐로는 "내가 분석한 쟁점"에만 쓰고 나머지는 중립색으로 둔다. */
  myIssueCounts?: Record<string, number>
}

/** 쟁점별 사례 수 가로 막대. 건수 많은 순, 막대 길이는 최댓값 대비 상대 비율. */
export function IssueBarChart({ issues, myIssueCounts = {} }: IssueBarChartProps) {
  if (issues.length === 0) return null
  const sorted = [...issues].sort((a, b) => b.case_count - a.case_count)
  const max = sorted[0].case_count

  return (
    <section className={`${styles.card} card`} aria-label="쟁점별 사례 수">
      <div className={styles.titleRow}>
        <span className={styles.iconBadge} aria-hidden="true">
          <BarChart3 size={16} />
        </span>
        <h2 className={styles.title}>어떤 쟁점이 많을까요</h2>
      </div>
      <ul className={styles.list}>
        {sorted.map((i) => {
          const mine = myIssueCounts[i.issue] ?? 0
          return (
            <li key={i.issue} className={styles.row}>
              <span className={styles.label}>{i.issue.replace(/_/g, ' ')}</span>
              <div className={styles.track}>
                <div
                  className={`${styles.bar} ${mine > 0 ? styles.barMine : ''}`}
                  style={{ width: `${(i.case_count / max) * 100}%` }}
                />
              </div>
              <span className={styles.countCol}>
                <span className={`${styles.count} mono`}>{i.case_count}건</span>
                {mine > 0 && <span className={styles.myBadge}>내 사건 {mine}건</span>}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
