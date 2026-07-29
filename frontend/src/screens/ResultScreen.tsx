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
import { addPossessedEvidence, loadHistory } from '../lib/history'
import type { Classified, Evidence, Procedure } from '../lib/api'
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
}: ResultScreenProps) {
  const [showIssuePicker, setShowIssuePicker] = useState(false)
  const [activeTab, setActiveTab] = useState<ResultTabId>('summary')
  const [possessedEvidence, setPossessedEvidence] = useState<string[]>(
    () => loadHistory().find((e) => e.id === historyEntryId)?.possessedEvidence ?? [],
  )
  const chips = [...classified.issues, ...classified.products]
  const paragraphs = answer.split('\n\n').filter(Boolean)
  const [summary, ...detailParagraphs] = paragraphs

  function handlePickIssue(issue: string) {
    setShowIssuePicker(false)
    onReanalyze(issue)
  }

  function handleMarkPossessed(type: string) {
    setPossessedEvidence((prev) => (prev.includes(type) ? prev : [...prev, type]))
    if (historyEntryId) addPossessedEvidence(historyEntryId, type)
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="상담 결과" onBack={onBack} onHome={onHome} />
      <div className={styles.body}>
        <p className={styles.userText}>“{text}”</p>

        <DataSourceCard />

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
        onGoHome={onHome}
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
