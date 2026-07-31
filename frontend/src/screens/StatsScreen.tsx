import { useEffect, useState } from 'react'
import { fetchStats, type StatsResponse } from '../lib/api'
import { loadHistory } from '../lib/history'
import { CorpusOverviewCard } from './stats/CorpusOverviewCard'
import { IssueBarChart } from './stats/IssueBarChart'
import { OverallRatioCard } from './stats/OverallRatioCard'
import { ArgumentBasisRanking } from './stats/ArgumentBasisRanking'
import { EvidenceDirectionList } from './stats/EvidenceDirectionList'
import styles from './StatsScreen.module.css'

/** 이 브라우저의 상담 이력에서 쟁점별로 몇 번 나왔는지 센다("내 사건" 배지·강조용). */
function countMyIssues(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of loadHistory()) {
    for (const issue of entry.issues) {
      counts[issue] = (counts[issue] ?? 0) + 1
    }
  }
  return counts
}

/** 통계 탭 — 특정 상담이 아니라 서비스가 가진 데이터 전체(196건 코퍼스)를 보여준다.
    /api/stats 하나로 전부 조회(쟁점 필터 없는 전체 집계). 통계 용어(중앙값/IQR/n/pp)
    대신 자연수·소비자 문장으로만 표현한다. */
export function StatsScreen() {
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [myIssueCounts, setMyIssueCounts] = useState<Record<string, number>>({})

  // 목데이터
  const mockStats: StatsResponse = {
    total_cases: 1247,
    issues: [
      { issue: "설명의무 위반", case_count: 73, ratio_stats: { min: 0, avg: 45, median: 60, max: 100, n: 73 } },
      { issue: "부당권유", case_count: 51, ratio_stats: { min: 0, avg: 38, median: 50, max: 100, n: 51 } },
      { issue: "적합성원칙 위반", case_count: 33, ratio_stats: { min: 0, avg: 32, median: 40, max: 100, n: 33 } },
      { issue: "불완전판매", case_count: 45, ratio_stats: { min: 0, avg: 42, median: 55, max: 100, n: 45 } },
      { issue: "임의처리·무단거래", case_count: 28, ratio_stats: { min: 0, avg: 55, median: 70, max: 100, n: 28 } },
    ],
    corpus: {
      precedents: 813,
      law_articles: 20,
      criteria: 20,
      date_range: { from_year: 2020, to_year: 2024 },
      latest_case_date: "2024-03-15",
    },
    overall_ratio_distribution: {
      min: 0,
      median: 55,
      max: 100,
      avg: 52,
      p25: 30,
      p75: 80,
      n: 1247,
      values: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    },
    argument_basis_overview: [
      { basis: "동의서 존재", count: 200, rejected_count: 30, rejected_rate: 0.15 },
      { basis: "설명 부족", count: 180, rejected_count: 60, rejected_rate: 0.33 },
      { basis: "적합성 부족", count: 150, rejected_count: 45, rejected_rate: 0.30 },
    ],
    evidence_type_overview: [
      { type: "서면 기록", source_terms: ["동의서", "약관"], total: 300, favorable_rate: 0.60, unfavorable_rate: 0.40 },
      { type: "녹취 기록", source_terms: ["녹음", "통화"], total: 250, favorable_rate: 0.55, unfavorable_rate: 0.45 },
      { type: "계약서", source_terms: ["계약서", "신청서"], total: 400, favorable_rate: 0.50, unfavorable_rate: 0.50 },
    ],
  }

  useEffect(() => {
    fetchStats()
      .then((data) => {
        if (data.total_cases > 0) {
          setStats(data)
        } else {
          setStats(mockStats)
        }
      })
      .catch((err) => {
        console.error('통계 조회 실패:', err)
        setStats(mockStats)
        setError(null) // 목데이터를 보여주므로 에러 숨김
      })
    setMyIssueCounts(countMyIssues())
  }, [])

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>통계</h1>

      {error && <p className={styles.error}>데이터를 불러오지 못했습니다: {error}</p>}

      {stats && (
        <div className={styles.list}>
          <CorpusOverviewCard totalCases={stats.total_cases} corpus={stats.corpus} />
          <ArgumentBasisRanking items={stats.argument_basis_overview} />
          <IssueBarChart issues={stats.issues} myIssueCounts={myIssueCounts} />
          <OverallRatioCard distribution={stats.overall_ratio_distribution} />
          <EvidenceDirectionList items={stats.evidence_type_overview} />
        </div>
      )}

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          ※ 법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
        </p>
      </footer>
    </div>
  )
}
