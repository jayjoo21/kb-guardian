import { useEffect, useState } from 'react'
import { Database, ChevronDown } from 'lucide-react'
import { fetchStats, type StatsResponse } from '../../lib/api'
import styles from './DataSourceCard.module.css'

interface DataSourceCardProps {
  /** 카드를 탭하면 통계 탭으로 이동한다(9-2). */
  onNavigateToStats: () => void
}

/** "이 답변은 어디서 나왔나" — result 상단에 항상 보이는 한 줄 + 펼치면 코퍼스 규모
    상세(판례/법조항/분쟁해결기준/기간/최근 사례 등록일). /api/stats를 자체
    조회한다(전체 코퍼스 기준이라 이 상담의 evidence와는 무관하게 항상 동일한 값).
    본문(요약 줄)을 탭하면 통계 탭으로 이동하고, 화살표 버튼은 그 자리에서 상세만
    펼친다 — 두 동작을 분리해 "더 보고 싶으면 이동, 빠르게 보고 싶으면 펼치기"를
    둘 다 지원한다. */
export function DataSourceCard({ onNavigateToStats }: DataSourceCardProps) {
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
      <div className={styles.summaryRow}>
        <button
          type="button"
          className={styles.summary}
          onClick={onNavigateToStats}
          aria-label="이 분석은 무엇을 근거로 하나요 — 통계 탭으로 이동"
        >
          <Database size={13} aria-hidden="true" />
          <span className={styles.summaryText}>
            금융감독원 분쟁조정 결정례 <span className="mono">{stats.total_cases}건</span> 기반
          </span>
        </button>
        <button
          type="button"
          className={styles.chevronButton}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? '근거 상세 접기' : '근거 상세 펼치기'}
        >
          <ChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} size={13} />
        </button>
      </div>
      {open && (
        <dl className={styles.detail}>
          <div className={styles.detailItem}>
            <dt>참고 판례</dt>
            <dd className="mono">{stats.corpus.precedents}건</dd>
          </div>
          <div className={styles.detailItem}>
            <dt>근거 법조항</dt>
            <dd className="mono">{stats.corpus.law_articles}건 (금융소비자보호법 등)</dd>
          </div>
          <div className={styles.detailItem}>
            <dt>분쟁해결기준</dt>
            <dd className="mono">{stats.corpus.criteria}건</dd>
          </div>
          {stats.corpus.date_range && (
            <div className={styles.detailItem}>
              <dt>수집 기간</dt>
              <dd>
                {stats.corpus.date_range.from_year}~{stats.corpus.date_range.to_year}년
              </dd>
            </div>
          )}
          {stats.corpus.latest_case_date && (
            <div className={styles.detailItem}>
              <dt>최근 사례 등록일</dt>
              <dd>{stats.corpus.latest_case_date}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
