import { useState } from 'react'
import { Route } from 'lucide-react'
import { AccordionSection } from '../../../components/AccordionSection'
import { Checkbox } from '../../../components/Checkbox'
import { EvidencePatternsAccordion } from '../EvidencePatternsAccordion'
import { ComplaintDraftAccordion } from '../ComplaintDraftAccordion'
import type { Classified, Evidence, EvidencePattern, Procedure } from '../../../lib/api'
import type { ReactNode } from 'react'
import styles from './ResultPrepareTab.module.css'

const TIMELINE_STAGES = ['자료 정리', '은행 민원', '금감원 분쟁조정', '결과 확인']
const CURRENT_STAGE_INDEX = 0

interface ResultPrepareTabProps {
  procedure: Procedure | null
  evidencePatterns: EvidencePattern[]
  text: string
  classified: Classified
  evidence: Evidence | null
}

function PrepareSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={`${styles.section} card`}>
      <div className={styles.sectionHeader}>
        <span className={styles.iconBadge} aria-hidden="true">
          {icon}
        </span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export function ResultPrepareTab({
  procedure,
  evidencePatterns,
  text,
  classified,
  evidence,
}: ResultPrepareTabProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  if (!procedure && evidencePatterns.length === 0) {
    return (
      <div className={styles.panel} role="tabpanel">
        <p className={styles.empty}>준비 안내를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.panel} role="tabpanel">
      {procedure && (procedure.steps.length > 0 || procedure.documents.length > 0) && (
        <PrepareSection title="진행 단계" icon={<Route size={16} />}>
          <ol className={styles.timeline}>
            {TIMELINE_STAGES.map((stage, i) => {
              const state =
                i < CURRENT_STAGE_INDEX ? 'past' : i === CURRENT_STAGE_INDEX ? 'current' : 'future'
              return (
                <li key={stage} className={`${styles.timelineStep} ${styles[state]}`}>
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.timelineLabel}>{stage}</span>
                </li>
              )
            })}
          </ol>

          {procedure.steps.length > 0 && (
            <AccordionSection title="세부 절차" defaultOpen={false}>
              <ul className={styles.steps}>
                {procedure.steps.map((step, i) => (
                  <li key={i} className={styles.step}>
                    {step}
                  </li>
                ))}
              </ul>
            </AccordionSection>
          )}

          {procedure.documents.length > 0 && (
            <div className={styles.documents}>
              <p className={styles.documentsLabel}>제출 서류 체크리스트</p>
              <ul className={styles.docList}>
                {procedure.documents.map((doc, i) => (
                  <li key={i}>
                    <Checkbox
                      checked={!!checked[i]}
                      onChange={() => setChecked((prev) => ({ ...prev, [i]: !prev[i] }))}
                    >
                      <span className={checked[i] ? styles.docChecked : undefined}>{doc}</span>
                    </Checkbox>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PrepareSection>
      )}

      {evidencePatterns.length > 0 && <EvidencePatternsAccordion items={evidencePatterns} />}

      <ComplaintDraftAccordion text={text} classified={classified} evidence={evidence} procedure={procedure} />
    </div>
  )
}
