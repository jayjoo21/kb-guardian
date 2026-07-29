import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { Chip } from '../components/Chip'
import { DataSourceCard } from './result/DataSourceCard'
import { KeyFindingsCard } from './result/KeyFindingsCard'
import { RespondentArgumentsAccordion } from './result/RespondentArgumentsAccordion'
import { RealCasesCard } from './result/RealCasesCard'
import { EvidencePatternsAccordion } from './result/EvidencePatternsAccordion'
import { ProcedureAccordion } from './result/ProcedureAccordion'
import { DetailAccordion } from './result/DetailAccordion'
import { ComplaintDraftAccordion } from './result/ComplaintDraftAccordion'
import { ExternalLinksCard } from './result/ExternalLinksCard'
import { IssuePickerSheet } from './result/IssuePickerSheet'
import { FeedbackWidget } from './result/FeedbackWidget'
import type { Classified, Evidence, Procedure } from '../lib/api'
import styles from './ResultScreen.module.css'

interface ResultScreenProps {
  text: string
  classified: Classified
  answer: string
  evidence: Evidence | null
  procedure: Procedure | null
  onBack: () => void
  onHome: () => void
  /** "이 쟁점이 아니에요" → 고른 쟁점으로 재조회(재분석) */
  onReanalyze: (issue: string) => void
}

/** 상담 결과 화면 — 이 앱의 핵심. "1스크롤 요약 + 아코디언 상세" 구조:
    상단은 스크롤 없이 다 보이는 요약(입력 상황·쟁점 칩·핵심 카드·한 줄 요약),
    아래는 전부 기본 접힌 상세 아코디언. answer는 이미 완성된 상태로 들어온다
    (로딩 화면에서 스트리밍을 다 받은 뒤에만 이 화면이 렌더되므로 타이핑 표시가
    없다). 데이터 없는 섹션은 각 컴포넌트가 내부에서 null을 반환해 카드째 숨는다. */
export function ResultScreen({
  text,
  classified,
  answer,
  evidence,
  procedure,
  onBack,
  onHome,
  onReanalyze,
}: ResultScreenProps) {
  const [showIssuePicker, setShowIssuePicker] = useState(false)
  const chips = [...classified.issues, ...classified.products]
  const paragraphs = answer.split('\n\n').filter(Boolean)
  const [summary, ...detailParagraphs] = paragraphs

  function handlePickIssue(issue: string) {
    setShowIssuePicker(false)
    onReanalyze(issue)
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="상담 결과" onBack={onBack} onHome={onHome} />
      <div className={styles.body}>
        <p className={styles.userText}>“{text}”</p>

        <DataSourceCard />

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

        <KeyFindingsCard issue={classified.issues[0] ?? null} issueCount={classified.issues.length} />

        {summary && (
          <div className={styles.summaryBlock}>
            <span className={styles.aiLabel}>
              <Sparkles size={11} aria-hidden="true" />
              AI 분석 해석
            </span>
            <p className={styles.summary}>{summary}</p>
          </div>
        )}

        <div className={styles.accordions}>
          {evidence && (
            <>
              <RespondentArgumentsAccordion items={evidence.respondent_arguments} />
              <RealCasesCard cases={evidence.similar_cases} />
              <EvidencePatternsAccordion items={evidence.evidence_patterns} />
            </>
          )}
          {procedure && <ProcedureAccordion procedure={procedure} />}
          <DetailAccordion paragraphs={detailParagraphs} />
          <ComplaintDraftAccordion text={text} classified={classified} evidence={evidence} procedure={procedure} />
        </div>

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
