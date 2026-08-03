import { useEffect, useState } from 'react'
import {
  Shield, AlertTriangle, Scale, BookOpen, ChevronRight, Scan, Bell, X,
  Search, FileCheck, Map, Megaphone, MousePointer2, BellRing,
  MessageSquareWarning, ShieldAlert, CheckSquare, PenTool, type LucideIcon,
} from 'lucide-react'
import { fetchStats } from '../lib/api'
import { type PreventionMode } from './PreventionScreen'
import { type ConsumerRightsMode } from './ConsumerRightsScreen'
import { type ResultTabId } from './result/ResultTabBar'
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
    id: 'explanation',
    issue: '설명의무_위반',
    label: '설명의무 위반',
    desc: '원금 손실 등 중요 사항 설명 누락',
    query: '원금 손실 가능성 등 중요한 사항을 설명받지 못했습니다.',
    icon: AlertTriangle,
  },
  {
    id: 'suitability',
    issue: '적합성원칙_위반',
    label: '적합성원칙 위반',
    desc: '투자성향을 무시한 고위험 상품 가입',
    query: '제 투자성향에 맞지 않는 고위험 상품에 가입하게 됐습니다.',
    icon: Shield,
  },
  {
    id: 'solicit',
    issue: '부당권유',
    label: '부당권유',
    desc: '안전하다며 무리한 가입 유도',
    query: '직원이 원금 보장을 약속하며 무리하게 가입을 권유했습니다.',
    icon: AlertTriangle,
  },
  {
    id: 'unauthorized',
    issue: '무단거래_기타',
    label: '무단거래·예금 부당지급',
    desc: '본인 확인 없는 임의 거래 및 착오송금',
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
  onStartConsult: (text: string, focus?: { tab: ResultTabId; title: string }) => void
  onNavigateToRights?: (mode: ConsumerRightsMode) => void
  onNavigateToStats?: () => void
  onNavigateToPrevention?: (mode: PreventionMode) => void
  onNavigateToLearning?: () => void
  onNavigateToSimulation?: () => void
  error?: string | null
}

