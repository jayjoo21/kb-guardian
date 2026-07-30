import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { saveFeedback, type FeedbackReason } from '../../lib/feedback'
import styles from './FeedbackWidget.module.css'

interface FeedbackWidgetProps {
  text: string
  issues: string[]
  /** "쟁점이 제 상황과 달라요" 선택 시 — 쟁점 재분석 흐름을 그대로 연다 */
  onWrongIssue: () => void
  /** "사례가 더 필요해요" — 그래프상 공동 태깅 빈도가 높은 인접 쟁점이 있으면 그
      쟁점을 더해 재조회한다. 없으면 null을 반환해 "추가로 찾을 사례가 없다"고 안내한다. */
  onMoreCases: () => Promise<boolean>
  /** "설명이 어려워요" — 같은 근거로 답변을 더 쉬운 문장으로 재생성한다. */
  onSimplify: () => Promise<void>
}

type Stage = 'idle' | 'positive' | 'reasons' | 'more_cases_none' | 'simplifying' | 'simplified' | 'error'

/** 결과 피드백 — 서버로 보내지 않고 localStorage에만 기록한다(src/lib/feedback.ts).
    부정 피드백의 세 선택지는 전부 실제로 동작한다: 쟁점 불일치는 재분석 플로우를,
    사례 부족은 그래프 집계 기반 인접 쟁점 추가 검색을, 설명 어려움은 같은 근거로
    답변을 다시 생성하는 실제 API 호출을 연다 — 아무 반응 없는 가짜 버튼이 없다. */
export function FeedbackWidget({ text, issues, onWrongIssue, onMoreCases, onSimplify }: FeedbackWidgetProps) {
  const [stage, setStage] = useState<Stage>('idle')

  function handlePositive() {
    saveFeedback({ text, issues, helpful: true })
    setStage('positive')
  }

  async function handleReason(reason: FeedbackReason) {
    saveFeedback({ text, issues, helpful: false, reason })
    if (reason === 'wrong_issue') {
      onWrongIssue()
      return
    }
    if (reason === 'more_cases') {
      const found = await onMoreCases()
      if (!found) setStage('more_cases_none')
      // found === true면 재분석으로 화면이 바뀌므로 여기서 별도 stage 전환이 필요 없다.
      return
    }
    // hard_to_understand
    setStage('simplifying')
    try {
      await onSimplify()
      setStage('simplified')
    } catch {
      setStage('error')
    }
  }

  if (stage === 'positive') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>소중한 의견 감사합니다.</p>
      </div>
    )
  }

  if (stage === 'more_cases_none') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>
          이번 쟁점과 관련해 더 찾을 수 있는 유사 사례가 없었어요. 대신 "근거" 탭에서 조회된 사례를
          다시 확인해보세요.
        </p>
      </div>
    )
  }

  if (stage === 'simplifying') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>답변을 더 쉬운 문장으로 다시 쓰고 있어요…</p>
      </div>
    )
  }

  if (stage === 'simplified') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>더 쉬운 설명으로 바꿔드렸어요. 위 답변을 확인해보세요.</p>
      </div>
    )
  }

  if (stage === 'error') {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>다시 쓰는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.</p>
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
          <button type="button" className={styles.reasonButton} onClick={() => handleReason('wrong_issue')}>
            쟁점이 제 상황과 달라요
          </button>
          <button type="button" className={styles.reasonButton} onClick={() => handleReason('more_cases')}>
            사례가 더 필요해요
          </button>
          <button
            type="button"
            className={styles.reasonButton}
            onClick={() => handleReason('hard_to_understand')}
          >
            설명이 어려워요
          </button>
        </div>
      )}
    </div>
  )
}
