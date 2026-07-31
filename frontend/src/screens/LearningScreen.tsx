import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowRight, Lightbulb, Search, ShieldCheck } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { fetchLearningContent, type LearningPoint, type LearningTerm } from '../lib/api'
import { TermTooltip, type TermTooltipContent } from '../components/TermTooltip'
import styles from './LearningScreen.module.css'

interface LearningScreenProps {
  onBack: () => void
  onStartConsult: (text: string) => void
}

interface LearningMockData {
  points: LearningPoint[]
  terms: LearningTerm[]
}

const TERM_TOOLTIP_DATA: Record<string, TermTooltipContent> = {
  설명의무: {
    term: '설명의무',
    definition: '금융회사가 상품 가입 전 위험성·수수료·원금 손실 가능성 같은 핵심 정보를 충분히 알려야 하는 의무입니다.',
    caseCount: 73,
    importance: '핵심',
    preventionTip: '상품 설명서를 읽을 때 “원금 손실 가능성·중도해지 수수료·위험성”을 꼭 확인해 두세요.',
    examples: ['원금 보장형이라 설명됐지만 실제로는 원금 손실 가능성 있음', '위험성 설명이 누락된 파생상품 가입'],
  },
  적합성원칙: {
    term: '적합성원칙',
    definition: '고객의 투자 성향·재산 상황·투자 경험에 맞는 상품을 권유해야 한다는 원칙입니다.',
    caseCount: 33,
    importance: '중요',
    preventionTip: '가입 전 본인 투자 성향과 맞는지 문서로 체크해 두면 분쟁을 줄일 수 있습니다.',
    examples: ['보수적 고객에게 고위험 파생상품 권유', '투자 경험이 없는 고객에게 레버리지 상품 판매'],
  },
  불완전판매: {
    term: '불완전판매',
    definition: '중요 정보를 충분히 제공하지 않아 소비자가 올바른 판단을 하지 못하게 한 판매 행태를 뜻합니다.',
    caseCount: 45,
    importance: '핵심',
    preventionTip: '설명서·녹취·동의서와 함께 판매 과정의 설명 여부를 따로 보관해 두세요.',
    examples: ['설명 누락으로 인한 손실', '필수 확인 사항을 생략한 고위험 상품 판매'],
  },
  해피콜: {
    term: '해피콜',
    definition: '상품 가입 후 고객에게 확인·안내를 위해 걸어주는 전화입니다.',
    caseCount: 21,
    importance: '보조',
    preventionTip: '해피콜 내용과 인지 여부를 메모해 두면 추후 분쟁 대응에 도움이 됩니다.',
    examples: ['가입 후 위험성 재확인', '추가 위험 안내가 누락된 케이스'],
  },
  '녹인(Knock-in)': {
    term: '녹인(Knock-in)',
    definition: '특정 가격 이하로 떨어지면 손실이 발생하거나 조건이 발동되는 구조를 뜻합니다.',
    caseCount: 18,
    importance: '전문',
    preventionTip: '조건 발동 시점과 손실 구조를 상품설명서에서 직접 확인해 두세요.',
    examples: ['조건부 손실 구조가 노출되지 않은 상품', '손실 확정 시점이 늦게 설명된 케이스'],
  },
  간이투자설명서: {
    term: '간이투자설명서',
    definition: '투자 상품의 핵심 내용과 위험성을 한눈에 보여 주는 요약 문서입니다.',
    caseCount: 12,
    importance: '기초',
    preventionTip: '간이투자설명서를 기준으로 핵심 문구를 메모해 두면 이후 대화가 정리됩니다.',
    examples: ['요약 문서만 보고 판단한 사례', '핵심 위험성 문구가 누락된 문서'],
  },
}

