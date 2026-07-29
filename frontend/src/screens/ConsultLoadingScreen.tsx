import { TopAppBar } from '../app/TopAppBar'
import styles from './ConsultLoadingScreen.module.css'

interface ConsultLoadingScreenProps {
  query: string
  classifiedDone: boolean
  evidenceDone: boolean
  answerDone: boolean
  onBack: () => void
}

const STAGE_LABELS = ['사건 유형 분석', '유사 결정례 검색', '대응 가이드 생성']

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

/** 실제 SSE 이벤트(classified/evidence/done) 도착에 맞춰 3단계가 순차 체크된다.
    답변이 완성(done)될 때까지 이 화면을 유지하고, 그 뒤 완성된 리포트를 한 번에
    페이드인한다(스트리밍 타이핑 표시 없음). App.tsx가 답변 완성 후 짧은 지연을
    두고 result로 전환하므로, 3단계 체크가 화면에 실제로 보인 뒤 넘어간다. */
export function ConsultLoadingScreen({
  query,
  classifiedDone,
  evidenceDone,
  answerDone,
  onBack,
}: ConsultLoadingScreenProps) {
  const doneFlags = [classifiedDone, evidenceDone, answerDone]
  const activeIndex = doneFlags.findIndex((done) => !done)

  return (
    <div className={styles.screen}>
      <TopAppBar title="상담 분석" onBack={onBack} />
      <div className={styles.body}>
        <p className={styles.query}>“{query}”</p>

        <ul className={styles.stages} aria-live="polite">
          {STAGE_LABELS.map((label, i) => {
            const done = doneFlags[i]
            const active = i === activeIndex
            return (
              <li
                key={label}
                className={`${styles.stage} ${done ? styles.stageDone : ''} ${active ? styles.stageActive : ''}`}
              >
                <span className={styles.stageIcon} aria-hidden="true">
                  {done ? <CheckIcon /> : active ? <span className={styles.spinner} /> : null}
                </span>
                <span className={styles.stageLabel}>{label}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
