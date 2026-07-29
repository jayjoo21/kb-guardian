import { useState } from 'react'
import { Check } from 'lucide-react'
import { loadCurrentStage, saveCurrentStage, clearCurrentStage } from '../../lib/tracker'
import styles from './ProgressTracker.module.css'

// 소요 기간은 procedure.steps에 실제로 있는 값("통상 접수 후 약 30일 이내 답변",
// backend/main.py PROCEDURE_STEPS 2번)만 쓴다. 다른 단계는 근거 없는 기간을
// 지어내지 않고 정성적으로만 설명한다.
const STAGES = [
  { label: '자료 정리', desc: '서류를 준비하는 단계예요' },
  { label: '은행 민원', desc: '통상 접수 후 약 30일 이내 답변이 와요' },
  { label: '금감원 분쟁조정 접수', desc: '사실관계 조사 후 위원회 심의를 거쳐요' },
  { label: '결과 확인', desc: '위원회가 조정안을 제시해요' },
]

/** 진행 트래커 — 앱이 사용자의 실제 진행 상태를 자동으로 알 방법이 없으므로(금감원·
    은행 시스템 연동 없음), "지금 어디쯤인지" 직접 표시하는 자기보고형 UI다. 자동
    추적인 척하지 않는다 — 그렇게 하면 거짓이 된다. */
export function ProgressTracker() {
  const [current, setCurrent] = useState<number | null>(() => loadCurrentStage())

  function handleSelect(i: number) {
    const next = current === i ? null : i
    setCurrent(next)
    if (next !== null) saveCurrentStage(next)
    else clearCurrentStage()
  }

  return (
    <section className={`${styles.card} card`} aria-label="분쟁조정 진행 안내">
      <h2 className={styles.title}>분쟁조정, 이렇게 진행돼요</h2>
      <p className={styles.hint}>지금 어느 단계인지 직접 표시해보세요(자동으로 확인되지는 않아요)</p>
      <ol className={styles.list}>
        {STAGES.map((stage, i) => {
          const isCurrent = current === i
          const isPast = current !== null && i < current
          return (
            <li key={stage.label} className={styles.row}>
              <button
                type="button"
                className={`${styles.marker} ${isCurrent ? styles.markerCurrent : ''} ${isPast ? styles.markerPast : ''}`}
                onClick={() => handleSelect(i)}
                aria-pressed={isCurrent}
                aria-label={`${stage.label}을 현재 단계로 표시`}
              >
                {isPast ? <Check size={12} strokeWidth={3} /> : i + 1}
              </button>
              <div className={styles.rowText}>
                <span className={`${styles.rowLabel} ${isCurrent ? styles.rowLabelCurrent : ''}`}>
                  {stage.label}
                </span>
                <span className={styles.rowDesc}>{stage.desc}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
