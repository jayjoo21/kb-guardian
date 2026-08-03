import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Scale, FileText, Clock, CheckCircle, AlertCircle, Megaphone, BellRing, BellPlus, ExternalLink } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { fetchConsumerRights, type ConsumerRight } from '../lib/api'
import { loadRightsAlertSubscribed, setRightsAlertSubscribed } from '../lib/settings'
import styles from './ConsumerRightsScreen.module.css'

export type ConsumerRightsMode = 'rights' | 'report' | 'alert'

interface ConsumerRightsScreenProps {
  onBack?: () => void
  mode: ConsumerRightsMode
}

const FINE_URL = 'https://fine.fss.or.kr'

const REPORT_TYPES = [
  { title: '꺾기(구속성 예금)', desc: '대출을 내주는 조건으로 예·적금·보험 가입을 강요하는 행위' },
  { title: '부당한 대출조건 강요', desc: '금리·수수료를 부풀리거나 불필요한 부대상품 가입을 강요하는 행위' },
  { title: '불완전판매', desc: '설명의무·적합성원칙을 어기고 위험을 숨긴 채 상품을 파는 행위' },
  { title: '유사수신·다단계', desc: '인허가 없이 고수익을 미끼로 자금을 모으는 행위' },
]

const ALERT_CATEGORIES = [
  { title: '가입 상품 관련 분쟁 사례', desc: '내가 가입한 상품 유형에서 새로 발생한 분쟁조정 사례를 알려드려요' },
  { title: '금융소비자보호법 개정 소식', desc: '권리·의무에 영향을 주는 법·시행령 개정 사항을 안내해요' },
  { title: '내 상담 이력과 유사한 결정례', desc: '저장된 상담 이력과 쟁점이 비슷한 새 결정례가 나오면 알려드려요' },
]

