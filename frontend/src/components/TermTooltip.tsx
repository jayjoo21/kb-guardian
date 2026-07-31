import { useState, type ReactNode } from 'react'
import { BookOpenText, Sparkles, X } from 'lucide-react'
import styles from './TermTooltip.module.css'

export interface TermTooltipContent {
  term: string
  definition: string
  caseCount: number
  importance: string
  preventionTip: string
  examples: string[]
}

interface TermTooltipProps {
  content: TermTooltipContent
  children: ReactNode
}

export function TermTooltip({ content, children }: TermTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className={styles.wrapper}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((prev) => !prev)}>
        {children}
      </button>

      {open && (
        <div className={styles.sheet} role="dialog" aria-label={`${content.term} 설명`}>
          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <BookOpenText size={15} />
              <strong>{content.term}</strong>
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="닫기">
              <X size={14} />
            </button>
          </div>

          <p className={styles.definition}>{content.definition}</p>

          <div className={styles.metrics}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>결정례 등장</span>
              <strong>{content.caseCount}건</strong>
            </div>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>중요도</span>
              <strong>{content.importance}</strong>
            </div>
          </div>

          <div className={styles.examplesSection}>
            <span className={styles.examplesLabel}>관련 사례</span>
            <ul className={styles.examplesList}>
              {content.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </div>

          <div className={styles.tipBox}>
            <div className={styles.tipHeader}>
              <Sparkles size={14} />
              <span>분쟁 예방 팁</span>
            </div>
            <p>{content.preventionTip}</p>
          </div>
        </div>
      )}
    </span>
  )
}
