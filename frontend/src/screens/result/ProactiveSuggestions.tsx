import { useState } from 'react'
import { Clock, FileCheck, Lightbulb } from 'lucide-react'
import type { Evidence } from '../../lib/api'
import styles from './ProactiveSuggestions.module.css'

// 금소법 판매원칙 위반 계열 쟁점 — 위법계약해지권(제47조) 안내 대상. 아래 목록은
// backend/scripts/load_graph.py의 ISSUE_LAW_MAP에 실제로 GOVERNED_BY 매핑이 있는
// 쟁점 + 같은 판매원칙 계열인 불완전판매_기타로 한정한다(근거 없이 확대하지 않음).
const CONTRACT_RIGHT_ISSUES = ['설명의무_위반', '적합성원칙_위반', '적정성원칙_위반', '부당권유', '불완전판매_기타']

const MAX_SUGGESTIONS = 2

interface ProactiveSuggestionsProps {
  issues: string[]
  evidence: Evidence | null
  possessedEvidence: string[]
  onAddIssue: (issue: string) => void
  onMarkPossessed: (type: string) => void
}

/** 8-1 능동 제안 — 사용자가 묻지 않아도 AI가 먼저 제안하는 카드. 전부 이번 상담의
    그래프 집계(issue_suggestion/evidence_patterns)나 실제 쟁점 목록에서만 근거를
    가져온다(지어낸 제안 없음). 한 화면에 최대 2개까지만 보여준다. */
export function ProactiveSuggestions({
  issues,
  evidence,
  possessedEvidence,
  onAddIssue,
  onMarkPossessed,
}: ProactiveSuggestionsProps) {
  const [dismissedIssue, setDismissedIssue] = useState(false)
  const [dismissedEvidence, setDismissedEvidence] = useState(false)
  const [dismissedDeadline, setDismissedDeadline] = useState(false)

  const suggestion = evidence?.issue_suggestion
  const showIssue = !!suggestion && !issues.includes(suggestion.issue) && !dismissedIssue

  const topPattern = (evidence?.evidence_patterns ?? [])
    .filter((p) => p.favorable_rate > p.unfavorable_rate)
    .filter((p) => !possessedEvidence.includes(p.type))
    .sort((a, b) => b.favorable_rate - a.favorable_rate)[0]
  const showEvidence = !!topPattern && !dismissedEvidence

  const showDeadline = issues.some((i) => CONTRACT_RIGHT_ISSUES.includes(i)) && !dismissedDeadline

  const slots = [showIssue, showEvidence, showDeadline]
  let remaining = MAX_SUGGESTIONS
  const render = slots.map((show) => {
    if (show && remaining > 0) {
      remaining -= 1
      return true
    }
    return false
  })
  const [renderIssue, renderEvidence, renderDeadline] = render

  if (!renderIssue && !renderEvidence && !renderDeadline) return null

  return (
    <div className={styles.wrap} aria-label="AI 제안">
      {renderIssue && suggestion && (
        <div className={styles.card}>
          <span className={styles.iconBadge} aria-hidden="true">
            <Lightbulb size={15} />
          </span>
          <div className={styles.body}>
            <p className={styles.text}>
              이 사건에서는 <strong>{suggestion.issue.replace(/_/g, ' ')}</strong>도 함께 인정된 경우가
              많아요(관련 사례 {suggestion.case_count}건). 해당되는지 확인해보세요.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryBtn} onClick={() => onAddIssue(suggestion.issue)}>
                확인하고 재분석
              </button>
              <button type="button" className={styles.dismissBtn} onClick={() => setDismissedIssue(true)}>
                괜찮아요
              </button>
            </div>
          </div>
        </div>
      )}

      {renderEvidence && topPattern && (
        <div className={styles.card}>
          <span className={styles.iconBadge} aria-hidden="true">
            <FileCheck size={15} />
          </span>
          <div className={styles.body}>
            <p className={styles.text}>
              <strong>{topPattern.source_terms[0] ?? topPattern.type}</strong>이 있으면 유리하게 작용한
              사례가 많았어요. 확보 가능하신가요?
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => {
                  onMarkPossessed(topPattern.type)
                  setDismissedEvidence(true)
                }}
              >
                있어요
              </button>
              <button type="button" className={styles.dismissBtn} onClick={() => setDismissedEvidence(true)}>
                없어요
              </button>
            </div>
          </div>
        </div>
      )}

      {renderDeadline && (
        <div className={styles.card}>
          <span className={styles.iconBadge} aria-hidden="true">
            <Clock size={15} />
          </span>
          <div className={styles.body}>
            <p className={styles.text}>
              위법계약해지권은 위반 사실을 <strong>안 날부터 1년</strong> 이내에만 행사할 수 있어요. 자세한
              내용은 “준비” 탭에서 확인해보세요.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.dismissBtn} onClick={() => setDismissedDeadline(true)}>
                확인했어요
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