export function ConsumerRightsScreen({ onBack, mode }: ConsumerRightsScreenProps) {
  // report/alert 화면에서 "내 권리 목록 보기"를 누르면 이 화면 안에서 실제 법조문 기반
  // 목록으로 전환한다(부모의 mode와 별개로, 되돌아가지 않고 딥링크처럼 한 번만 전환).
  const [viewMode, setViewMode] = useState<ConsumerRightsMode>(mode)
  const [rights, setRights] = useState<ConsumerRight[]>([])
  const [loading, setLoading] = useState(viewMode === 'rights')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(loadRightsAlertSubscribed)

  function toggleSubscribe() {
    const next = !subscribed
    setSubscribed(next)
    setRightsAlertSubscribed(next)
  }

  useEffect(() => {
    if (viewMode !== 'rights') return
    setLoading(true)
    fetchConsumerRights()
      .then((data) => {
        setRights(data.rights)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [viewMode])

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  if (viewMode === 'report') {
    return (
      <div className={styles.container}>
        <TopAppBar title="불공정거래 신고" onBack={onBack} />
        <header className={styles.header}>
          <Megaphone className={styles.headerIcon} size={28} />
          <div>
            <h1 className={styles.title}>불공정거래 신고</h1>
            <p className={styles.subtitle}>이런 일을 겪었다면 금융감독원에 신고할 수 있어요</p>
          </div>
        </header>
        <div className={styles.rightsList}>
          {REPORT_TYPES.map((item) => (
            <div key={item.title} className={styles.guideCard}>
              <h4 className={styles.detailTitle}>{item.title}</h4>
              <p className={styles.detailText}>{item.desc}</p>
            </div>
          ))}
        </div>
        <a href={FINE_URL} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
          <ExternalLink size={14} aria-hidden="true" />
          금융감독원 파인에서 신고하기
        </a>
        <button type="button" className={styles.linkButton} onClick={() => setViewMode('rights')}>
          금융소비자보호법상 내 권리 목록 보기
        </button>
        <footer className={styles.legalNotice}>
          <p className={styles.legalText}>
            법률 자문이 아닌 참고 정보입니다. 실제 신고·조사는 금융감독원 절차를 따릅니다.
          </p>
        </footer>
      </div>
    )
  }

  if (viewMode === 'alert') {
    return (
      <div className={styles.container}>
        <TopAppBar title="맞춤형 권리 알림" onBack={onBack} />
        <header className={styles.header}>
          <BellRing className={styles.headerIcon} size={28} />
          <div>
            <h1 className={styles.title}>맞춤형 권리 알림</h1>
            <p className={styles.subtitle}>내 상황에 맞는 소식을 알려드릴 예정이에요</p>
          </div>
        </header>
        <div className={styles.rightsList}>
          {ALERT_CATEGORIES.map((item) => (
            <div key={item.title} className={styles.guideCard}>
              <h4 className={styles.detailTitle}>{item.title}</h4>
              <p className={styles.detailText}>{item.desc}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.subscribeButton} ${subscribed ? styles.subscribeButtonActive : ''}`}
          onClick={toggleSubscribe}
        >
          {subscribed ? <CheckCircle size={16} /> : <BellPlus size={16} />}
          {subscribed ? '알림 구독 중' : '알림 받기'}
        </button>
        <button type="button" className={styles.linkButton} onClick={() => setViewMode('rights')}>
          금융소비자보호법상 내 권리 목록 보기
        </button>
        <footer className={styles.legalNotice}>
          <p className={styles.legalText}>
            알림 발송 기능은 준비 중입니다. 구독해 두시면 기능이 열릴 때 가장 먼저
            안내해 드려요.
          </p>
        </footer>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <TopAppBar title="내 권리" onBack={onBack} />

      <header className={styles.header}>
        <Scale className={styles.headerIcon} size={28} />
        <div>
          <h1 className={styles.title}>내 권리</h1>
          <p className={styles.subtitle}>금융소비자보호법으로 보장되는 권리</p>
        </div>
      </header>

      <div className={styles.rightsList}>
        {rights.map((right) => {
          const isExpanded = expandedId === right.id
          return (
            <div key={right.id} className={styles.rightCard}>
              <button
                type="button"
                className={styles.rightHeader}
                onClick={() => toggleExpand(right.id)}
                aria-expanded={isExpanded}
              >
                <div className={styles.rightHeaderContent}>
                  <div className={styles.rightIcon}>
                    <FileText size={20} />
                  </div>
                  <div className={styles.rightTitleGroup}>
                    <h3 className={styles.rightTitle}>{right.title}</h3>
                    <p className={styles.rightDescription}>{right.description}</p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {isExpanded && (
                <div className={styles.rightDetails}>
                  <div className={styles.detailSection}>
                    <div className={styles.detailHeader}>
                      <Clock size={16} className={styles.detailIcon} />
                      <h4 className={styles.detailTitle}>언제 쓰는지</h4>
                    </div>
                    <p className={styles.detailText}>{right.when_to_use}</p>
                  </div>

                  <div className={styles.detailSection}>
                    <div className={styles.detailHeader}>
                      <CheckCircle size={16} className={styles.detailIcon} />
                      <h4 className={styles.detailTitle}>어떻게 행사하는지</h4>
                    </div>
                    <p className={styles.detailText}>{right.how_to_exercise}</p>
                  </div>

                  <div className={styles.lawSection}>
                    <div className={styles.lawHeader}>
                      <AlertCircle size={16} className={styles.lawIcon} />
                      <h4 className={styles.lawTitle}>법적 근거</h4>
                    </div>
                    <p className={styles.lawRef}>{right.law_article_ref}</p>
                    {right.law_article_detail && (
                      <div className={styles.lawContent}>
                        <p className={styles.lawArticle}>{right.law_article_detail.article}</p>
                        <p className={styles.lawText}>{right.law_article_detail.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
        </p>
      </footer>
    </div>
  )
}
