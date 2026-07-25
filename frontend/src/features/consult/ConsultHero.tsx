import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { fetchStats } from '../../lib/api'
import styles from './ConsultHero.module.css'

const EXAMPLES = [
  {
    label: '적금 중도해지·우대금리',
    text: '3년 적금을 중도해지했는데, 가입할 때 설명받지 못한 조건 때문에 우대금리를 못 받았어요.',
  },
  {
    label: '펀드 권유·투자손실',
    text: '정기예금을 하러 갔는데 직원이 펀드를 권유해서 가입했다가 손실이 났어요.',
  },
  {
    label: '승인 없는 카드결제',
    text: '제 승인 없이 카드가 결제된 내역이 있는데 은행이 책임지지 않으려고 해요.',
  },
]

interface ConsultHeroProps {
  onSubmit: (text: string) => void
  error?: string | null
}

/** 입력 전 첫 화면. 좌우 분할·그래프·목업 답변 없이 "무엇을 입력할지"만 안내한다. */
export function ConsultHero({ onSubmit, error = null }: ConsultHeroProps) {
  const [text, setText] = useState('')
  const [totalCases, setTotalCases] = useState<number | null>(null)

  useEffect(() => {
    fetchStats()
      .then((data) => setTotalCases(data.total_cases))
      .catch(() => {
        // 신뢰 지표는 부가 정보라 조회 실패해도 화면은 그대로 둔다
      })
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className={styles.hero}>
      <div className={styles.inner}>
        <h1 className={styles.headline}>어떤 금융 분쟁을 겪고 계신가요?</h1>
        <p className={styles.subline}>상황을 편하게 적어주시면 유사 사례와 근거를 찾아드립니다.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="예: 3년 적금을 중도해지했는데 우대금리를 못 받았습니다"
            rows={2}
            autoFocus
          />
          <button type="submit" className={styles.submit} disabled={!text.trim()}>
            상담하기
          </button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.examples} aria-label="예시 민원">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className={styles.exampleChip}
              onClick={() => setText(ex.text)}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {totalCases !== null && (
        <p className={styles.trust}>
          <span className="mono">{totalCases}건</span>의 실제 금융감독원 분쟁조정 사례 기반
        </p>
      )}
    </div>
  )
}
