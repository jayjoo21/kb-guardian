import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { saveFeedback, type FeedbackReason } from '../../lib/feedback'
import styles from './FeedbackWidget.module.css'

interface FeedbackWidgetProps {
  text: string
  issues: string[]
  /** "쟁점이 틀려요" 선택 시 — 7번(쟁점 재분석) 흐름을 그대로 연다 */
  onWrongIssue: () => void
  /** "내 상황과 달라요" 선택 시 — 다시 입력할 수 있게 홈으로 */
  onGoHome: () => void
}

type Stage = 'idle' | 'positive' | 'reasons' | 'more_cases' | 'different_situation'

/** 결과 피드백 — 서버로 보내지 않고 localStorage에만 기록한다(src/lib/feedback.ts).
    부정 피드백의 세 선택지 중 "쟁점이 틀려요"는 실제로 재분석 흐름을 열고, 나머지
    둘도 실제로 동작하는 안내(실제 결정례로 스크롤 / 홈에서 재입력)를 준다 —
    아무 반응 없는 가짜 버튼을 만들지 않는다. */
export function FeedbackWidget({ text, issues, onWrongIssue, onGoHome }: FeedbackWidgetProps) {
  const [stage, setStage] = useState<Stage>('idle')

  function handlePositive() {
    saveFeedback({ text, issues, helpful: true })
    setStage('positive')
  }

  function handleReason(reason: FeedbackReason) {
    saveFeedback({ text, issues, helpful: false, reason })
    if (reason === 'wrong_issue') {
      onWrongIssue()
      return
    }
    setStage(reason)
  }

  if (stage === 'positive') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>소중한 의견 감사합니다.</p>
      </div>
    )
  }

  if (stage === 'more_cases') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>아래 "실제 결정례"에서 더 많은 사례를 확인해보세요.</p>
        <a href="#real-cases" className={styles.actionLink}>
          실제 결정례로 이동
        </a>
      </div>
    )
  }

  if (stage === 'different_situation') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>상황을 더 자세히 입력해주시면 더 정확한 사례를 찾아드릴게요.</p>
        <button type="button" className={styles.actionLink} onClick={onGoHome}>
          다시 입력하기
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.question}>도움이 되었나요?</p>
      {stage === 'idle' ? (
        <div className={styles.buttons}>
          <button type="button" className={styles.thumbButton} onClick={handlePositive} aria-label="도움이 됐어요">
            <ThumbsUp size={18} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={styles.thumbButton}
            onClick={() => setStage('reasons')}
            aria-label="도움이 안 됐어요"
          >
            <ThumbsDown size={18} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <div className={styles.reasons}>
          <button type="button" className={styles.reasonButton} onClick={() => handleReason('more_cases')}>
            사례가 더 필요해요
          </button>
          <button
            type="button"
            className={styles.reasonButton}
            onClick={() => handleReason('different_situation')}
          >
            내 상황과 달라요
          </button>
          <button type="button" className={styles.reasonButton} onClick={() => handleReason('wrong_issue')}>
            쟁점이 틀려요
          </button>
        </div>
      )}
    </div>
  )
}
