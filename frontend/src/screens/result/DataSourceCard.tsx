import { useEffect, useState } from 'react'
import { Database, ChevronDown } from 'lucide-react'
import { fetchStats, type StatsResponse } from '../../lib/api'
import styles from './DataSourceCard.module.css'

/** "이 답변은 어디서 나왔나" — result 상단에 항상 보이는 한 줄 + 펼치면 코퍼스 규모
    상세(판례/법조항/분쟁해결기준/기간). /api/stats를 자체 조회한다(전체 코퍼스
    기준이라 이 상담의 evidence와는 무관하게 항상 동일한 값). */
export function DataSourceCard() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {
        // 부가 정보라 실패해도 조용히 생략
      })
  }, [])

  if (!stats) return null

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.summary} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Database size={13} aria-hidden="true" />
        <span className={styles.summaryText}>
          금융감독원 분쟁조정 결정례 <span className="mono">{stats.total_cases}건</span> 기반
        </span>
        <ChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} size={13} aria-hidden="true" />
      </button>
      {open && (
        <dl className={styles.detail}>
          <div className={styles.detailItem}>
            <dt>참고 판례</dt>
            <dd className="mono">{stats.corpus.precedents}건</dd>
          </div>
          <div className={styles.detailItem}>
            <dt>근거 법조항</dt>
            <dd className="mono">{stats.corpus.law_articles}건</dd>
          </div>
          <div className={styles.detailItem}>
            <dt>분쟁해결기준</dt>
            <dd className="mono">{stats.corpus.criteria}건</dd>
          </div>
          {stats.corpus.date_range && (
            <div className={styles.detailItem}>
              <dt>기간</dt>
              <dd>
                {stats.corpus.date_range.from_year}~{stats.corpus.date_range.to_year}년
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
