import { Sparkles } from 'lucide-react'
import { KeyFindingsCard } from '../KeyFindingsCard'
import { DetailAccordion } from '../DetailAccordion'
import { SpeakButton } from '../../../components/SpeakButton'
import { loadVoiceGuide } from '../../../lib/settings'
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
  const fullAnswer = [summary, ...detailParagraphs].filter(Boolean).join(' ')

  return (
    <div className={styles.panel} role="tabpanel">
      <KeyFindingsCard issue={issue} issueCount={issueCount} similarCaseCount={similarCaseCount} />

      {summary && (
        <div className={styles.summaryBlock}>
          <div className={styles.summaryHeader}>
            <span className={styles.aiLabel}>
              <Sparkles size={11} aria-hidden="true" />
              AI 분석 해석 · 법률 자문 아님
            </span>
            {loadVoiceGuide() && <SpeakButton text={fullAnswer} />}
          </div>
          <p className={styles.summary}>{summary}</p>
        </div>
      )}

      <DetailAccordion paragraphs={detailParagraphs} />
    </div>
  )
}
