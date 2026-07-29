import { TopAppBar } from '../app/TopAppBar'
import type { AgentStep, AgentStepId, ClarificationCandidate } from '../lib/api'
import styles from './ConsultLoadingScreen.module.css'

interface ConsultLoadingScreenProps {
  query: string
  steps: AgentStep[]
  answerDone: boolean
  clarification: ClarificationCandidate[] | null
  onPickClarification: (issue: string) => void
  onBack: () => void
}

const STAGE_ORDER: AgentStepId[] = ['classify', 'search', 'argument_analysis', 'evidence_evaluation', 'answer']

const STAGE_LABELS: Record<AgentStepId, string> = {
  classify: '① 사건 분류',
  search: '② 결정례 검색',
  argument_analysis: '③ 쟁점·반박 분석',
  evidence_evaluation: '④ 증거 평가',
  answer: '⑤ 대응 전략',
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

/** 실제 백엔드 agent_step 이벤트(오케스트레이터가 매 판단마다 보내는 판단 로그)를
    그대로 5단계 목록으로 보여준다 — 연출용 타이머가 아니라 실제 도착 순서·내용
    그대로다. ⑤ 대응 전략은 판단(agent_step) 도착 시 진행 중으로, 답변 스트리밍이
    실제로 끝난(answerDone) 뒤에야 완료 체크된다. 분류가 모호하면(clarification)
    단계 목록 대신 되묻기 화면을 보여준다. */
export function ConsultLoadingScreen({
  query,
  steps,
  answerDone,
  clarification,
  onPickClarification,
  onBack,
}: ConsultLoadingScreenProps) {
  const byId = new Map(steps.map((s) => [s.step, s]))
  const doneFlags = STAGE_ORDER.map((id) => (id === 'answer' ? answerDone : byId.has(id)))
  const activeIndex = doneFlags.findIndex((done) => !done)

  return (
    <div className={styles.screen}>
      <TopAppBar title="상담 분석" onBack={onBack} />
      <div className={styles.body}>
        <p className={styles.query}>“{query}”</p>

        {clarification ? (
          <div className={styles.clarify}>
            <p className={styles.clarifyTitle}>혹시 이런 상황에 가까운가요?</p>
            <p className={styles.clarifySubtitle}>가장 가까운 쟁점을 골라주시면 이어서 분석할게요</p>
            <ul className={styles.clarifyList}>
              {clarification.map((c) => (
                <li key={c.issue}>
                  <button
                    type="button"
                    className={styles.clarifyOption}
                    onClick={() => onPickClarification(c.issue)}
                  >
                    <span>{c.issue.replace(/_/g, ' ')}</span>
                    <span className={styles.clarifyCount}>관련 사례 {c.case_count}건</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className={styles.stages} aria-live="polite">
            {STAGE_ORDER.map((id, i) => {
              const done = doneFlags[i]
              const active = i === activeIndex
              const reason = byId.get(id)?.decision_reason
              return (
                <li
                  key={id}
                  className={`${styles.stage} ${done ? styles.stageDone : ''} ${active ? styles.stageActive : ''}`}
                >
                  <span className={styles.stageIcon} aria-hidden="true">
                    {done ? <CheckIcon /> : active ? <span className={styles.spinner} /> : null}
                  </span>
                  <span className={styles.stageText}>
                    <span className={styles.stageLabel}>{STAGE_LABELS[id]}</span>
                    {reason && (done || active) && <span className={styles.stageReason}>{reason}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
