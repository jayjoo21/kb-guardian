import { groupLawArticles } from './lawLinks'
import type { Classified, Evidence, Procedure } from './api'

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

/** 상담 결과(쟁점·법조항·유사 결정례·준비 서류)를 금감원 분쟁조정 신청서 형식
    (신청 취지 / 사실관계 / 위반 사항 / 근거 / 첨부 예정 서류)으로 엮어 초안을
    만든다. 전부 이 상담에서 실제로 받은 데이터(evidence/procedure)만 쓰고, 없는
    항목은 해당 절을 생략한다 — 지어내지 않는다. 사용자가 입력하지 않은 사실(신청인
    정보·피신청인명 등)은 절대 채워 넣지 않고 [ ]로 남겨 사용자가 직접 채우게
    한다. 어디까지나 초안이라는 점을 문안 자체에 명시한다. */
export function buildComplaintDraft({ text, classified, evidence, procedure }: BuildDraftInput): string {
  const lines: string[] = []
  const issueLabel = classified.issues.map((i) => i.replace(/_/g, ' ')).join(', ')

  lines.push('금융분쟁조정 신청서 (초안)')
  lines.push(`작성일: ${TODAY()}`)
  lines.push('')

  lines.push('■ 신청인')
  lines.push('성명: [ ]')
  lines.push('연락처: [ ]')
  lines.push('')

  lines.push('■ 피신청인')
  lines.push('금융회사명: [ ]')
  lines.push('')

  lines.push('■ 신청 취지')
  lines.push(
    `피신청인의 ${issueLabel || '[ ]'} 관련 금융소비자보호법 위반 사실을 확인하고, 이로 인해 신청인이 입은 손해를 배상해 줄 것을 신청합니다. (배상 금액: [ ]원)`,
  )
  lines.push('')

  lines.push('■ 사실관계')
  lines.push(text)
  lines.push('')

  const lawGroups = groupLawArticles((evidence?.law_articles ?? []).map((la) => la.ref))
  lines.push('■ 위반 사항(법조항)')
  if (lawGroups.length > 0) {
    for (const g of lawGroups) {
      lines.push(`- ${g.lawName}${g.articles.length > 0 ? ` ${g.articles.join(', ')}` : ''}`)
    }
  } else {
    lines.push('- [ ] (이번 상담에서 확인된 근거 법조항이 없습니다 — 직접 확인 후 기재해주세요)')
  }
  lines.push('')

  const similarCases = evidence?.similar_cases ?? []
  lines.push('■ 근거(유사 결정례)')
  if (similarCases.length > 0) {
    for (const c of similarCases) {
      const ref = c.case_no ? `금감원 분쟁조정 ${c.case_no}` : `사건 ${c.case_id}`
      lines.push(`- ${ref} — ${c.title}${c.result ? ` (${c.result})` : ''}`)
    }
  } else {
    lines.push('- [ ] (이번 상담에서 조회된 유사 결정례가 없습니다)')
  }
  lines.push('')

  if (procedure && procedure.documents.length > 0) {
    lines.push('■ 첨부 예정 서류')
    for (const doc of procedure.documents) lines.push(`- ${doc}`)
    lines.push('')
  }

  lines.push(
    '※ 위 내용은 상담 데이터를 바탕으로 자동 생성된 초안입니다. [ ] 표시 부분은 직접 입력하셔야 하며, 제출 전 사실관계를 다시 확인하고 필요한 내용을 보완하시기 바랍니다.',
  )

  return lines.join('\n')
}
