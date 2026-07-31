import { useState, useEffect } from 'react'
import { TopAppBar } from '../app/TopAppBar'
import { Loader2, CheckCircle2, Circle } from 'lucide-react'
import { 
  streamConsult, 
  type AgentStep, 
  type Classified, 
  type Evidence, 
  type Procedure,
  type ConsultStreamHandlers 
} from '../lib/api'
import styles from './ConsultResultScreen.module.css'

interface ConsultResultScreenProps {
  query: string
  onBack: () => void
  onComplete: (data: {
    classified: Classified
    evidence: Evidence | null
    procedure: Procedure | null
    answer: string
  }) => void
}

const AGENT_STEPS = [
  { step: 'classify', label: '1단계: 민원 내용 및 쟁점 분류' },
  { step: 'search', label: '2단계: 196건 결정례 지식그래프 탐색' },
  { step: 'argument_analysis', label: '3단계: 은행 반박 논리 분석' },
  { step: 'evidence_evaluation', label: '4단계: 증거 자료 및 배상비율 평가' },
  { step: 'answer', label: '5단계: 대응 전략 및 서류 가이드 생성' },
]

export function ConsultResultScreen({ query, onBack, onComplete }: ConsultResultScreenProps) {
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState<string>('classify')
  const [classified, setClassified] = useState<Classified | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [procedure, setProcedure] = useState<Procedure | null>(null)
  const [answer, setAnswer] = useState<string>('')

  const handlers: ConsultStreamHandlers = {
    onAgentStep: (data: AgentStep) => {
      setCurrentStep(data.step)
      setCompletedSteps((prev) => {
        if (!prev.includes(data.step)) {
          // 이전 단계들은 완료 처리
          const currentIndex = AGENT_STEPS.findIndex(s => s.step === data.step)
          const previousSteps = AGENT_STEPS.slice(0, currentIndex).map(s => s.step)
          return Array.from(new Set([...prev, ...previousSteps]))
        }
        return prev
      })
    },
    onClassified: (data) => setClassified(data),
    onEvidence: (data) => setEvidence(data),
    onProcedure: (data) => setProcedure(data),
    onAnswerChunk: (delta) => setAnswer((prev) => prev + delta),
    onDone: (finalAnswer) => {
      setCompletedSteps(AGENT_STEPS.map(s => s.step))
      if (classified && evidence) {
        onComplete({ classified, evidence, procedure, answer: finalAnswer })
      }
    },
    onError: (msg) => console.error('Consult error:', msg),
  }

  useEffect(() => {
    streamConsult(query, handlers).catch(console.error)
  }, [query])

  return (
    <div className={styles.screen}>
      <TopAppBar title="AI 에이전트 분석 중" onBack={onBack} />
      <div className={styles.body}>
        <p className={styles.query}>"{query}"</p>

        <div className={styles.agentBox}>
          <h3 className={styles.agentTitle}>KB 금융 분쟁 대응 에이전트 가동 중</h3>
          <div className={styles.stepList}>
            {AGENT_STEPS.map((item) => {
              const isCompleted = completedSteps.includes(item.step)
              const isCurrent = currentStep === item.step && !isCompleted

              return (
                <div key={item.step} className={`${styles.stepItem} ${isCurrent ? styles.activeStep : ''}`}>
                  {isCompleted ? (
                    <CheckCircle2 size={20} className={styles.iconCompleted} />
                  ) : isCurrent ? (
                    <Loader2 size={20} className={styles.iconSpinner} />
                  ) : (
                    <Circle size={20} className={styles.iconPending} />
                  )}
                  <span className={styles.stepLabel}>{item.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}