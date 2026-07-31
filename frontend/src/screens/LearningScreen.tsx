import { useState, useEffect } from 'react'
import { TopAppBar } from '../app/TopAppBar'
import { BookOpen, ArrowRight, Lightbulb, FileText } from 'lucide-react'
import { fetchLearningContent, type LearningPoint, type LearningTerm } from '../lib/api'
import styles from './LearningScreen.module.css'

interface LearningScreenProps {
  onBack: () => void
  onStartConsult: (text: string) => void
}

export function LearningScreen({ onBack, onStartConsult }: LearningScreenProps) {
  const [points, setPoints] = useState<LearningPoint[]>([])
  const [terms, setTerms] = useState<LearningTerm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLearningContent()
      .then((data) => {
        setPoints(data.points)
        setTerms(data.terms)
        setLoading(false)
      })
      .catch((err) => {
        console.error('학습 콘텐츠 조회 실패:', err)
        setLoading(false)
      })
  }, [])

  function handleConsultWithIssue(issue: string) {
    const text = `${issue} 관련해서 분쟁이 발생했어요. 어떻게 대응해야 할까요?`
    onStartConsult(text)
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="금융 학습" onBack={onBack} />
      
      <div className={styles.content}>
        <section className={styles.introSection}>
          <div className={styles.introBadge}>
            <Lightbulb size={16} className={styles.introBadgeIcon} />
            <span className={styles.introBadgeText}>학습</span>
          </div>
          <h2 className={styles.introTitle}>실제 사례로 배우는 금융 상식</h2>
          <p className={styles.introDesc}>
            금감원 분쟁조정 실제 사례를 통해 금융 상품의 쟁점과 중요 용어를 배워보세요.
          </p>
        </section>

        {loading ? (
          <p className={styles.loading}>로딩 중...</p>
        ) : (
          <>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>쟁점별 실제 사례</h3>
              <div className={styles.cardGrid}>
                {points.map((point) => (
                  <div key={point.case_id} className={styles.pointCard}>
                    <div className={styles.pointHeader}>
                      <span className={styles.pointIssue}>{point.issue}</span>
                      <span className={styles.pointCount}>{point.case_count}건</span>
                    </div>
                    <p className={styles.pointSummary}>{point.summary}</p>
                    <div className={styles.pointMeta}>
                      <span className={styles.pointCaseId}>사건번호: {point.case_id}</span>
                      {point.avg_ratio && (
                        <span className={styles.pointRatio}>
                          평균 배상: {point.avg_ratio.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.consultButton}
                      onClick={() => handleConsultWithIssue(point.issue)}
                    >
                      <span className={styles.consultButtonText}>이런 상황이면 상담해보기</span>
                      <ArrowRight size={16} className={styles.consultButtonIcon} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>금융 용어</h3>
              <div className={styles.termGrid}>
                {terms.map((term) => (
                  <div key={term.term} className={styles.termCard}>
                    <div className={styles.termHeader}>
                      <FileText size={16} className={styles.termIcon} />
                      <span className={styles.termName}>{term.term}</span>
                    </div>
                    <p className={styles.termDescription}>{term.description}</p>
                    <div className={styles.termMeta}>
                      <span className={styles.termCount}>{term.case_count}건에서 등장</span>
                      {term.example_cases.length > 0 && (
                        <span className={styles.termCases}>
                          예: {term.example_cases.slice(0, 2).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          ※ 모든 콘텐츠는 금감원 분쟁조정 실제 사례를 기반으로 제공됩니다.
          법률 자문이 아닌 참고 정보입니다.
        </p>
      </footer>
    </div>
  )
}
