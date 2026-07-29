import { basisConsumerTitle } from './basisLabels'
import type { Classified, Evidence, Procedure, RespondentArgumentGroup } from './api'

interface BuildDraftInput {
  text: string
  classified: Classified
  evidence: Evidence | null
  procedure: Procedure | null
}

const TODAY = () => {
  const d = new Date()
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 상담 결과(쟁점·유리 정황·준비 서류)를 엮어 분쟁조정 신청서 문안 초안을 만든다.
    전부 이 상담에서 실제로 받은 데이터(evidence/procedure)만 쓰고, 없는 항목은
    해당 절을 생략한다 — 지어내지 않는다. 어디까지나 초안이라는 점을 문안 자체에
    명시한다. */
export function buildComplaintDraft({ text, classified, evidence, procedure }: BuildDraftInput): string {
  const lines: string[] = []

  lines.push('금융분쟁조정 신청서 (초안)')
  lines.push(`작성일: ${TODAY()}`)
  lines.push('')
  lines.push('■ 민원 내용')
  lines.push(text)
  lines.push('')

  if (classified.issues.length > 0) {
    lines.push('■ 관련 쟁점')
    lines.push(classified.issues.map((i) => i.replace(/_/g, ' ')).join(', '))
    lines.push('')
  }

  const favorableArguments = (evidence?.respondent_arguments ?? [])
    .map((a) => ({ a, title: basisConsumerTitle(a.basis) }))
    .filter((x): x is { a: RespondentArgumentGroup; title: string } => x.title !== null)
    .filter((x) => x.a.rejected_rate < 0.5)

  const favorableEvidence = (evidence?.evidence_patterns ?? []).filter(
    (p) => p.favorable_rate >= p.unfavorable_rate,
  )

  if (favorableArguments.length > 0 || favorableEvidence.length > 0) {
    lines.push('■ 참고 사항 (유사 사례 기준)')
    for (const { a, title } of favorableArguments) {
      lines.push(
        `- 금융회사가 "${title}"는 취지로 반박할 수 있으나, 유사 사례 ${a.count}건 중 ${a.rejected_count}건에서만 위원회가 이를 받아들이지 않았습니다.`,
      )
    }
    for (const p of favorableEvidence) {
      const label = p.source_terms.length > 0 ? p.source_terms.join(', ') : p.type
      lines.push(`- ${label} 자료가 있으면 유사 사례에서 신청인에게 유리하게 작용하는 경향이 있습니다.`)
    }
    lines.push('')
  }

  if (procedure && procedure.documents.length > 0) {
    lines.push('■ 준비 서류')
    for (const doc of procedure.documents) lines.push(`- ${doc}`)
    lines.push('')
  }

  lines.push(
    '※ 위 내용은 상담 데이터를 바탕으로 자동 생성된 초안입니다. 실제 제출 전 사실관계를 다시 확인하고 필요한 내용을 직접 보완하시기 바랍니다.',
  )

  return lines.join('\n')
}
