import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { fetchStats } from '../lib/api'
import { MicButton } from '../components/MicButton'
import { DocumentScanner } from '../components/DocumentScanner'
import { AiBubble } from '../components/AiBubble'
import styles from './HomeScreen.module.css'

interface IssueCard {
  id: string
  /** 백엔드 ISSUE_ENUM 값 그대로 — /api/stats의 case_count 조회 키로 쓴다 */
  issue: string
  label: string
  desc: string
  query: string
}

// 데이터가 있는 쟁점만 노출(그래프에 근거가 실제로 있는 것만).
const ISSUE_CARDS: IssueCard[] = [
  {
    id: 'explain',
    issue: '설명의무_위반',
    label: '설명의무 위반',
    desc: '상품 위험을 제대로 설명받지 못했어요',
    query: '가입할 때 상품의 위험성에 대한 설명을 제대로 듣지 못했습니다.',
  },
  {
    id: 'solicit',
    issue: '부당권유',
    label: '부당권유',
    desc: '무리하게 가입을 권유받았어요',
    query: '직원이 원금 보장을 약속하며 무리하게 가입을 권유했습니다.',
  },
  {
    id: 'suitability',
    issue: '적합성원칙_위반',
    label: '적합성원칙 위반',
    desc: '제 투자성향과 맞지 않는 상품이었어요',
    query: '제 투자성향에 맞지 않는 고위험 상품에 가입하게 됐습니다.',
  },
  {
    id: 'mis-sale',
    issue: '불완전판매_기타',
    label: '불완전판매',
    desc: '중요한 내용을 안내받지 못했어요',
    query: '상품의 중요한 내용을 충분히 안내받지 못한 채 가입했습니다.',
  },
  {
    id: 'unauthorized',
    issue: '임의처리_무단거래',
    label: '임의처리·무단거래',
    desc: '동의 없이 처리된 거래가 있어요',
    query: '제 동의 없이 임의로 처리된 거래 때문에 손해를 봤습니다.',
  },
]

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.chevron}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

interface HomeScreenProps {
  onStartConsult: (text: string) => void
  error?: string | null
}

export function HomeScreen({ onStartConsult, error = null }: HomeScreenProps) {
  const [text, setText] = useState('')
  const [totalCases, setTotalCases] = useState<number | null>(null)
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchStats()
      .then((data) => {
        setTotalCases(data.total_cases)
        const counts: Record<string, number> = {}
        for (const i of data.issues) counts[i.issue] = i.case_count
        setIssueCounts(counts)
      })
      .catch(() => {
        // 신뢰 지표·배지는 부가 정보라 조회 실패해도 화면은 그대로 둔다
      })
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onStartConsult(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className={styles.home}>
      <header className={styles.greeting}>
        <p className={styles.hello}>혼자 고민하지 마세요</p>
        <h1 className={styles.headline}>
          {totalCases !== null ? (
            <>
              <span className="mono">{totalCases}건</span>의 실제 분쟁조정 사례로
            </>
          ) : (
            '실제 분쟁조정 사례로'
          )}
          <br />
          상황을 정리해 드릴게요
        </h1>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.cards} aria-label="쟁점 유형 선택">
        <p className={styles.sectionLabel}>어떤 상황인가요?</p>
        {ISSUE_CARDS.map((card) => {
          const count = issueCounts[card.issue]
          return (
            <button
              key={card.id}
              type="button"
              className={styles.card}
              onClick={() => onStartConsult(card.query)}
            >
              <span className={styles.cardMain}>
                <span className={styles.cardLabel}>{card.label}</span>
                <span className={styles.cardDesc}>{card.desc}</span>
              </span>
              <span className={styles.cardRight}>
                {count !== undefined && (
                  <span className={styles.cardBadge}>관련 사례 {count}건</span>
                )}
                <ChevronIcon />
              </span>
            </button>
          )
        })}
      </section>

      <section className={styles.freeform} aria-label="직접 입력">
        <AiBubble>어떤 상황인지 알려주세요. 자세히 적어주실수록 더 정확하게 분석해 드려요.</AiBubble>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputRow}>
            <textarea
              className={styles.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 3년 적금을 중도해지했는데 우대금리를 못 받았습니다"
              rows={3}
            />
            <MicButton onResult={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
          </div>
          <button type="submit" className={styles.submit} disabled={!text.trim()}>
            상담 시작하기
          </button>
        </form>

        <DocumentScanner />
      </section>
    </div>
  )
}
