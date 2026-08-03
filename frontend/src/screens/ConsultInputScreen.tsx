import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { FileWarning, Megaphone, ShieldOff, UserX, Ban, type LucideIcon } from 'lucide-react'
import { MicButton } from '../components/MicButton'
import { DocumentScanner } from '../components/DocumentScanner'
import { AiBubble } from '../components/AiBubble'
import { TopAppBar } from '../app/TopAppBar'
import styles from './ConsultInputScreen.module.css'

interface IssueCard {
  id: string
  issue: string
  label: string
  desc: string
  query: string
  icon: LucideIcon
}

const ISSUE_CARDS: IssueCard[] = [
  {
    id: 'explain',
    issue: '설명의무_위반',
    label: '설명의무 위반',
    desc: '상품 위험을 제대로 설명받지 못했어요',
    query: '가입할 때 상품의 위험성에 대한 설명을 제대로 듣지 못했습니다.',
    icon: FileWarning,
  },
  {
    id: 'solicit',
    issue: '부당권유',
    label: '부당권유',
    desc: '무리하게 가입을 권유받았어요',
    query: '직원이 원금 보장을 약속하며 무리하게 가입을 권유했습니다.',
    icon: Megaphone,
  },
  {
    id: 'suitability',
    issue: '적합성원칙_위반',
    label: '적합성원칙 위반',
    desc: '제 투자성향과 맞지 않는 상품이었어요',
    query: '제 투자성향에 맞지 않는 고위험 상품에 가입하게 됐습니다.',
    icon: UserX,
  },
  {
    id: 'mis-sale',
    issue: '불완전판매_기타',
    label: '불완전판매',
    desc: '중요한 내용을 안내받지 못했어요',
    query: '상품의 중요한 내용을 충분히 안내받지 못한 채 가입했습니다.',
    icon: ShieldOff,
  },
  {
    id: 'unauthorized',
    issue: '임의처리_무단거래',
    label: '임의처리·무단거래',
    desc: '동의 없이 처리된 거래가 있어요',
    query: '제 동의 없이 임의로 처리된 거래 때문에 손해를 봤습니다.',
    icon: Ban,
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

interface ConsultInputScreenProps {
  onStartConsult: (text: string) => void
  onBack: () => void
}

export function ConsultInputScreen({ onStartConsult, onBack }: ConsultInputScreenProps) {
  const [text, setText] = useState('')

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
    <div className={styles.screen}>
      <TopAppBar title="상담 시작" onBack={onBack} />
      
      <div className={styles.content}>
        <section className={styles.cards} aria-label="쟁점 유형 선택">
          <p className={styles.sectionLabel}>어떤 상황인가요?</p>
          {ISSUE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.id}
                type="button"
                className={styles.card}
                onClick={() => onStartConsult(card.query)}
              >
                <span className={styles.cardIcon} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className={styles.cardMain}>
                  <span className={styles.cardLabel}>{card.label}</span>
                  <span className={styles.cardDesc}>{card.desc}</span>
                </span>
                <span className={styles.cardRight}>
                  <ChevronIcon />
                </span>
              </button>
            )
          })}
        </section>

        <section className={styles.freeform} aria-label="직접 입력">
          <AiBubble>어떤 상황인지 알려주세요. 자세히 적어주실수록 더 정확하게 분석해 드려요.</AiBubble>
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputContainer}>
              <textarea
                className={styles.input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="예: 3년 적금을 중도해지했는데 우대금리를 못 받았습니다"
                rows={4}
              />
            </div>
            <div className={styles.toolbar}>
              <MicButton onResult={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
              <DocumentScanner compact />
            </div>
            <button type="submit" className={styles.submit} disabled={!text.trim()}>
              상담 시작하기
            </button>
          </form>
        </section>
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
        </p>
      </footer>
    </div>
  )
}
