import { loadHistory } from '../../lib/history'
import type { Classified } from '../../lib/api'
import styles from './PreviousConsultNote.module.css'

interface PreviousConsultNoteProps {
  /** 지금 보고 있는 상담 자신의 이력 id — 이걸 제외한 것 중 가장 최근 항목과 비교한다. */
  currentHistoryId: string | null
  classified: Classified
  possessedEvidence: string[]
}

/** 8-2 개인화된 기억 — 이 브라우저에 저장된 지난 상담(가장 최근 것)과 비교해
    "이번엔 뭐가 달라졌는지"만 보여준다. 서버로 아무것도 보내지 않고, 비교 대상이
    없으면(첫 상담) 조용히 아무것도 렌더링하지 않는다. */
export function PreviousConsultNote({ currentHistoryId, classified, possessedEvidence }: PreviousConsultNoteProps) {
  const previous = loadHistory().find((e) => e.id !== currentHistoryId)
  if (!previous) return null

  const newIssues = classified.issues.filter((i) => !previous.issues.includes(i))

  const previousFavorable = (previous.evidence?.evidence_patterns ?? []).filter(
    (p) => p.favorable_rate > p.unfavorable_rate,
  )
  const nowHave = previousFavorable.filter((p) => possessedEvidence.includes(p.type))

  if (newIssues.length === 0 && nowHave.length === 0) return null

  return (
    <div className={styles.wrap} role="note" aria-label="지난 상담과 비교">
      {newIssues.length > 0 && (
        <p className={styles.line}>
          지난 상담과 비교하면 이번엔 <strong>{newIssues.map((i) => i.replace(/_/g, ' ')).join(', ')}</strong>{' '}
          쟁점이 추가됐어요.
        </p>
      )}
      {nowHave.length > 0 && (
        <p className={styles.line}>
          지난번에 확보하려던{' '}
          <strong>{nowHave.map((p) => p.source_terms[0] ?? p.type).join(', ')}</strong> 자료를 이번엔 보유하고
          계시네요.
        </p>
      )}
      <p className={styles.footnote}>이 비교는 이 브라우저에만 저장된 지난 상담 기록 기준이며, 서버로 전송되지 않아요.</p>
    </div>
  )
}