export function HomeScreen({ onStartConsult, onNavigateToRights, onNavigateToStats, onNavigateToPrevention, onNavigateToLearning, onNavigateToSimulation, error = null }: HomeScreenProps) {
  const [issueCounts, setIssueCounts] = useState<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<'prevention' | 'safety'>('prevention')
  const [isNotiOpen, setIsNotiOpen] = useState(false)

  function handleFeatureAction(itemId: string) {
    switch (itemId) {
      case 'ai-diagnosis':
        onStartConsult('')
        break
      case 'similar-cases':
        onNavigateToStats?.()
        break
      case 'bank-prediction':
        onStartConsult('은행 반박 예측이 필요합니다. 현재 상황을 자세히 알려주세요.', {
          tab: 'analysis',
          title: '은행 반박 예측 결과',
        })
        break
      case 'evidence-evaluation':
        onStartConsult('제 증거 자료를 바탕으로 평가해 주세요.', {
          tab: 'prepare',
          title: '증거 자료 평가 결과',
        })
        break
      case 'document-check':
        onNavigateToPrevention?.('required-docs')
        break
      case 'submit-check':
        onNavigateToPrevention?.('submit-check')
        break
      case 'auto-application':
        onStartConsult('분쟁조정 신청서 초안이 필요합니다. 현재 상황을 설명해 주세요.')
        break
      case 'dictionary':
        onNavigateToLearning?.()
        break
      case 'procedure':
        onNavigateToPrevention?.('procedure')
        break
      case 'report':
        onNavigateToRights?.('report')
        break
      case 'simulation':
        onNavigateToSimulation?.()
        break
      case 'rights-alert':
        onNavigateToRights?.('alert')
        break
      default:
        onStartConsult('')
        break
    }
  }

  const PREVENTION_MENU: QuickMenuItem[] = [
    {
      id: 'ai-diagnosis',
      label: '상황 AI 진단',
      icon: MessageSquareWarning,
      handler: () => handleFeatureAction('ai-diagnosis'),
    },
    {
      id: 'similar-cases',
      label: '유사 사례 탐색',
      icon: Search,
      handler: () => handleFeatureAction('similar-cases'),
    },
    {
      id: 'bank-prediction',
      label: '은행 반박 예측',
      icon: ShieldAlert,
      handler: () => handleFeatureAction('bank-prediction'),
    },
    {
      id: 'evidence-evaluation',
      label: '증거 자료 평가',
      icon: Scale,
      handler: () => handleFeatureAction('evidence-evaluation'),
    },
    {
      id: 'submit-check',
      label: '제출 서류 체크',
      icon: CheckSquare,
      handler: () => handleFeatureAction('submit-check'),
    },
    {
      id: 'auto-application',
      label: '신청서 자동 작성',
      icon: PenTool,
      handler: () => handleFeatureAction('auto-application'),
    },
  ]

  const SAFETY_MENU: QuickMenuItem[] = [
    {
      id: 'dictionary',
      label: '금융 권익 사전',
      icon: BookOpen,
      handler: () => handleFeatureAction('dictionary'),
    },
    {
      id: 'document-check',
      label: '필수 서류 진단',
      icon: FileCheck,
      handler: () => handleFeatureAction('document-check'),
    },
    {
      id: 'procedure',
      label: '구제 절차 안내',
      icon: Map,
      handler: () => handleFeatureAction('procedure'),
    },
    {
      id: 'report',
      label: '불공정 거래 신고',
      icon: Megaphone,
      handler: () => handleFeatureAction('report'),
    },
    {
      id: 'simulation',
      label: '권리 찾기 시뮬레이션',
      icon: MousePointer2,
      handler: () => handleFeatureAction('simulation'),
    },
    {
      id: 'rights-alert',
      label: '맞춤형 권리 알림',
      icon: BellRing,
      handler: () => handleFeatureAction('rights-alert'),
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

  function handleScanClick() {
    alert('QR/바코드 스캔 기능은 준비 중입니다.')
  }

  return (
    <div className={styles.home}>
      {/* 상단 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>KB 미리봄</h1>
        <div className={styles.headerIcons}>
          <Scan size={24} className={styles.headerIcon} onClick={handleScanClick} />
          <div className={styles.notificationWrapper}>
            <Bell size={24} className={styles.headerIcon} onClick={() => setIsNotiOpen(!isNotiOpen)} />
            {isNotiOpen && (
              <div className={styles.notificationDropdown}>
                <button type="button" className={styles.notificationClose} onClick={() => setIsNotiOpen(false)}>
                  <X size={16} />
                </button>
                <div className={styles.notificationList}>
                  <div className={styles.notificationItem}>🚨 새로운 금융사기 주의보가 발령되었습니다.</div>
                  <div className={styles.notificationItem}>✅ 내 권리 분석 결과가 도착했습니다.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 개인화 인사말 */}
      <div className={styles.greeting}>
        <p className={styles.greetingText}>김국민 고객님, 안심하는 하루 되세요.</p>
      </div>

      {/* 히어로 카드 (컴팩트) */}
      <section className={styles.heroSection}>
        <div className={styles.heroCard}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeText}>소비자 권익 보호</span>
          </div>
          <h2 className={styles.heroTitle}>분쟁 예방 AI 진단</h2>
          <p className={styles.heroDesc}>
            실제 분쟁조정 사례를 바탕으로 내 상황을 분석해 드려요
          </p>
          <div className={styles.heroActions}>
            <button 
              type="button" 
              className={styles.heroCta}
              onClick={() => onStartConsult('')}
            >
              분쟁 예방 하기 {'>'}
            </button>
            <div className={styles.safetyIcon}>
              <Shield size={64} className={styles.shieldIcon} />
            </div>
          </div>
        </div>
      </section>

      {/* 탭 메뉴 */}
      <section className={styles.tabSection}>
        <div className={styles.tabContainer}>
          <button 
            type="button" 
            className={`${styles.tabButton} ${activeTab === 'prevention' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('prevention')}
          >
            AI 민원·분쟁 해결
          </button>
          <button 
            type="button" 
            className={`${styles.tabButton} ${activeTab === 'safety' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('safety')}
          >
            권익 보호 가이드
          </button>
        </div>
      </section>

      {/* 아이콘 그리드 */}
      <section className={styles.gridSection}>
        <div className={styles.gridContainer}>
          {(activeTab === 'prevention' ? PREVENTION_MENU : SAFETY_MENU).map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={styles.gridCard}
                onClick={() => handleFeatureAction(item.id)}
              >
                <span className={styles.gridIcon} aria-hidden="true">
                  <Icon size={24} />
                </span>
                <span className={styles.gridLabel}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 분쟁 예시 섹션 (예방 진단 탭에서만 표시) */}
      {activeTab === 'prevention' && (
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
      )}

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
