const API_BASE = 'http://localhost:8000'

export interface RatioStats {
  min: number | null
  median: number | null
  max: number | null
  avg: number | null
  n: number
}

export interface IssueStat {
  issue: string
  case_count: number
  ratio_stats: RatioStats
}

export interface DateRange {
  from_year: number
  to_year: number
}

/** 통계 탭/데이터 출처 카드용 — 전체 그래프 기준(쟁점 필터 없음) 노드 건수 + 기간. */
export interface CorpusTotals {
  precedents: number
  law_articles: number
  criteria: number
  date_range: DateRange | null
}

/** 전체 사례 기준(쟁점 필터 없음) 배상비율 분포 — 통계 탭 히스토그램용. */
export interface OverallRatioDistribution {
  min: number | null
  median: number | null
  max: number | null
  avg: number | null
  p25: number | null
  p75: number | null
  n: number
  values: number[]
}

/** "은행이 자주 쓰는 반박 논리" 순위용 — 전체 코퍼스 기준(쟁점 필터 없음) basis별 집계. */
export interface ArgumentBasisOverview {
  basis: string
  count: number
  rejected_count: number
  rejected_rate: number
}

/** "결과를 가르는 자료" 카드용 — 전체 코퍼스 기준(쟁점 필터 없음) EvidenceType별 집계. */
export interface EvidenceTypeOverview {
  type: string
  source_terms: string[]
  total: number
  favorable_rate: number
  unfavorable_rate: number
}

export interface StatsResponse {
  total_cases: number
  issues: IssueStat[]
  corpus: CorpusTotals
  overall_ratio_distribution: OverallRatioDistribution
  argument_basis_overview: ArgumentBasisOverview[]
  evidence_type_overview: EvidenceTypeOverview[]
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${API_BASE}/api/stats`)
  if (!res.ok) throw new Error(`stats 요청 실패 (${res.status})`)
  return res.json()
}

export type FactorConfidence = '반영' | '참고' | '판단_유보'

export interface SimulateFactorOption {
  name: string
  direction: '가산' | '감산' | '중립'
  pp: number | null
  n_with: number
  n_without: number
  confidence: FactorConfidence
}

export type Consistency = '일관' | '편차_큼' | '데이터_부족'

export interface RatioDistribution {
  min: number | null
  median: number | null
  max: number | null
  avg: number | null
  p25: number | null
  p75: number | null
  n: number
  values: number[]
  consistency: Consistency
}

export interface SimulateResponse {
  issue: string
  distribution: RatioDistribution
  factors: SimulateFactorOption[] // confidence === '반영'인 것만 옴(참고 정보, 계산기 아님)
}

export async function fetchSimulate(issue: string, signal?: AbortSignal): Promise<SimulateResponse> {
  const res = await fetch(`${API_BASE}/api/simulate/${encodeURIComponent(issue)}`, { signal })
  if (!res.ok) throw new Error(`simulate 요청 실패 (${res.status})`)
  return res.json()
}

export interface Classified {
  issues: string[]
  products: string[]
  factors: string[]
}

export interface Procedure {
  steps: string[]
  documents: string[]
}

export interface SimilarCase {
  case_id: string
  title: string
  case_no: string | null
  result: string | null
  ratio: number | null
  date: string | null
}

export interface LawArticleRef {
  issue: string
  ref: string
}

export interface CriteriaRef {
  id: string
  title: string
  summary: string | null
}

/** basis 그룹 안의 대표 사례 하나 — 같은 사건(case_id) 안에서 은행 주장과 위원회
    판단(인용문)을 짝지어 보여주기 위한 단위. quote가 null이면 위원회가 이 주장을
    직접 인용한 문장이 없다는 뜻(통계만 표시, 인용은 생략). */
export interface ArgumentSample {
  case_id: string
  /** "금감원 분쟁조정 제○○호" 표시용 공식 사건번호. 일부 사례는 결측이라 null일 수 있음 */
  case_no: string | null
  argument: string
  quote: string | null
}

/** "은행은 이렇게 반박할 수 있어요" 카드 하나 분량 — basis(반박 근거 유형)별 집계. */
export interface RespondentArgumentGroup {
  basis: string
  count: number
  rejected_count: number
  rejected_rate: number
  partial_count: number
  samples: ArgumentSample[]
}

export interface RatioComparison {
  with_avg: number
  with_n: number
  without_avg: number
  without_n: number
}

/** "이런 자료가 있으면 유리해요" 카드 하나 분량 — Evidence 유형별 집계. */
export interface EvidencePattern {
  type: string
  source_terms: string[]
  total: number
  favorable_rate: number
  unfavorable_rate: number
  ratio_comparison: RatioComparison | null
}

export interface Evidence {
  similar_cases: SimilarCase[]
  law_articles: LawArticleRef[]
  precedents: string[]
  ratio_stats: RatioStats
  criteria: CriteriaRef[]
  respondent_arguments: RespondentArgumentGroup[]
  evidence_patterns: EvidencePattern[]
}

export interface ConsultStreamHandlers {
  onClassified?: (data: Classified) => void
  onEvidence?: (data: Evidence) => void
  onProcedure?: (data: Procedure) => void
  onAnswerChunk?: (delta: string) => void
  onDone?: (answer: string) => void
  onError?: (message: string) => void
}

/** POST /api/consult의 SSE 스트림을 읽어 이벤트별 콜백을 호출한다. EventSource는 POST 바디를
    지원하지 않으므로 fetch()로 요청한 뒤 response.body를 직접 파싱한다(표준 SSE 프레이밍:
    "event: <name>\ndata: <json>\n\n").
    overrideIssues를 주면 서버가 classifier 재분류를 건너뛰고 이 쟁점을 그대로 써서
    evidence/answer를 재생성한다("이 쟁점이 아니에요" 재분석 흐름). */
export async function streamConsult(
  text: string,
  handlers: ConsultStreamHandlers,
  signal?: AbortSignal,
  overrideIssues?: string[],
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, override_issues: overrideIssues ?? null }),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`consult 요청 실패 (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  function dispatch(eventName: string, rawData: string) {
    let data: unknown
    try {
      data = JSON.parse(rawData)
    } catch {
      return
    }
    switch (eventName) {
      case 'classified':
        handlers.onClassified?.(data as Classified)
        break
      case 'evidence':
        handlers.onEvidence?.(data as Evidence)
        break
      case 'procedure':
        handlers.onProcedure?.(data as Procedure)
        break
      case 'answer_chunk':
        handlers.onAnswerChunk?.((data as { delta: string }).delta)
        break
      case 'done':
        handlers.onDone?.((data as { answer: string }).answer)
        break
      default:
        break
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sepIdx: number
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIdx)
      buffer = buffer.slice(sepIdx + 2)

      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length > 0) dispatch(eventName, dataLines.join('\n'))
    }
  }
}

