// 결과 피드백 — 서버 전송 없이 이 브라우저의 localStorage에만 기록한다.
const FEEDBACK_KEY = 'kb-mirybom-feedback'
const MAX_ENTRIES = 50

export type FeedbackReason = 'more_cases' | 'different_situation' | 'wrong_issue'

export interface FeedbackEntry {
  id: string
  createdAt: string
  text: string
  issues: string[]
  helpful: boolean
  reason?: FeedbackReason
}

export function loadFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : []
  } catch {
    return []
  }
}

interface SaveFeedbackInput {
  text: string
  issues: string[]
  helpful: boolean
  reason?: FeedbackReason
}

export function saveFeedback(input: SaveFeedbackInput): void {
  const entry: FeedbackEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...input,
  }
  const next = [entry, ...loadFeedback()].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(next))
  } catch {
    // 저장 실패해도 피드백 UI 흐름 자체는 막지 않는다
  }
}
