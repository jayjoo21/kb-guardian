import { useState, useEffect } from 'react'
import { TopAppBar } from '../app/TopAppBar'
import { BookOpen, ArrowRight, Lightbulb, FileText } from 'lucide-react'
import { fetchLearningContent, type LearningPoint, type LearningTerm } from '../lib/api'
import styles from './LearningScreen.module.css'

interface LearningScreenProps {
  onBack: () => void
  onStartConsult: (text: string) => void
}

// 목데이터
const mockLearningData = {
  issues: [
    {
      id: 1,
      title: "설명의무 위반",
      description: "금융회사가 상품의 중요한 내용을 제대로 설명하지 않은 경우",
      caseCount: 73,
      caseNumber: "제2023-1호",
      example: "원금 보장형이라고 설명했으나 실제로는 원금 손실 가능성이 있는 상품"
    },
    {
      id: 2,
      title: "적합성원칙 위반",
      description: "고객의 투자 성향과 맞지 않는 상품을 판매한 경우",
      caseCount: 33,
      caseNumber: "제2022-5호",
      example: "보수적 성향의 고객에게 고위험 파생상품 판매"
    },
    {
      id: 3,
      title: "부당권유",
      description: "불공정한 방법으로 상품 가입을 권유한 경우",
      caseCount: 51,
      caseNumber: "제2023-3호",
      example: "'무조건 이익 본다'며 가입을 강요"
    }
  ],
  terms: [
    { term: "간이투자설명서", definition: "투자 상품의 핵심 내용을 요약한 문서" },
    { term: "적합성원칙", definition: "고객의 투자 성향에 맞는 상품을 판매해야 하는 원칙" },
    { term: "해피콜", definition: "상품 가입 후 확인 전화" },
    { term: "녹인(Knock-in)", definition: "특정 가격 이하로 떨어지면 손실이 확정되는 조건" }
  ]
}

export function LearningScreen({ onBack, onStartConsult }: LearningScreenProps) {
  const [points, setPoints] = useState<LearningPoint[]>([])
  const [terms, setTerms] = useState<LearningTerm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 목데이터 사용 (API 호출 실패 시)
    setPoints(mockLearningData.issues as any)
    setTerms(mockLearningData.terms as any)
    setLoading(false)
    
    // 실제 API 호출 시도
    fetchLearningContent()
      .then((data) => {
        if (data.points.length > 0 || data.terms.length > 0) {
          setPoints(data.points)
          setTerms(data.terms)
        }
      })
      .catch((err) => {
        console.error('학습 콘텐츠 조회 실패:', err)
        // 목데이터 유지
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
                {points.map((point: any) => (
                  <div key={point.id || point.case_id} className={styles.pointCard}>
                    <div className={styles.pointHeader}>
                      <span className={styles.pointIssue}>{point.title || point.issue}</span>
                      <span className={styles.pointCount}>{point.caseCount || point.case_count}건</span>
                    </div>
                    <p className={styles.pointSummary}>{point.description || point.summary}</p>
                    <div className={styles.pointMeta}>
                      <span className={styles.pointCaseId}>사건번호: {point.caseNumber || point.case_id}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.consultButton}
                      onClick={() => handleConsultWithIssue(point.title || point.issue)}
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
                {terms.map((term: any) => (
                  <div key={term.term} className={styles.termCard}>
                    <div className={styles.termHeader}>
                      <FileText size={16} className={styles.termIcon} />
                      <span className={styles.termName}>{term.term}</span>
                    </div>
                    <p className={styles.termDescription}>{term.definition || term.description}</p>
                    <div className={styles.termMeta}>
                      <span className={styles.termCount}>결정문 등장</span>
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