export interface CaseIssueDetail {
  name: string
  result: string | null
}

export interface CaseFactorDetail {
  name: string
  direction: string | null
  value_pp: number | null
}

export interface CaseOutcomeDetail {
  respondent: string
  result: string | null
  ratio: number | null
  amount: number | null
}

/** 사건 하나의 전체 상세 — "실제 결정례" 카드를 펼쳤을 때 원문 요약을 보여주는 용도.
    summary/recommendation은 결정문에서 실제로 추출된 값이며, 없으면 null이다
    (지어내지 않음). */
export interface CaseDetail {
  case_id: string
  title: string
  case_no: string | null
  date: string | null
  sector: string | null
  summary: string | null
  recommendation: string | null
  issues: CaseIssueDetail[]
  products: string[]
  law_articles: string[]
  precedents: string[]
  factors: CaseFactorDetail[]
  outcomes: CaseOutcomeDetail[]
}

export async function fetchCaseDetail(caseId: string, signal?: AbortSignal): Promise<CaseDetail> {
  const res = await fetch(`${API_BASE}/api/case/${encodeURIComponent(caseId)}`, { signal })
  if (!res.ok) throw new Error(`case 요청 실패 (${res.status})`)
  return res.json()
}

/** 업로드한 서류 이미지/PDF 판독 결과. 이미지에 실제로 없는 항목은 null(추론 없음). */
export interface DocumentScanResult {
  readable: boolean
  document_type: string
  has_signature: boolean | null
  signature_note: string | null
  investment_profile_marked: boolean | null
  product_name: string | null
  notes: string | null
}

/** 서류 사진/PDF를 Claude 비전으로 판독한다("관련 서류 사진 올리기"). */
export async function scanDocument(file: File, signal?: AbortSignal): Promise<DocumentScanResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/document-scan`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `서류 판독 요청 실패 (${res.status})`)
  }
  return res.json()
}
