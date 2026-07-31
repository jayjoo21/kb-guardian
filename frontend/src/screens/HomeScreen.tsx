import { useEffect, useState } from 'react'
import { 
  Shield, AlertTriangle, FileText, 
  Scale, BarChart3, BookOpen, ChevronRight, type LucideIcon 
} from 'lucide-react'
import { fetchStats } from '../lib/api'
import styles from './HomeScreen.module.css'

interface IssueCard {
  id: string
  issue: string
  label: string
  desc: string
  query: string
  icon: LucideIcon
}

// 데이터가 있는 쟁점만 노출(그래프에 근거가 실제로 있는 것만).
const ISSUE_CARDS: IssueCard[] = [
  {
    id: 'solicit',
    issue: '부당권유',
    label: '부당권유',
    desc: '무리하게 가입을 권유받았어요',
    query: '직원이 원금 보장을 약속하며 무리하게 가입을 권유했습니다.',
    icon: AlertTriangle,
  },
  {
    id: 'suitability',
    issue: '적합성원칙_위반',
    label: '적합성원칙 위반',
    desc: '제 투자성향과 맞지 않는 상품이었어요',
    query: '제 투자성향에 맞지 않는 고위험 상품에 가입하게 됐습니다.',
    icon: Shield,
  },
  {
    id: 'mis-sale',
    issue: '불완전판매_기타',
    label: '불완전판매',
    desc: '중요한 내용을 안내받지 못했어요',
    query: '상품의 중요한 내용을 충분히 안내받지 못한 채 가입했습니다.',
    icon: FileText,
  },
  {
    id: 'unauthorized',
    issue: '임의처리_무단거래',
    label: '임의처리·무단거래',
    desc: '동의 없이 처리된 거래가 있어요',
    query: '제 동의 없이 임의로 처리된 거래 때문에 손해를 봤습니다.',
    icon: AlertTriangle,
  },
]

interface QuickMenuItem {
  id: string
  label: string
  icon: LucideIcon
  handler: () => void
}

interface HomeScreenProps {
  onStartConsult: (text: string) => void
  onNavigateToRights?: () => void
  onNavigateToStats?: () => void
  onNavigateToPrevention?: () => void
  onNavigateToLearning?: () => void
  error?: string | null
}

export function HomeScreen({ onStartConsult, onNavigateToRights, onNavigateToStats, onNavigateToPrevention, onNavigateToLearning, error = null }: HomeScreenProps) {
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({})

  const QUICK_MENU: QuickMenuItem[] = [
    {
      id: 'dispute',
      label: '분쟁 대응',
      icon: Shield,
      handler: () => {}, // TODO: 분쟁 대응 화면 연결
    },
    {
      id: 'prevention',
      label: '예방 진단',
      icon: AlertTriangle,
      handler: () => onNavigateToPrevention?.(),
    },
    {
      id: 'document',
      label: '서류 진단',
      icon: FileText,
      handler: () => {}, // TODO: 서류 진단 화면 연결
    },
    {
      id: 'rights',
      label: '내 권리',
      icon: Scale,
      handler: () => onNavigateToRights?.(),
    },
    {
      id: 'stats',
      label: '사례 통계',
      icon: BarChart3,
      handler: () => onNavigateToStats?.(),
    },
    {
      id: 'learning',
      label: '금융 학습',
      icon: BookOpen,
      handler: () => onNavigateToLearning?.(),
    },
  ]

  useEffect(() => {
    fetchStats()
      .then((data) => {
        const counts: Record<string, number> = {}
        for (const i of data.issues) counts[i.issue] = i.case_count
        setIssueCounts(counts)
      })
      .catch(() => {
        // 신뢰 지표·배지는 부가 정보라 조회 실패해도 화면은 그대로 둔다
      })
  }, [])

  return (
    <div className={styles.home}>
      {/* 히어로 카드 (컴팩트) */}
      <section className={styles.heroSection}>
        <div className={styles.heroCard}>
          <div className={styles.heroBadge}>
            <Shield size={14} className={styles.heroBadgeIcon} />
            <span className={styles.heroBadgeText}>AI 진단</span>
          </div>
          <h2 className={styles.heroTitle}>내 상황, 근거로 진단하기</h2>
          <p className={styles.heroDesc}>
            실제 분쟁조정 사례를 바탕으로 내 상황을 분석해 드려요
          </p>
          <button 
            type="button" 
            className={styles.heroCta}
            onClick={() => onStartConsult('')}
          >
            진단 시작하기
          </button>
        </div>
      </section>

      {/* 퀵메뉴 6개 */}
      <section className={styles.quickMenuSection}>
        <div className={styles.quickMenuGrid}>
          {QUICK_MENU.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={styles.quickMenuItem}
                onClick={item.handler}
              >
                <span className={styles.quickMenuIcon} aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className={styles.quickMenuLabel}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 분쟁 예시 섹션 */}
      <section className={styles.issueSection}>
        <p className={styles.sectionLabel}>자주 있는 분쟁 유형</p>
        <div className={styles.issueList}>
          {ISSUE_CARDS.map((card) => {
            const count = issueCounts[card.issue]
            const Icon = card.icon
            return (
              <button
                key={card.id}
                type="button"
                className={styles.issueCard}
                onClick={() => onStartConsult(card.query)}
              >
                <span className={styles.issueMain}>
                  <span className={styles.issueIcon} aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className={styles.issueLabel}>{card.label}</span>
                  <span className={styles.issueDesc}>{card.desc}</span>
                </span>
                <span className={styles.issueRight}>
                  {count !== undefined && (
                    <span className={styles.issueBadge}>{count}건</span>
                  )}
                  <ChevronRight size={16} className={styles.chevron} />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      {/* 법적 고지 */}
      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
        </p>
      </footer>
    </div>
  )
}
