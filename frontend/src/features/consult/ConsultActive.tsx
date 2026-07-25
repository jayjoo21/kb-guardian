import { useState, type FormEvent } from 'react'
import { Chip } from '../../components/Chip'
import { RatioSimulator } from '../simulator/RatioSimulator'
import type { Classified } from '../../lib/api'
import styles from './ConsultActive.module.css'

interface ConsultActiveProps {
  text: string
  streaming: boolean
  classified: Classified | null
  answer: string
  onResubmit: (text: string) => void
}

/** LOADING(classified 도착 전)과 RESULT(도착 후)를 함께 다룬다 — 입력창이 상단에 작게
    고정된다는 점만 같고 아래 내용이 "분석 중" 표시 ↔ 실제 결과로 바뀌는 구조라 화면
    전환처럼 보이되 컴포넌트는 하나로 유지한다. */
export function ConsultActive({ text, streaming, classified, answer, onResubmit }: ConsultActiveProps) {
  const [draft, setDraft] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed) return
    onResubmit(trimmed)
    setDraft('')
  }

  const chips = classified ? [...classified.issues, ...classified.products] : []

  return (
    <div className={styles.active}>
      <div className={styles.compactBar}>
        <form className={`${styles.compactForm} container`} onSubmit={handleSubmit}>
          <input
            className={styles.compactInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="다른 상황도 물어보세요"
          />
          <button type="submit" className={styles.compactSubmit} disabled={!draft.trim()}>
            상담하기
          </button>
        </form>
      </div>

      {!classified ? (
        <div className={styles.loading} aria-live="polite" aria-busy="true">
          <span className={styles.loadingDot} aria-hidden="true" />
          <span>분석 중…</span>
        </div>
      ) : (
        <div className={`${styles.result} container`}>
          <p className={styles.userText}>{text}</p>

          {chips.length > 0 && (
            <div className={styles.chips} aria-label="분류된 쟁점·상품">
              {chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
          )}

          <div className={styles.grid}>
            <section className={`${styles.answerCard} card`} aria-label="답변">
              <div className={styles.answer} aria-live="polite">
                {answer.split('\n\n').filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
                {streaming && <span className={styles.cursor} aria-hidden="true" />}
              </div>
            </section>

            <aside className={`${styles.evidenceCard} card`} aria-label="근거">
              <RatioSimulator initialIssue={classified.issues[0] ?? null} />
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
