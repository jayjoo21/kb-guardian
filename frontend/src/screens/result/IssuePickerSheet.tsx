import { useEffect, useState } from 'react'
import { BottomSheet } from '../../app/BottomSheet'
import { fetchStats, type IssueStat } from '../../lib/api'
import styles from './IssuePickerSheet.module.css'

interface IssuePickerSheetProps {
  open: boolean
  currentIssues: string[]
  onClose: () => void
  onPick: (issue: string) => void
}

/** "이 쟁점이 아니에요" → 실제 사례 데이터가 있는 쟁점 중에서 고르게 하는 바텀시트.
    /api/stats의 쟁점 목록(=그래프에 실제 사례가 있는 쟁점)만 보여준다 — 데이터
    없는 쟁점을 고를 수 있게 하지 않는다. */
export function IssuePickerSheet({ open, currentIssues, onClose, onPick }: IssuePickerSheetProps) {
  const [issues, setIssues] = useState<IssueStat[] | null>(null)

  useEffect(() => {
    if (!open || issues) return
    fetchStats()
      .then((data) => setIssues(data.issues))
      .catch(() => setIssues([]))
  }, [open, issues])

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.wrap}>
        <p className={styles.title}>어떤 쟁점이 맞나요?</p>
        <p className={styles.subtitle}>실제 사례가 있는 쟁점만 골라 다시 분석해드려요</p>
        <ul className={styles.list}>
          {(issues ?? [])
            .filter((i) => !currentIssues.includes(i.issue))
            .sort((a, b) => b.case_count - a.case_count)
            .map((i) => (
              <li key={i.issue}>
                <button type="button" className={styles.option} onClick={() => onPick(i.issue)}>
                  <span>{i.issue.replace(/_/g, ' ')}</span>
                  <span className={styles.optionCount}>관련 사례 {i.case_count}건</span>
                </button>
              </li>
            ))}
        </ul>
        {issues === null && <p className={styles.loading}>불러오는 중…</p>}
      </div>
    </BottomSheet>
  )
}
