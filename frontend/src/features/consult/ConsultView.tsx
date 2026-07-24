import { GraphCanvasPlaceholder } from './GraphCanvasPlaceholder'
import { AnswerPanelPlaceholder } from './AnswerPanelPlaceholder'
import styles from './ConsultView.module.css'

export function ConsultView() {
  return (
    <div className={styles.split}>
      <section className={styles.canvasPane} aria-label="근거 그래프">
        <GraphCanvasPlaceholder />
      </section>
      <section className={styles.answerPane} aria-label="상담 답변">
        <AnswerPanelPlaceholder />
      </section>
    </div>
  )
}
