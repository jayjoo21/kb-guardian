import type { Classified, Evidence, Procedure } from './api'

// 상담 이력 — 서버 저장 없이 이 브라우저의 localStorage에만 남는다("내 상담" 탭 전용).
// 리포트를 다시 보기 위해 요약 필드뿐 아니라 결과 화면을 그대로 재구성할 수 있는
// 전체 데이터(classified/answer/evidence/procedure)를 함께 저장한다.
const HISTORY_KEY = 'kb-mirybom-history'
const MAX_ENTRIES = 20

export interface ConsultHistoryEntry {
  id: string
  createdAt: string
  text: string
  issues: string[]
  medianRatio: number | null
  classified: Classified
  answer: string
  evidence: Evidence | null
  procedure: Procedure | null
}

export function loadHistory(): ConsultHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ConsultHistoryEntry[]) : []
  } catch {
    return []
  }
}

interface SaveHistoryInput {
  text: string
  classified: Classified
  answer: string
  evidence: Evidence | null
  procedure: Procedure | null
}

export function saveHistoryEntry(input: SaveHistoryInput): void {
  const entry: ConsultHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    text: input.text,
    issues: input.classified.issues,
    medianRatio: input.evidence?.ratio_stats.median ?? null,
    classified: input.classified,
    answer: input.answer,
    evidence: input.evidence,
    procedure: input.procedure,
  }
  const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // 저장 공간 초과 등은 이력 저장 실패로만 두고 상담 흐름 자체는 막지 않는다
  }
}
