import { useState } from 'react'
import { FileCheck, TrendingUp, TrendingDown } from 'lucide-react'
import { AccordionSection } from '../../components/AccordionSection'
import { Checkbox } from '../../components/Checkbox'
import type { EvidencePattern } from '../../lib/api'
import styles from './EvidencePatternsAccordion.module.css'

interface EvidencePatternsAccordionProps {
  items: EvidencePattern[]
}

function DirectionIcon({ favorable }: { favorable: boolean }) {
  return (
    <span
      className={`${styles.direction} ${favorable ? styles.favorable : styles.unfavorable}`}
      role="img"
      aria-label={favorable ? '유리하게 작용' : '불리하게 작용'}
    >
      {favorable ? <TrendingUp size={14} strokeWidth={2.2} /> : <TrendingDown size={14} strokeWidth={2.2} />}
    </span>
  )
}

/** "이런 자료가 있으면 유리해요" 아코디언 — 체크박스는 순전히 사용자의 준비 확인용이고,
    체크한다고 점수·퍼센트가 바뀌지 않는다(그런 UI를 절대 만들지 않는다). 유리율
    높은 순 정렬, 원문 문서명(source_terms)을 유형 코드보다 우선 표시. */
export function EvidencePatternsAccordion({ items }: EvidencePatternsAccordionProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const sorted = [...items].sort((a, b) => b.favorable_rate - a.favorable_rate)
  if (sorted.length === 0) return null

  return (
    <AccordionSection title="이런 자료가 있으면 유리해요" icon={<FileCheck size={16} />} badge={sorted.length}>
      <ul className={styles.list}>
        {sorted.map((p) => {
          const favorable = p.favorable_rate >= p.unfavorable_rate
          const label = p.source_terms.length > 0 ? p.source_terms.join(', ') : p.type
          return (
            <li key={p.type} className={styles.row}>
              <Checkbox
                checked={!!checked[p.type]}
                onChange={(v) => setChecked((prev) => ({ ...prev, [p.type]: v }))}
              >
                <span className={styles.rowLabel}>{label}</span>
              </Checkbox>
              <DirectionIcon favorable={favorable} />
            </li>
          )
        })}
      </ul>
      <p className={styles.hint}>보유하신 자료를 체크해서 준비 상태를 확인해보세요.</p>
    </AccordionSection>
  )
}
