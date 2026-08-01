import type { Classified, Evidence, Procedure } from './api'

// 상담 이력 — 서버 저장 없이 이 브라우저의 localStorage에만 남는다("내 상담" 탭 전용).
// 리포트를 다시 보기 위해 요약 필드뿐 아니라 결과 화면을 그대로 재구성할 수 있는
// 전체 데이터(classified/answer/evidence/procedure)를 함께 저장한다.
const HISTORY_KEY = 'kb-mirybom-history'
const MAX_ENTRIES = 20
const SIMULATION_HISTORY_KEY = 'kb-mirybom-simulations'
const MAX_SIMULATION_ENTRIES = 12

export interface ConsultHistoryEntry {
  id: string
  createdAt: string
  timestamp?: string
  text: string
  issues: string[]
  medianRatio: number | null
  classified: Classified
  answer: string
  evidence: Evidence | null
  procedure: Procedure | null
  // 8-1/8-2용 — 사용자가 이 상담 결과 화면에서 직접 표시한 상태(자가 보고, 서버 전송 없음).
  possessedEvidence: string[]
  checkedDocuments: string[]
}

export interface SimulationSummary {
  rights: string[]
  action: string
  note: string
}

export interface SimulationMessage {
  role: 'assistant' | 'user'
  text: string
}

export interface SavedSimulationEntry {
  id: string
  createdAt: string
  messages: SimulationMessage[]
  summary: SimulationSummary | null
  completed: boolean
  contextText?: string
  contextIssues?: string[]
  contextHistoryEntryId?: string | null
}

export function loadHistory(): ConsultHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 이 필드들이 생기기 전에 저장된 이력에는 없을 수 있어 읽을 때 채워준다.
    return (parsed as Partial<ConsultHistoryEntry>[]).map((e) => ({
      ...e,
      possessedEvidence: e.possessedEvidence ?? [],
      checkedDocuments: e.checkedDocuments ?? [],
    })) as ConsultHistoryEntry[]
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

function persist(entries: ConsultHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // 저장 공간 초과 등은 이력 저장 실패로만 두고 상담 흐름 자체는 막지 않는다
  }
}

/** 새 상담 결과를 이력에 저장하고, 이후 이 상담에 자가보고 상태(보유 증거·체크한
    서류)를 이어 붙일 수 있도록 새 항목의 id를 반환한다. */
export function saveHistoryEntry(input: SaveHistoryInput): string {
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
    possessedEvidence: [],
    checkedDocuments: [],
  }
  persist([entry, ...loadHistory()].slice(0, MAX_ENTRIES))
  return entry.id
}

function persistSimulations(entries: SavedSimulationEntry[]): void {
  try {
    localStorage.setItem(SIMULATION_HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // 저장 공간 초과 등은 저장 실패로만 두고 사용 흐름은 유지한다
  }
}

export function loadSavedSimulations(): SavedSimulationEntry[] {
  try {
    const raw = localStorage.getItem(SIMULATION_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SavedSimulationEntry[]
  } catch {
    return []
  }
}

export function saveSimulationEntry(input: Omit<SavedSimulationEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): string {
  const existingEntries = loadSavedSimulations()
  const existingEntry = input.id ? existingEntries.find((entry) => entry.id === input.id) : null
  const entry: SavedSimulationEntry = {
    id: input.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? existingEntry?.createdAt ?? new Date().toISOString(),
    messages: input.messages,
    summary: input.summary,
    completed: input.completed,
    contextText: input.contextText,
    contextIssues: input.contextIssues,
    contextHistoryEntryId: input.contextHistoryEntryId,
  }
  const next = input.id
    ? existingEntries.map((saved) => (saved.id === input.id ? entry : saved))
    : [entry, ...existingEntries]
  persistSimulations(next.slice(0, MAX_SIMULATION_ENTRIES))
  return entry.id
}

export function deleteSimulationEntry(id: string): void {
  persistSimulations(loadSavedSimulations().filter((entry) => entry.id !== id))
}

function updateEntry(entryId: string, updater: (e: ConsultHistoryEntry) => ConsultHistoryEntry): void {
  const all = loadHistory()
  const idx = all.findIndex((e) => e.id === entryId)
  if (idx === -1) return
  all[idx] = updater(all[idx])
  persist(all)
}

/** 8-1 증거 보완 제안에서 "있어요"를 눌렀을 때 — 그 상담 이력에 보유 증거 유형으로
    남긴다(다음 상담에서 "지난번에 확보하려던 자료를 이번엔 보유" 비교에 쓰인다). */
export function addPossessedEvidence(entryId: string, evidenceType: string): void {
  updateEntry(entryId, (e) =>
    e.possessedEvidence.includes(evidenceType)
      ? e
      : { ...e, possessedEvidence: [...e.possessedEvidence, evidenceType] },
  )
}

export function setCheckedDocument(entryId: string, doc: string, checked: boolean): void {
  updateEntry(entryId, (e) => {
    const has = e.checkedDocuments.includes(doc)
    if (checked && !has) return { ...e, checkedDocuments: [...e.checkedDocuments, doc] }
    if (!checked && has) return { ...e, checkedDocuments: e.checkedDocuments.filter((d) => d !== doc) }
    return e
  })
}

/** "내 상담" 탭 상단 요약용 — 이력 전체에서 자주 나온 쟁점 상위 N개(2건 이상일 때만 의미 있음). */
export function mostFrequentIssues(entries: ConsultHistoryEntry[], limit = 3): { issue: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const e of entries) {
    for (const issue of e.issues) counts[issue] = (counts[issue] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function totalCheckedDocuments(entries: ConsultHistoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.checkedDocuments.length, 0)
}
