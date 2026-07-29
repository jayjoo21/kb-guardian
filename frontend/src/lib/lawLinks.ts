// 국가법령정보센터(law.go.kr) 링크 생성 — 존재를 확인한 두 URL 패턴만 쓴다:
//   법령 본문: https://www.law.go.kr/법령/{법령명}  (실제 로드 확인됨)
//   판례 검색: https://www.law.go.kr/precSc.do?menuId=7&query={사건번호}  (검색결과 인덱스에서 확인됨)
// 조항 단위 딥링크는 신뢰할 수 있는 패턴을 확인하지 못해 법령 본문 페이지까지만 연결한다.

const LAW_BASE = 'https://www.law.go.kr/법령/'
const PRECEDENT_SEARCH_BASE = 'https://www.law.go.kr/precSc.do?menuId=7&query='

/** "금융소비자보호법 제19조" 같은 ref 문자열에서 법령명만 분리한다("제19조" 이전까지). */
export function lawNameFromRef(ref: string): string {
  const idx = ref.indexOf('제')
  return (idx > 0 ? ref.slice(0, idx) : ref).trim()
}

export function lawArticleUrl(lawName: string): string {
  return LAW_BASE + encodeURIComponent(lawName)
}

// 판례 인용문(예: "대법원 1990. 7. 10. 선고 90다카7460 판결")에서 사건번호만 추출.
// 대부분 {연도(2~4자리)}{한글 1~3자}{숫자} 형태(90다카7460, 2004다43824, 2016다3638 등).
const CASE_NUMBER_PATTERN = /\d{2,4}[가-힣]{1,3}\d+/

export function precedentCaseNumber(ref: string): string | null {
  const m = ref.match(CASE_NUMBER_PATTERN)
  return m ? m[0] : null
}

export function precedentUrl(ref: string): string | null {
  const caseNo = precedentCaseNumber(ref)
  return caseNo ? PRECEDENT_SEARCH_BASE + encodeURIComponent(caseNo) : null
}

export interface LawArticleGroup {
  lawName: string
  articles: string[]
  url: string
}

/** LawArticleRef[]를 법령명 기준으로 묶는다(같은 법 여러 조항을 한 링크로). */
export function groupLawArticles(refs: string[]): LawArticleGroup[] {
  const byLaw = new Map<string, string[]>()
  for (const ref of refs) {
    const name = lawNameFromRef(ref)
    const articlePart = ref.slice(name.length).trim()
    const list = byLaw.get(name) ?? []
    if (articlePart && !list.includes(articlePart)) list.push(articlePart)
    byLaw.set(name, list)
  }
  return Array.from(byLaw.entries()).map(([lawName, articles]) => ({
    lawName,
    articles,
    url: lawArticleUrl(lawName),
  }))
}
