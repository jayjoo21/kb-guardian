import { useState } from 'react'
import { ChevronDown, MessageCircleQuestion } from 'lucide-react'
import { fetchCaseDetail, type CaseDetail, type Evidence, type Procedure } from '../../lib/api'
import styles from './FollowUpQuestions.module.css'

type QuestionId = 'case_detail' | 'documents' | 'no_mediation'

const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: 'case_detail', label: '이 결정례 자세히' },
  { id: 'documents', label: '서류 준비법' },
  { id: 'no_mediation', label: '조정이 안 되면?' },
]

interface FollowUpQuestionsProps {
  evidence: Evidence | null
  procedure: Procedure | null
}

/** "AI에게 더 물어보기" — 자유 대화가 아니라 정해진 후속질문 3개만 제공하고, 답은
    이번 상담에서 이미 확보한 데이터(evidence/procedure, 결정례 상세 조회)로만
    구성한다. 새로 LLM을 호출해 임의로 답을 만들지 않는다(맥락은 이번 상담 범위로
    한정). "조정이 안 되면?"만 사안과 무관한 일반 절차 안내라 고정 문구를 쓴다. */
export function FollowUpQuestions({ evidence, procedure }: FollowUpQuestionsProps) {
  const [open, setOpen] = useState<QuestionId | null>(null)
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [loadingCase, setLoadingCase] = useState(false)

  const topCase = evidence?.similar_cases[0] ?? null
  const hasDocuments = !!procedure && procedure.documents.length > 0

  const availableQuestions = QUESTIONS.filter((q) => {
    if (q.id === 'case_detail') return !!topCase
    if (q.id === 'documents') return !!procedure
    return true
  })

  if (availableQuestions.length === 0) return null

  function toggle(id: QuestionId) {
    const next = open === id ? null : id
    setOpen(next)
    if (next === 'case_detail' && topCase && !caseDetail) {
      setLoadingCase(true)
      fetchCaseDetail(topCase.case_id)
        .then(setCaseDetail)
        .catch(() => {})
        .finally(() => setLoadingCase(false))
    }
  }

  return (
    <section className={`${styles.card} card`} aria-label="AI에게 더 물어보기">
      <div className={styles.header}>
        <span className={styles.iconBadge} aria-hidden="true">
          <MessageCircleQuestion size={16} />
        </span>
        <h2 className={styles.title}>AI에게 더 물어보기</h2>
      </div>

      <ul className={styles.list}>
        {availableQuestions.map((q) => {
          const isOpen = open === q.id
          return (
            <li key={q.id} className={styles.item}>
              <button
                type="button"
                className={styles.question}
                onClick={() => toggle(q.id)}
                aria-expanded={isOpen}
              >
                <span>{q.label}</span>
                <ChevronDown className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} size={15} aria-hidden="true" />
              </button>

              {isOpen && (
                <div className={styles.answer}>
                  {q.id === 'case_detail' && topCase && (
                    loadingCase ? (
                      <p className={styles.loading}>불러오는 중…</p>
                    ) : (
                      <>
                        <p className={styles.answerText}>
                          {topCase.case_no ? `금감원 분쟁조정 ${topCase.case_no}` : `사건 ${topCase.case_id}`} ·{' '}
                          {topCase.title}
                          {topCase.result ? ` · ${topCase.result}` : ''}
                        </p>
                        {caseDetail?.summary && <p className={styles.answerText}>{caseDetail.summary}</p>}
                        {caseDetail?.recommendation && (
                          <p className={styles.answerText}>위원회 권고: {caseDetail.recommendation}</p>
                        )}
                        <p className={styles.hint}>전체 내용은 “근거” 탭에서 펼쳐볼 수 있어요.</p>
                      </>
                    )
                  )}

                  {q.id === 'documents' && procedure && (
                    hasDocuments ? (
                      <>
                        <p className={styles.answerText}>이번 사안에서는 이런 서류를 준비하면 좋아요.</p>
                        <ul className={styles.docList}>
                          {procedure.documents.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                        <p className={styles.hint}>체크리스트는 “준비” 탭에서 확인·체크할 수 있어요.</p>
                      </>
                    ) : (
                      <p className={styles.answerText}>
                        이번 사안에 특정된 서류 안내는 확인되지 않았어요. “준비” 탭의 절차를 참고해주세요.
                      </p>
                    )
                  )}

                  {q.id === 'no_mediation' && (
                    <p className={styles.answerText}>
                      금융감독원 분쟁조정은 양측이 조정안에 동의해야 성립돼요. 조정이 성립되면 재판상 화해와
                      같은 효력이 있지만, 불성립되거나 결과에 동의하지 않으시면 법원에 소송을 제기하실 수
                      있어요. 그동안 제출한 자료와 주장은 소송에서도 그대로 활용할 수 있습니다.
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
