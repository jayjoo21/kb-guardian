import { Scale } from 'lucide-react'
import { AccordionSection } from '../../components/AccordionSection'
import { basisConsumerTitle } from '../../lib/basisLabels'
import type { RespondentArgumentGroup } from '../../lib/api'
import styles from './RespondentArgumentsAccordion.module.css'

interface RespondentArgumentsAccordionProps {
  items: RespondentArgumentGroup[]
}

// 배척률(위원회가 이 주장을 물리친 비율) 50% 미만 = 실제로 자주 받아들여지는 논리라는
// 뜻이라 소비자 입장에서는 경고 톤으로 따로 눈에 띄게 표시한다.
const WEAK_THRESHOLD = 0.5

/** "은행은 이렇게 반박할 수 있어요" ★핵심 아코디언. basisLabels.ts에 매핑이 없는
    basis(="기타" 등)는 소비자에게 의미 없는 내부 분류명이라 통째로 제외한다.
    배척률 낮은 순(=은행 논리가 강한 순) 정렬 — 자연히 경고 대상(배척률<50%)이
    위쪽에 먼저 온다. 항목마다 같은 사건 안에서 [은행 주장]과 [위원회 판단]을
    짝지어 보여준다(위원회 인용문이 없는 항목은 통계만 표시). */
export function RespondentArgumentsAccordion({ items }: RespondentArgumentsAccordionProps) {
  const mapped = items
    .map((item) => ({ item, title: basisConsumerTitle(item.basis) }))
    .filter((x): x is { item: RespondentArgumentGroup; title: string } => x.title !== null)
    .sort((a, b) => a.item.rejected_rate - b.item.rejected_rate)

  if (mapped.length === 0) return null

  return (
    <AccordionSection
      title="은행은 이렇게 반박할 수 있어요"
      icon={<Scale size={16} />}
      accent
      badge={mapped.length}
    >
      <ul className={styles.list}>
        {mapped.map(({ item, title }) => {
          const isWeak = item.rejected_rate < WEAK_THRESHOLD
          const sample = item.samples[0]

          return (
            <li key={item.basis} className={`${styles.row} ${isWeak ? styles.rowWeak : ''}`}>
              {isWeak && (
                <span className={styles.warning}>
                  이 주장은 실제로 받아들여진 경우가 많아요 — 대비가 필요해요
                </span>
              )}

              <div className={styles.pair}>
                <div className={styles.side}>
                  <span className={styles.sideLabel}>은행 주장</span>
                  <p className={styles.sideText}>{title}</p>
                </div>
                {sample?.quote && (
                  <div className={styles.side}>
                    <span className={styles.sideLabel}>위원회 판단</span>
                    <p className={styles.sideText}>
                      “{sample.quote}”
                      <span className={styles.caseNo}>
                        {' '}
                        · {sample.case_no ? `금감원 분쟁조정 ${sample.case_no}` : `사건번호 ${sample.case_id}`}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <p className={styles.stat}>
                비슷한 사례 {item.count}건 중 {item.rejected_count}건
                {isWeak ? '에서만' : '에서'} 위원회가 이 주장을 받아들이지 않았어요
              </p>
            </li>
          )
        })}
      </ul>
    </AccordionSection>
  )
}
