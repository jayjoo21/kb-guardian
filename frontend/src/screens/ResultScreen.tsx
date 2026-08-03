import { useState } from 'react'
import { TopAppBar } from '../app/TopAppBar'
import { Chip } from '../components/Chip'
import { DataSourceCard } from './result/DataSourceCard'
import { ResultTabBar, type ResultTabId } from './result/ResultTabBar'
import { ResultSummaryTab } from './result/tabs/ResultSummaryTab'
import { ResultAnalysisTab } from './result/tabs/ResultAnalysisTab'
import { ResultPrepareTab } from './result/tabs/ResultPrepareTab'
import { ResultEvidenceTab } from './result/tabs/ResultEvidenceTab'
import { ExternalLinksCard } from './result/ExternalLinksCard'
import { FollowUpQuestions } from './result/FollowUpQuestions'
import { ProactiveSuggestions } from './result/ProactiveSuggestions'
import { PreviousConsultNote } from './result/PreviousConsultNote'
import { IssuePickerSheet } from './result/IssuePickerSheet'
import { FeedbackWidget } from './result/FeedbackWidget'
import { TrustBadge } from '../components/TrustBadge'
import { addPossessedEvidence, loadHistory } from '../lib/history'
import { simplifyAnswer, type Classified, type Evidence, type Procedure } from '../lib/api'
import styles from './ResultScreen.module.css'

interface ResultScreenProps {
  text: string
  classified: Classified
  answer: string
  evidence: Evidence | null
  procedure: Procedure | null
  /** 지금 이 결과가 속한 상담 이력 id(자가보고 상태 저장·"지난 상담" 비교용).
      이력 저장에 실패했거나 아직 저장 전이면 null. */
  historyEntryId: string | null
  onBack: () => void
  onHome: () => void
  /** "이 쟁점이 아니에요" → 고른 쟁점으로 재조회(교체 재분석) */
  onReanalyze: (issue: string) => void
  /** 8-1 능동 제안(쟁점 보완) → 기존 쟁점에 더해 재조회(추가 재분석) */
  onAddIssue: (issue: string) => void
  /** 9-2 데이터 출처 카드 탭 → 통계 탭으로 이동 */
  onNavigateToStats: () => void
  /** 은행 반박 예측/증거자료평가 등 홈의 특정 진입점에서 왔을 때 바로 열릴 탭.
      없으면 기본 'summary'. */
  initialTab?: ResultTabId
  /** 위 진입점 전용 제목. 없으면 기본 '상담 결과'. */
  title?: string
}

/** 상담 결과 화면 — 이 앱의 핵심. 상단은 항상 보이는 요약 헤더(입력 상황·쟁점 칩),
    그 아래 [요약][분석][준비][근거] 4탭 — 아코디언은 각 탭 내부에서만 쓴다.
    answer는 이미 완성된 상태로 들어온다(로딩 화면에서 스트리밍을 다 받은 뒤에만 이
    화면이 렌더되므로 타이핑 표시가 없다). 데이터 없는 섹션은 각 탭/컴포넌트가
    내부에서 빈 상태를 보여주거나 null을 반환해 조용히 생략한다. */
