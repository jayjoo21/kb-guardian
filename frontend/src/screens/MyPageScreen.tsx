import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Heart, MessageSquareText, Settings, ShieldCheck, Sparkles, Trash2, RotateCcw, Wallet } from 'lucide-react'
import { deleteSimulationEntry, loadHistory, loadSavedSimulations, saveSimulationEntry, type ConsultHistoryEntry, type SavedSimulationEntry } from '../lib/history'
import styles from './MyPageScreen.module.css'

interface MyPageScreenProps {
  onOpenEntry: (entry: ConsultHistoryEntry) => void
  onOpenSimulation: (entry: SavedSimulationEntry) => void
  onOpenSimulationResult: (entry: SavedSimulationEntry) => void
  onStartConsult: () => void
  onOpenSettings: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

const mockEntries: ConsultHistoryEntry[] = [
  {
    id: 'mock-1',
    createdAt: new Date('2024-03-15T10:30:00').toISOString(),
    timestamp: new Date('2024-03-15T10:30:00').toISOString(),
    text: 'ELS 상품 관련 설명 의무 위반 상담',
    issues: ['설명의무 위반'],
    medianRatio: 60,
    classified: { issues: ['설명의무 위반'], products: [], factors: [], confidence: 0.85 },
    answer: '설명 의무 위반으로 판단되는 상담입니다.',
    evidence: {
      similar_cases: [
        { case_id: '제2023-1호', title: 'ELS 상품 설명 의무 위반', case_no: '2023-1', result: '승소', ratio: 60, date: '2023-01-15', summary: 'ELS 상품 설명 의무 위반' },
      ],
      law_articles: [{ issue: '설명의무 위반', ref: '금융소비자보호법 제17조', article: '제17조' }],
      precedents: ['제2023-1호'],
      ratio_stats: { min: 0, avg: 45, median: 60, max: 100, n: 73 },
      criteria: [],
      respondent_arguments: [],
      evidence_patterns: [],
      adjacent_issue: null,
      kb_terms: [],
      issue_suggestion: null,
    },
    procedure: null,
    possessedEvidence: [],
    checkedDocuments: [],
  },
  {
    id: 'mock-2',
    createdAt: new Date('2024-03-10T14:20:00').toISOString(),
    timestamp: new Date('2024-03-10T14:20:00').toISOString(),
    text: '펀드 가입 시 부당 권유 관련 상담',
    issues: ['부당권유'],
    medianRatio: 50,
    classified: { issues: ['부당권유'], products: [], factors: [], confidence: 0.78 },
    answer: '부당 권유 가능성이 높은 상담입니다.',
    evidence: {
      similar_cases: [
        { case_id: '제2023-3호', title: '부당권유 사례', case_no: '2023-3', result: '승소', ratio: 50, date: '2023-05-10', summary: '부당권유 사례' },
      ],
      law_articles: [{ issue: '부당권유', ref: '금융소비자보호법 제18조', article: '제18조' }],
      precedents: ['제2023-3호'],
      ratio_stats: { min: 0, avg: 38, median: 50, max: 100, n: 51 },
      criteria: [],
      respondent_arguments: [],
      evidence_patterns: [],
      adjacent_issue: null,
      kb_terms: [],
      issue_suggestion: null,
    },
    procedure: null,
    possessedEvidence: [],
    checkedDocuments: [],
  },
]

const favoriteCases = [
  {
    title: 'ELS 불완전판매 사례',
    summary: '설명 의무와 적합성 검토가 핵심이 된 사건',
    tag: '결정례',
  },
  {
    title: '펀드 권유 사기 의심',
    summary: '부당권유와 손해배상 기준을 함께 확인한 케이스',
    tag: '결정례',
  },
]

const favoriteIssues = [
  {
    title: '설명의무 위반',
    summary: '금융상품 가입 전 설명이 충분했는지 확인하는 쟁점',
    tag: '관심 쟁점',
  },
  {
    title: '불완전판매',
    summary: '고객 적합성 및 위험성 안내 부족 여부를 검토하는 쟁점',
    tag: '관심 쟁점',
  },
]

export function MyPageScreen({ onOpenEntry, onOpenSimulation, onOpenSimulationResult, onStartConsult, onOpenSettings }: MyPageScreenProps) {
  const [entries, setEntries] = useState<ConsultHistoryEntry[]>([])
  const [simulations, setSimulations] = useState<SavedSimulationEntry[]>([])
  const [activeFavoriteTab, setActiveFavoriteTab] = useState<'cases' | 'issues'>('cases')

  function refreshData() {
    const loaded = loadHistory()
    setEntries(loaded.length > 0 ? loaded : mockEntries)
    setSimulations(loadSavedSimulations())
  }

  useEffect(() => {
    refreshData()
  }, [])

  const totalAssets = 1830000 + 8450000
  const suspiciousProducts = 0

  const issueDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach((entry) => {
      entry.issues.forEach((issue) => {
        counts[issue] = (counts[issue] ?? 0) + 1
      })
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [entries])

  const maxIssueCount = Math.max(1, ...issueDistribution.map(([, count]) => count))

  function handleDeleteSimulation(id: string) {
    deleteSimulationEntry(id)
    refreshData()
  }

  function handleResaveSimulation(simulation: SavedSimulationEntry) {
    saveSimulationEntry({
      id: simulation.id,
      createdAt: simulation.createdAt,
      messages: simulation.messages,
      summary: simulation.summary,
      completed: simulation.completed,
      contextText: simulation.contextText,
      contextIssues: simulation.contextIssues,
      contextHistoryEntryId: simulation.contextHistoryEntryId,
    })
    refreshData()
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>개인 맞춤</p>
          <h1 className={styles.title}>마이페이지</h1>
        </div>
        <button type="button" className={styles.iconButton} onClick={onOpenSettings} aria-label="설정">
          <Settings size={18} />
        </button>
      </div>

      <section className={styles.heroCard}>
        <div className={styles.heroHeader}>
          <div>
            <p className={styles.eyebrow}>마이데이터 연동</p>
            <h2 className={styles.cardTitle}>자산·위험 진단</h2>
          </div>
          <span className={styles.safeBadge}>
            <ShieldCheck size={14} />
            안심 지표
          </span>
        </div>

        <div className={styles.assetGrid}>
          <div className={styles.assetItem}>
            <span className={styles.assetLabel}>예금·계좌</span>
            <strong className={styles.assetValue}>1,830,000원</strong>
          </div>
          <div className={styles.assetItem}>
            <span className={styles.assetLabel}>투자 자산</span>
            <strong className={styles.assetValue}>8,450,000원</strong>
          </div>
        </div>

        <div className={styles.heroSummary}>
          <div className={styles.heroSummaryItem}>
            <Wallet size={16} />
            <span>총 자산</span>
            <strong>{totalAssets.toLocaleString()}원</strong>
          </div>
          <div className={styles.heroSummaryItem}>
            <MessageSquareText size={16} />
            <span>불완전판매 의심</span>
            <strong>{suspiciousProducts}건</strong>
          </div>
        </div>

        <p className={styles.heroNote}>보유 상품 중 불완전판매 의심 상품 0건으로 최근 6개월 기준 안정적인 편입니다.</p>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>요약</p>
            <h2 className={styles.sectionTitle}>상담 흐름 요약</h2>
          </div>
        </div>

        <div className={styles.insightGrid}>
          <div className={styles.insightCard}>
            <div className={styles.insightCardHeader}>
              <span className={styles.eyebrow}>시기별 상담</span>
              <strong>{entries.length}건</strong>
            </div>
            <div className={styles.sparkline}>
              <svg viewBox="0 0 220 80" role="img" aria-label="상담 이력 분포">
                {issueDistribution.length > 0 ? (
                  issueDistribution.map(([issue, count], index) => {
                    const height = (count / maxIssueCount) * 48 + 12
                    const x = 20 + index * 48
                    return (
                      <g key={issue}>
                        <rect x={x} y={68 - height} width={24} height={height} rx={8} className={styles.chartBar} />
                        <text x={x + 12} y={74} textAnchor="middle" className={styles.chartLabel}>{issue.slice(0, 3)}</text>
                      </g>
                    )
                  })
                ) : (
                  <text x="110" y="40" textAnchor="middle" className={styles.chartFallback}>데이터가 쌓이면 차트로 보여드릴게요.</text>
                )}
              </svg>
            </div>
          </div>
          <div className={styles.insightMetricList}>
            <div className={styles.metricCard}>
              <span>저장한 시뮬레이션</span>
              <strong>{simulations.length}개</strong>
            </div>
            <div className={styles.metricCard}>
              <span>체크한 서류</span>
              <strong>{entries.reduce((sum, entry) => sum + entry.checkedDocuments.length, 0)}건</strong>
            </div>
            <div className={styles.metricCard}>
              <span>안심 지표</span>
              <strong>{suspiciousProducts === 0 ? '안정' : `${suspiciousProducts}건`}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>이력</p>
            <h2 className={styles.sectionTitle}>나의 상담 및 민원 이력</h2>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={onStartConsult}>
            새 상담
          </button>
        </div>

        {entries.length === 0 ? (
          <div className={styles.emptyState}>
            <p>아직 저장된 상담 이력이 없어요.</p>
          </div>
        ) : (
          <ol className={styles.timelineList}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button type="button" className={styles.timelineCard} onClick={() => onOpenEntry(entry)}>
                  <div className={styles.timelineTop}>
                    <span className={styles.timelineDate}>{formatDate(entry.timestamp || entry.createdAt)}</span>
                    <span className={styles.timelineBadge}>{entry.issues[0] ?? '상담'}</span>
                  </div>
                  <div className={styles.timelineBody}>
                    <strong>{entry.text}</strong>
                    <p>{entry.answer}</p>
                  </div>
                  <div className={styles.timelineFooter}>
                    <span>배상비율 약 {entry.evidence?.ratio_stats.median ?? entry.medianRatio ?? 0}%</span>
                    <ArrowRight size={16} />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>시뮬레이션</p>
            <h2 className={styles.sectionTitle}>저장한 권리 찾기 결과</h2>
          </div>
        </div>

        {simulations.length === 0 ? (
          <div className={styles.emptyState}>
            <p>저장한 시뮬레이션 결과가 아직 없어요.</p>
          </div>
        ) : (
          <div className={styles.simulationList}>
            {simulations.map((simulation) => (
              <div key={simulation.id} className={styles.simulationCard}>
                <button type="button" className={styles.simulationMainButton} onClick={() => onOpenSimulation(simulation)}>
                  <div className={styles.simulationMeta}>
                    <span className={styles.timelineBadge}><Sparkles size={12} /> 시뮬레이션</span>
                    <span className={styles.timelineDate}>{formatDate(simulation.createdAt)}</span>
                  </div>
                  <strong className={styles.favoriteTitle}>{simulation.contextText ? simulation.contextText.slice(0, 36) : '권리 찾기 결과'}</strong>
                  <p className={styles.favoriteSummary}>{simulation.summary?.action ?? '저장된 권리 대응 흐름을 다시 확인해 보세요.'}</p>
                  {simulation.summary?.rights && (
                    <div className={styles.simulationRights}>
                      {simulation.summary.rights.slice(0, 3).map((right) => (
                        <span key={right} className={styles.simulationChip}>{right}</span>
                      ))}
                    </div>
                  )}
                </button>
                <div className={styles.simulationActions}>
                  <button type="button" className={styles.smallActionButton} onClick={() => onOpenSimulationResult(simulation)}>
                    <ArrowRight size={14} /> 상담 결과
                  </button>
                  <button type="button" className={styles.smallActionButton} onClick={() => handleResaveSimulation(simulation)}>
                    <RotateCcw size={14} /> 재저장
                  </button>
                  <button type="button" className={`${styles.smallActionButton} ${styles.smallActionButtonDanger}`} onClick={() => handleDeleteSimulation(simulation.id)}>
                    <Trash2 size={14} /> 삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>보관함</p>
            <h2 className={styles.sectionTitle}>찜한 결정례 및 관심 쟁점</h2>
          </div>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segmentButton} ${activeFavoriteTab === 'cases' ? styles.segmentButtonActive : ''}`}
              onClick={() => setActiveFavoriteTab('cases')}
            >
              결정례
            </button>
            <button
              type="button"
              className={`${styles.segmentButton} ${activeFavoriteTab === 'issues' ? styles.segmentButtonActive : ''}`}
              onClick={() => setActiveFavoriteTab('issues')}
            >
              쟁점
            </button>
          </div>
        </div>

        <div className={styles.favoriteList}>
          {(activeFavoriteTab === 'cases' ? favoriteCases : favoriteIssues).map((item) => (
            <div key={item.title} className={styles.favoriteItem}>
              <div className={styles.favoriteMeta}>
                <span className={styles.favoriteTag}>{item.tag}</span>
                <Heart size={14} />
              </div>
              <strong className={styles.favoriteTitle}>{item.title}</strong>
              <p className={styles.favoriteSummary}>{item.summary}</p>
              <div className={styles.favoriteFooter}>
                <span>상세 보기</span>
                <ArrowRight size={14} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
