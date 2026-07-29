import { useEffect, useState } from 'react'
import { loadHistory, type ConsultHistoryEntry } from '../lib/history'
import { ProgressTracker } from './myconsult/ProgressTracker'
import { NotificationPreview } from './myconsult/NotificationPreview'
import styles from './MyConsultScreen.module.css'

interface MyConsultScreenProps {
  onOpenEntry: (entry: ConsultHistoryEntry) => void
  onStartConsult: () => void
  onLogout: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 상담 이력 — localStorage에만 저장되는 이 브라우저 전용 기록(서버 저장 없음).
    카드를 탭하면 그때 저장해둔 전체 데이터로 결과 화면을 그대로 다시 보여준다
    (재상담 없이 즉시 재생). */
export function MyConsultScreen({ onOpenEntry, onStartConsult, onLogout }: MyConsultScreenProps) {
  const [entries, setEntries] = useState<ConsultHistoryEntry[]>([])

  useEffect(() => {
    setEntries(loadHistory())
  }, [])

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>내 상담</h1>

      {entries.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>아직 상담 기록이 없어요</p>
          <button type="button" className={styles.startButton} onClick={onStartConsult}>
            상담 시작하기
          </button>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={styles.card} onClick={() => onOpenEntry(entry)}>
                  <span className={styles.cardDate}>{formatDate(entry.createdAt)}</span>
                  <span className={styles.cardText}>{entry.text}</span>
                  <div className={styles.cardMeta}>
                    {entry.issues.length > 0 && (
                      <span className={styles.cardIssues}>{entry.issues.join(', ')}</span>
                    )}
                    {entry.medianRatio !== null && (
                      <span className={styles.cardRatio}>배상비율 약 {entry.medianRatio}%</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <ProgressTracker />
        </>
      )}

      <NotificationPreview />

      <button type="button" className={styles.logout} onClick={onLogout}>
        로그아웃
      </button>
    </div>
  )
}
