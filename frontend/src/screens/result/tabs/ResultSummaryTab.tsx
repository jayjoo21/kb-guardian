import { Sparkles } from 'lucide-react'
import { KeyFindingsCard } from '../KeyFindingsCard'
import { DetailAccordion } from '../DetailAccordion'
import styles from './ResultSummaryTab.module.css'

interface ResultSummaryTabProps {
  issue: string | null
  issueCount: number
  similarCaseCount: number
  summary: string
  detailParagraphs: string[]
}

export function ResultSummaryTab({
  issue,
  issueCount,
  similarCaseCount,
  summary,
  detailParagraphs,
}: ResultSummaryTabProps) {
  return (
    <div className={styles.panel} role="tabpanel">
      <KeyFindingsCard issue={issue} issueCount={issueCount} similarCaseCount={similarCaseCount} />

      {summary && (
        <div className={styles.summaryBlock}>
          <span className={styles.aiLabel}>
            <Sparkles size={11} aria-hidden="true" />
            AI 분석 해석
          </span>
          <p className={styles.summary}>{summary}</p>
        </div>
      )}

      <DetailAccordion paragraphs={detailParagraphs} />
    </div>
  )
}