export function ResultScreen({
  text,
  classified,
  answer,
  evidence,
  procedure,
  historyEntryId,
  onBack,
  onHome,
  onReanalyze,
  onAddIssue,
  onNavigateToStats,
  initialTab,
  title,
}: ResultScreenProps) {
  const [showIssuePicker, setShowIssuePicker] = useState(false)
  const [activeTab, setActiveTab] = useState<ResultTabId>(initialTab ?? 'summary')
  const [possessedEvidence, setPossessedEvidence] = useState<string[]>(
    () => loadHistory().find((e) => e.id === historyEntryId)?.possessedEvidence ?? [],
  )
  // 9-1 "설명이 어려워요" — 같은 evidence로 다시 받은 답변이 있으면 그걸로 덮어써 보여준다.
  const [simplifiedAnswer, setSimplifiedAnswer] = useState<string | null>(null)
  const chips = [...classified.issues, ...classified.products]
  const effectiveAnswer = simplifiedAnswer ?? answer
  const paragraphs = effectiveAnswer.split('\n\n').filter(Boolean)
  const [summary, ...detailParagraphs] = paragraphs

  function handlePickIssue(issue: string) {
    setShowIssuePicker(false)
    onReanalyze(issue)
  }

  function handleMarkPossessed(type: string) {
    setPossessedEvidence((prev) => (prev.includes(type) ? prev : [...prev, type]))
    if (historyEntryId) addPossessedEvidence(historyEntryId, type)
  }

  /** 9-1 "사례가 더 필요해요" — 그래프상 공동 태깅 빈도가 높은 인접 쟁점이 있으면
      그 쟁점을 더해 재조회한다(8-1과 같은 추가 재분석 메커니즘 재사용). 인접 쟁점이
      없으면 false를 반환해 위젯이 "더 찾을 사례가 없다"고 안내하게 한다. */
  async function handleMoreCases(): Promise<boolean> {
    const suggestion = evidence?.issue_suggestion
    if (!suggestion) return false
    onAddIssue(suggestion.issue)
    return true
  }

  async function handleSimplify(): Promise<void> {
    if (!evidence) throw new Error('근거 데이터가 없습니다')
    const simplified = await simplifyAnswer(text, evidence)
    setSimplifiedAnswer(simplified)
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title={title ?? '상담 결과'} onBack={onBack} onHome={onHome} />
      <div className={styles.body}>
        <TrustBadge />

        <p className={styles.userText}>“{text}”</p>

        <DataSourceCard onNavigateToStats={onNavigateToStats} />

        {evidence?.adjacent_issue && (
          <p className={styles.adjacentNotice} role="note">
            직접 관련 사례가 적어, 가까운 유형(
            {evidence.adjacent_issue.replace(/_/g, ' ')})도 함께 참고했어요
          </p>
        )}

        {chips.length > 0 && (
          <div className={styles.chipsRow}>
            <div className={styles.chips} aria-label="분류된 쟁점·상품">
              {chips.map((c) => (
                <Chip key={c}>{c}</Chip>
              ))}
            </div>
            {classified.issues.length > 0 && (
              <button
                type="button"
                className={styles.wrongIssueLink}
                onClick={() => setShowIssuePicker(true)}
              >
                이 쟁점이 아니에요
              </button>
            )}
          </div>
        )}

        <PreviousConsultNote
          currentHistoryId={historyEntryId}
          classified={classified}
          possessedEvidence={possessedEvidence}
        />

        <ProactiveSuggestions
          issues={classified.issues}
          evidence={evidence}
          possessedEvidence={possessedEvidence}
          onAddIssue={onAddIssue}
          onMarkPossessed={handleMarkPossessed}
        />

        <ResultTabBar active={activeTab} onChange={setActiveTab} />

        <div key={activeTab} className={styles.tabContent}>
          {activeTab === 'summary' && (
            <ResultSummaryTab
              issue={classified.issues[0] ?? null}
              issueCount={classified.issues.length}
              similarCaseCount={evidence?.similar_cases.length ?? 0}
              summary={summary ?? ''}
              detailParagraphs={detailParagraphs}
            />
          )}
          {activeTab === 'analysis' && (
            <ResultAnalysisTab
              items={evidence?.respondent_arguments ?? []}
              lawArticles={evidence?.law_articles ?? []}
            />
          )}
          {activeTab === 'prepare' && (
            <ResultPrepareTab
              procedure={procedure}
              evidencePatterns={evidence?.evidence_patterns ?? []}
              text={text}
              classified={classified}
              evidence={evidence}
              historyEntryId={historyEntryId}
            />
          )}
          {activeTab === 'evidence' && (
            <ResultEvidenceTab cases={evidence?.similar_cases ?? []} evidence={evidence} />
          )}
        </div>

        <FollowUpQuestions evidence={evidence} procedure={procedure} />

        {evidence && <ExternalLinksCard lawArticles={evidence.law_articles} precedents={evidence.precedents} />}

        <p className={styles.disclaimer}>
          본 서비스는 법률 자문이 아닌 참고 정보입니다. 실제 분쟁 대응은 금융감독원 또는 법률
          전문가와 상담하시기 바랍니다.
        </p>
      </div>

      <FeedbackWidget
        text={text}
        issues={classified.issues}
        onWrongIssue={() => setShowIssuePicker(true)}
        onMoreCases={handleMoreCases}
        onSimplify={handleSimplify}
      />

      <div className={styles.actionBar}>
        <button type="button" className={styles.actionButton} onClick={onHome}>
          처음부터 다시
        </button>
        <button type="button" className={styles.actionButton} onClick={onHome}>
          홈으로
        </button>
      </div>

      <IssuePickerSheet
        open={showIssuePicker}
        currentIssues={classified.issues}
        onClose={() => setShowIssuePicker(false)}
        onPick={handlePickIssue}
      />
    </div>
  )
}