const mockLearningData: LearningMockData = {
  points: [
    {
      issue: '설명의무 위반',
      case_id: '제2023-1호',
      summary: '상품의 핵심 위험성과 원금 손실 가능성을 충분히 알려주지 않아 소비자가 잘못된 판단을 한 사례입니다. 설명의무와 불완전판매가 함께 드러났습니다.',
      case_count: 73,
      avg_ratio: 60,
    },
    {
      issue: '적합성원칙 위반',
      case_id: '제2022-5호',
      summary: '투자 성향이 보수적인 고객에게 고위험 상품을 권유한 사안입니다. 적합성원칙을 확인하는 것이 핵심입니다.',
      case_count: 33,
      avg_ratio: 40,
    },
    {
      issue: '부당권유',
      case_id: '제2023-3호',
      summary: '가입을 서두르게 하는 방식으로 권유한 사례로, 해피콜과 녹인(Knock-in) 같은 정교한 조건을 따로 설명하지 않은 점이 쟁점이었습니다.',
      case_count: 51,
      avg_ratio: 55,
    },
  ],
  terms: [
    {
      term: '설명의무',
      description: '상품의 핵심 내용과 위험성을 충분히 알려야 하는 의무',
      case_count: 73,
      example_cases: ['원금 손실 가능성 설명 누락', '위험성 안내 미흡'],
    },
    {
      term: '적합성원칙',
      description: '고객의 투자 성향에 맞는 상품을 권유해야 하는 원칙',
      case_count: 33,
      example_cases: ['고위험 상품의 무리한 권유', '투자 경험 부족 고객 대상 판매'],
    },
    {
      term: '불완전판매',
      description: '구매 결정에 필요한 정보를 충분히 주지 못해 불공정하게 판매한 행태',
      case_count: 45,
      example_cases: ['설명 누락', '중요 위험성 생략'],
    },
    {
      term: '해피콜',
      description: '가입 후 고객에게 재확인하는 전화',
      case_count: 21,
      example_cases: ['가입 후 확인 과정을 놓친 사례'],
    },
    {
      term: '녹인(Knock-in)',
      description: '조건 충족 시 손실이 발생하는 구조',
      case_count: 18,
      example_cases: ['조건부 손실 구조가 드러나지 않은 사례'],
    },
    {
      term: '간이투자설명서',
      description: '핵심 내용을 한눈에 보여 주는 투자 설명서',
      case_count: 12,
      example_cases: ['요약 문서만 보고 판단한 사안'],
    },
  ],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function LearningScreen({ onBack, onStartConsult }: LearningScreenProps) {
  const [points, setPoints] = useState<LearningPoint[]>([])
  const [terms, setTerms] = useState<LearningTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setPoints(mockLearningData.points)
    setTerms(mockLearningData.terms)
    setLoading(false)

    fetchLearningContent()
      .then((data) => {
        if (data.points.length > 0 || data.terms.length > 0) {
          setPoints(data.points)
          setTerms(data.terms)
        }
      })
      .catch((err) => {
        console.error('학습 콘텐츠 조회 실패:', err)
      })
  }, [])

  const normalizedQuery = search.trim().toLowerCase()

  const filteredPoints = useMemo(() => {
    if (!normalizedQuery) return points
    return points.filter((point) => {
      const haystack = `${point.issue} ${point.summary} ${point.case_id}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, points])

  const filteredTerms = useMemo(() => {
    if (!normalizedQuery) return terms
    return terms.filter((term) => {
      const haystack = `${term.term} ${term.description} ${term.example_cases.join(' ')}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery, terms])

  function handleConsultWithIssue(issue: string) {
    const text = `${issue} 관련해서 분쟁이 발생했어요. 어떻게 대응해야 할까요?`
    onStartConsult(text)
  }

  function renderTextWithTooltips(text: string): ReactNode[] {
    const keys = Object.keys(TERM_TOOLTIP_DATA)
    const pattern = new RegExp(`(${keys.map(escapeRegExp).join('|')})`, 'g')

    return text.split(pattern).filter(Boolean).map((segment, index) => {
      const content = TERM_TOOLTIP_DATA[segment]
      if (!content) {
        return <span key={`${segment}-${index}`}>{segment}</span>
      }

      return (
        <TermTooltip key={`${segment}-${index}`} content={content}>
          <span className={styles.inlineTerm}>{segment}</span>
        </TermTooltip>
      )
    })
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="금융 권익 사전" onBack={onBack} />

      <div className={styles.content}>
        <section className={styles.introSection}>
          <div className={styles.introBadge}>
            <Lightbulb size={16} className={styles.introBadgeIcon} />
            <span className={styles.introBadgeText}>권익 보호 사전</span>
          </div>
          <h2 className={styles.introTitle}>분쟁 조정 사례로 배우는 금융 권리</h2>
          <p className={styles.introDesc}>
            {renderTextWithTooltips('금감원 분쟁조정 실제 사례를 통해 설명의무, 적합성원칙, 불완전판매와 같은 핵심 용어를 손쉽게 확인해 보세요.')}
          </p>
        </section>

        <section className={styles.searchCard}>
          <label className={styles.searchLabel} htmlFor="learning-search">
            <Search size={16} />
            <span>사례·용어 검색</span>
          </label>
          <input
            id="learning-search"
            className={styles.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="예: 설명의무, 해피콜"
          />
        </section>

        <section className={styles.overviewCard}>
          <div className={styles.overviewHeader}>
            <div>
              <p className={styles.overviewEyebrow}>금감원 결정례</p>
              <h3 className={styles.overviewTitle}>실제 분쟁 사례 196건</h3>
            </div>
            <span className={styles.overviewBadge}>
              <ShieldCheck size={14} />
              권익 보호 기준
            </span>
          </div>
          <div className={styles.overviewStats}>
            <div className={styles.overviewStat}>
              <strong>{filteredPoints.length}</strong>
              <span>핵심 쟁점</span>
            </div>
            <div className={styles.overviewStat}>
              <strong>{filteredTerms.length}</strong>
              <span>용어 사전</span>
            </div>
          </div>
        </section>

        {loading ? (
          <p className={styles.loading}>로딩 중...</p>
        ) : (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>쟁점별 실제 사례</h3>
                <span className={styles.sectionHint}>클릭하면 상담으로 이어집니다</span>
              </div>
              <div className={styles.cardGrid}>
                {filteredPoints.map((point) => (
                  <div key={point.case_id} className={styles.pointCard}>
                    <div className={styles.pointHeader}>
                      <span className={styles.pointIssue}>{point.issue}</span>
                      <span className={styles.pointCount}>{point.case_count}건</span>
                    </div>
                    <p className={styles.pointSummary}>{renderTextWithTooltips(point.summary)}</p>
                    <div className={styles.pointMeta}>
                      <span className={styles.pointCaseId}>사건번호 {point.case_id}</span>
                      <span className={styles.pointRatio}>배상비율 약 {point.avg_ratio ?? 0}%</span>
                    </div>
                    <button
                      type="button"
                      className={styles.consultButton}
                      onClick={() => handleConsultWithIssue(point.issue)}
                    >
                      <span className={styles.consultButtonText}>이런 상황이면 상담해보기</span>
                      <ArrowRight size={16} className={styles.consultButtonIcon} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>금융 용어</h3>
                <span className={styles.sectionHint}>용어를 누르면 해설이 열립니다</span>
              </div>
              <div className={styles.termGrid}>
                {filteredTerms.map((term) => {
                  const tooltip = TERM_TOOLTIP_DATA[term.term]
                  return (
                    <div key={term.term} className={styles.termCard}>
                      <div className={styles.termHeader}>
                        <span className={styles.termName}>
                          {tooltip ? (
                            <TermTooltip content={tooltip}>
                              <span className={styles.inlineTerm}>{term.term}</span>
                            </TermTooltip>
                          ) : (
                            term.term
                          )}
                        </span>
                        <span className={styles.termCount}>{term.case_count}건</span>
                      </div>
                      <p className={styles.termDescription}>{term.description}</p>
                      <ul className={styles.termExampleList}>
                        {term.example_cases.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          ※ 모든 콘텐츠는 금감원 분쟁조정 실제 사례를 기반으로 제공됩니다.
          법률 자문이 아닌 참고 정보입니다.
        </p>
      </footer>
    </div>
  )
}
