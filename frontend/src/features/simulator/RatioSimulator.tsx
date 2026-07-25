import { useEffect, useState } from 'react'
import { fetchSimulate, fetchStats, type IssueStat, type SimulateResponse } from '../../lib/api'
import { RatioHistogram } from './RatioHistogram'
import styles from './RatioSimulator.module.css'

const CONSISTENCY_LABEL: Record<string, string> = {
  일관: '이 쟁점은 금감원 판단이 대체로 일관됩니다.',
  편차_큼: '이 쟁점은 사안별 편차가 큽니다 — 개별 요인이 결과를 크게 좌우합니다.',
  데이터_부족: '유사 사례가 적어 일관성을 판단하기 어렵습니다.',
}

interface RatioSimulatorProps {
  /** 상담 결과로 분류된 쟁점이 있으면 이걸 기본 선택으로 쓴다(그 쟁점에 사례가 있을 때만). */
  initialIssue?: string | null
}

/** 쟁점별 배상비율 분포 조회. "예상치를 계산기처럼 흔드는" 대신, 실측 분포(중앙값·범위·
    사분위·개별값)를 그대로 보여주고, 표본이 뒷받침하는("반영" 등급) 요인만 보조 정보로
    덧붙인다. 표시되는 모든 수치는 그래프 조회 결과다. */
export function RatioSimulator({ initialIssue = null }: RatioSimulatorProps) {
  const [issues, setIssues] = useState<IssueStat[] | null>(null)
  const [issuesError, setIssuesError] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null)
  const [sim, setSim] = useState<SimulateResponse | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
      .then((data) => {
        const withCases = data.issues.filter((i) => i.ratio_stats.n > 0)
        setIssues(withCases)
        const preferred = withCases.find((i) => i.issue === initialIssue)
        if (preferred) setSelectedIssue(preferred.issue)
        else if (withCases.length > 0) setSelectedIssue(withCases[0].issue)
      })
      .catch((err) => setIssuesError(err instanceof Error ? err.message : String(err)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedIssue) return
    const controller = new AbortController()
    setSimLoading(true)
    setSimError(null)
    fetchSimulate(selectedIssue, controller.signal)
      .then((data) => setSim(data))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSimError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setSimLoading(false))
    return () => controller.abort()
  }, [selectedIssue])

  if (issuesError) {
    return (
      <div className={styles.simulator}>
        <p className={styles.error}>배상비율 분포를 불러오지 못했습니다: {issuesError}</p>
      </div>
    )
  }

  const d = sim?.distribution

  return (
    <div className={styles.simulator}>
      <div className={styles.header}>
        <h2 className={styles.title}>쟁점별 배상비율 분포</h2>
        <span className={styles.betaNote}>유사 사례 실측 데이터 · 참고용</span>
      </div>

      <label className={styles.issueField}>
        <span className={styles.issueLabel}>쟁점</span>
        <select
          className={styles.issueSelect}
          value={selectedIssue ?? ''}
          onChange={(e) => setSelectedIssue(e.target.value)}
          disabled={!issues}
        >
          {issues?.map((i) => (
            <option key={i.issue} value={i.issue}>
              {i.issue} ({i.case_count}건)
            </option>
          ))}
        </select>
      </label>

      {simError && <p className={styles.error}>{simError}</p>}

      {d && d.n > 0 && (
        <>
          <div className={styles.headline}>
            <div className={styles.headlineMain}>
              <span className={styles.headlineLabel}>중앙값</span>
              <span className={`${styles.headlineValue} mono`}>{d.median}%</span>
            </div>
            <dl className={styles.statGrid}>
              <div>
                <dt>관측 범위</dt>
                <dd className="mono">{d.min}%–{d.max}%</dd>
              </div>
              <div>
                <dt>사분위 범위(IQR)</dt>
                <dd className="mono">{d.p25}%–{d.p75}%</dd>
              </div>
              <div>
                <dt>표본</dt>
                <dd className="mono">n={d.n}</dd>
              </div>
            </dl>
          </div>

          <RatioHistogram values={d.values} median={d.median ?? 0} />

          <p className={styles.consistencyNote}>{CONSISTENCY_LABEL[d.consistency]}</p>

          {sim && sim.factors.length > 0 && (
            <div className={styles.factorSection}>
              <span className={styles.factorSectionTitle}>참고: 데이터가 뒷받침하는 조정 요인</span>
              <ul className={styles.factorList}>
                {sim.factors.map((f) => (
                  <li key={f.name} className={styles.factorRow}>
                    <span className={styles.factorName}>{f.name}</span>
                    <span className={`${styles.factorPp} mono`}>
                      {f.pp !== null && f.pp > 0 ? '+' : ''}
                      {f.pp}pp
                    </span>
                    <span className={`${styles.factorN} mono`}>n={f.n_with}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {d && d.n === 0 && <p className={styles.noFactors}>이 쟁점에는 배상비율 데이터가 없습니다.</p>}

      {simLoading && !sim && <p className={styles.loading}>불러오는 중…</p>}
    </div>
  )
}
