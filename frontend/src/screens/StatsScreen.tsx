import { useEffect, useState } from 'react'
import { fetchStats, type StatsResponse } from '../lib/api'
import { CorpusOverviewCard } from './stats/CorpusOverviewCard'
import { IssueBarChart } from './stats/IssueBarChart'
import { OverallRatioCard } from './stats/OverallRatioCard'
import { ArgumentBasisRanking } from './stats/ArgumentBasisRanking'
import { EvidenceDirectionList } from './stats/EvidenceDirectionList'
import styles from './StatsScreen.module.css'

/** 통계 탭 — 특정 상담이 아니라 서비스가 가진 데이터 전체(196건 코퍼스)를 보여준다.
    /api/stats 하나로 전부 조회(쟁점 필터 없는 전체 집계). 통계 용어(중앙값/IQR/n/pp)
    대신 자연수·소비자 문장으로만 표현한다. */
export function StatsScreen() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>통계</h1>

      {error && <p className={styles.error}>데이터를 불러오지 못했습니다: {error}</p>}

      {stats && (
        <div className={styles.list}>
          <CorpusOverviewCard totalCases={stats.total_cases} corpus={stats.corpus} />
          <ArgumentBasisRanking items={stats.argument_basis_overview} />
          <IssueBarChart issues={stats.issues} />
          <OverallRatioCard distribution={stats.overall_ratio_distribution} />
          <EvidenceDirectionList items={stats.evidence_type_overview} />
        </div>
      )}
    </div>
  )
}
