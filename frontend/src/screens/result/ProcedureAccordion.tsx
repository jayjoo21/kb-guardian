import { useState } from 'react'
import { Route } from 'lucide-react'
import { AccordionSection } from '../../components/AccordionSection'
import { Checkbox } from '../../components/Checkbox'
import type { Procedure } from '../../lib/api'
import styles from './ProcedureAccordion.module.css'

interface ProcedureAccordionProps {
  procedure: Procedure
}

// 백엔드 procedure.steps(7단계 세부 문구)를 사용자가 한눈에 보는 큰 흐름 4단계로
// 묶어 타임라인으로 보여준다. 지금 막 결과를 받은 시점이므로 항상 1단계("자료
// 정리")가 현재 위치다.
const TIMELINE_STAGES = ['자료 정리', '은행 민원', '금감원 분쟁조정', '결과 확인']
const CURRENT_STAGE_INDEX = 0

/** "이렇게 준비하세요" 아코디언. steps 텍스트에 이미 "1. 2. 3." 번호가 포함돼 있어
    상세 목록은 마커 없이 렌더링한다(이중 번호 방지). 서류는 체크박스로 — 체크
    상태는 이 화면 안에서만 유지되는 로컬 상태(저장 없음). */
export function ProcedureAccordion({ procedure }: ProcedureAccordionProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  if (procedure.steps.length === 0 && procedure.documents.length === 0) return null

  return (
    <AccordionSection title="이렇게 준비하세요" icon={<Route size={16} />}>
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
        <ul className={styles.steps}>
          {procedure.steps.map((step, i) => (
            <li key={i} className={styles.step}>
              {step}
            </li>
          ))}
        </ul>
      )}

      {procedure.documents.length > 0 && (
        <div className={styles.documents}>
          <p className={styles.documentsLabel}>제출 서류</p>
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
    </AccordionSection>
  )
}
