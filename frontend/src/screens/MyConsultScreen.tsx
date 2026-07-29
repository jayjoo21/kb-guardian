import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { loadHistory, mostFrequentIssues, totalCheckedDocuments, type ConsultHistoryEntry } from '../lib/history'
import { RatioHistogram } from '../features/simulator/RatioHistogram'
import { ProgressTracker } from './myconsult/ProgressTracker'
import styles from './MyConsultScreen.module.css'

interface MyConsultScreenProps {
  onOpenEntry: (entry: ConsultHistoryEntry) => void
  onStartConsult: () => void
  onOpenSettings: () => void
}

// backend/services/orchestrator.py의 ③ 근거 강도 판단과 같은 기준(HIGH_CONFIDENCE_MIN_*)을
// 그대로 재사용해 "상태" 배지를 매긴다 — 새 기준을 지어내지 않고, 상담 당시 실제로
// 적용됐던 것과 동일한 임계값을 저장된 evidence에 다시 적용할 뿐이다.
const HIGH_CONFIDENCE_MIN_SIMILAR_CASES = 5
const HIGH_CONFIDENCE_MIN_RATIO_N = 10

function statusBadge(entry: ConsultHistoryEntry): { label: string; strong: boolean } {
  const nSimilar = entry.evidence?.similar_cases.length ?? 0
  const nRatio = entry.evidence?.ratio_stats.n ?? 0
  const strong = nSimilar >= HIGH_CONFIDENCE_MIN_SIMILAR_CASES && nRatio >= HIGH_CONFIDENCE_MIN_RATIO_N
  return strong ? { label: '근거 충분', strong: true } : { label: '참고용', strong: false }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 상담 이력 — localStorage에만 저장되는 이 브라우저 전용 기록(서버 저장 없음).
    카드를 탭하면 그때 저장해둔 전체 데이터로 결과 화면을 그대로 다시 보여준다
    (재상담 없이 즉시 재생). 카드에는 그 상담에서 실제 조회됐던 유사 사례들의
    배상비율(최대 5건)로 만든 미니 히스토그램과, 그 표본 크기로 매긴 상태 배지를
    함께 보여준다 — 둘 다 그때 실제로 쓰인 데이터·기준 그대로다. */
export function MyConsultScreen({ onOpenEntry, onStartConsult, onOpenSettings }: MyConsultScreenProps) {
  const [entries, setEntries] = useState<ConsultHistoryEntry[]>([])

  useEffect(() => {
    setEntries(loadHistory())
  }, [])

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>내 상담</h1>
        <button type="button" className={styles.settingsButton} onClick={onOpenSettings} aria-label="설정">
          <Settings size={20} />
        </button>
      </div>

      {entries.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>아직 상담 기록이 없어요</p>
          <button type="button" className={styles.startButton} onClick={onStartConsult}>
            상담 시작하기
          </button>
        </div>
      ) : (
        <>
          {entries.length >= 2 && (
            <div className={styles.summary} aria-label="내 상담 요약">
              <p className={styles.summaryLine}>
                자주 나온 쟁점:{' '}
                <strong>
                  {mostFrequentIssues(entries)
                    .map((s) => s.issue.replace(/_/g, ' '))
                    .join(', ')}
                </strong>
              </p>
              <p className={styles.summaryLine}>
                지금까지 체크한 서류 <strong className="mono">{totalCheckedDocuments(entries)}건</strong>
              </p>
            </div>
          )}

          <ul className={styles.list}>
            {entries.map((entry) => {
              const ratios = entry.evidence?.similar_cases
                .map((c) => c.ratio)
                .filter((r): r is number => r !== null) ?? []
              const badge = statusBadge(entry)
              return (
                <li key={entry.id}>
                  <button type="button" className={styles.card} onClick={() => onOpenEntry(entry)}>
                    <div className={styles.cardTop}>
                      <span className={styles.cardDate}>{formatDate(entry.createdAt)}</span>
                      <span className={`${styles.badge} ${badge.strong ? styles.badgeStrong : ''}`}>
                        {badge.label}
                      </span>
                    </div>
                    <span className={styles.cardText}>{entry.text}</span>
                    <div className={styles.cardMeta}>
                      {entry.issues.length > 0 && (
                        <span className={styles.cardIssues}>{entry.issues.join(', ')}</span>
                      )}
                      {entry.medianRatio !== null && (
                        <span className={styles.cardRatio}>배상비율 약 {entry.medianRatio}%</span>
                      )}
                    </div>
                    {ratios.length > 0 && entry.medianRatio !== null && (
                      <div className={styles.cardHistogram}>
                        <RatioHistogram values={ratios} median={entry.medianRatio} />
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          <ProgressTracker />
        </>
      )}
    </div>
  )
}
