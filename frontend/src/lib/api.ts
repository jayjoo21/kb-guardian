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

export interface StatsResponse {
  total_cases: number
  issues: IssueStat[]
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

export interface ConsultStreamHandlers {
  onClassified?: (data: Classified) => void
  onEvidence?: (data: unknown) => void
  onProcedure?: (data: Procedure) => void
  onAnswerChunk?: (delta: string) => void
  onDone?: (answer: string) => void
  onError?: (message: string) => void
}

/** POST /api/consult의 SSE 스트림을 읽어 이벤트별 콜백을 호출한다. EventSource는 POST 바디를
    지원하지 않으므로 fetch()로 요청한 뒤 response.body를 직접 파싱한다(표준 SSE 프레이밍:
    "event: <name>\ndata: <json>\n\n"). */
export async function streamConsult(
  text: string,
  handlers: ConsultStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
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
        handlers.onEvidence?.(data)
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
