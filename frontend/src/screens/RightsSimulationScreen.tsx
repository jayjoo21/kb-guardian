import { useEffect, useMemo, useState } from 'react'
import { Sparkles, CircleCheckBig, ArrowLeft, Send, Save } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { loadHistory, saveSimulationEntry, type SavedSimulationEntry } from '../lib/history'
import type { Evidence, Procedure } from '../lib/api'
import styles from './RightsSimulationScreen.module.css'

interface RightsSimulationScreenProps {
  onBack?: () => void
  context?: {
    text?: string
    issues?: string[]
    evidence?: Evidence | null
    procedure?: Procedure | null
    historyEntryId?: string | null
  }
  initialSession?: SavedSimulationEntry | null
}

type ChatMessage = {
  role: 'assistant' | 'user'
  text: string
}

type QuickOption = {
  id: string
  label: string
  assistantReply: string
  summaryRights: string[]
  summaryAction: string
  summaryNote: string
}

const QUICK_OPTIONS: QuickOption[] = [
  {
    id: 'rights',
    label: '내 주장을 정리하고 싶어요',
    assistantReply: '좋아요. 최근 상담 흐름을 기준으로, 어떤 주장부터 정리할지 함께 짚어보겠습니다.',
    summaryRights: ['설명의무', '증거 정리'],
    summaryAction: '상담 내용을 사건별로 정리하고, 주장 포인트를 한 줄씩 적어보세요.',
    summaryNote: '최근 상담 결과에 나온 쟁점이 핵심 주장 연결의 출발점이 됩니다.',
  },
  {
    id: 'evidence',
    label: '증거를 더 확보하고 싶어요',
    assistantReply: '증거 확보는 분쟁 대응의 속도와 승산을 크게 좌우해요. 지금 바로 확인할 항목을 짚어보겠습니다.',
    summaryRights: ['증거 보존', '서류 준비'],
    summaryAction: '통화·문자·계약서·상품설명서·거래내역을 한 번에 모아두세요.',
    summaryNote: '이미 보유한 기록이 있으면, 그 흐름을 바탕으로 다음 단계를 더 빨리 진행할 수 있어요.',
  },
  {
    id: 'bank',
    label: '은행 반박에 대비하고 싶어요',
    assistantReply: '좋습니다. 은행이 자주 쓰는 반박 논리를 먼저 정리한 뒤, 내 쪽 주장과 비교해보는 게 효과적입니다.',
    summaryRights: ['반박 대응', '권리 안내'],
    summaryAction: '은행의 주장과 내 주장 사이의 차이를 문장으로 정리해 두세요.',
    summaryNote: '은행 반박은 증거와 사건 맥락을 기준으로 대응해야 실제 효과가 커집니다.',
  },
]

function buildInitialMessage(context?: RightsSimulationScreenProps['context']) {
  const history = loadHistory()
  const latest = context?.historyEntryId ? history.find((entry) => entry.id === context.historyEntryId) : history[0]
  const issueText = context?.issues?.length
    ? context.issues.slice(0, 2).join(' · ')
    : latest?.issues?.slice(0, 2).join(' · ')

  const evidenceText = latest?.possessedEvidence?.length
    ? `이미 확보한 자료로는 ${latest.possessedEvidence.join(', ')}가 있어요.`
    : '아직 확보한 자료가 적다면, 지금부터 정리하는 흐름이 가장 중요해요.'

  const base = context?.text
    ? `최근 상담 내용 “${context.text}”와 연결해 보면, ${issueText ? `현재 쟁점은 ${issueText}로 보입니다.` : '당신의 상황을 기준으로 권리를 정리해볼 수 있습니다.'}`
    : issueText
      ? `최근 상담 결과를 보면 ${issueText} 쟁점이 떠올라요.`
      : '최근 상담 흐름을 기준으로 권리와 다음 행동을 함께 정리해볼게요.'

  return `${base}\n${evidenceText}\n원하시는 방향을 선택해 주세요.`
}

function buildFreeformReply(input: string) {
  const lower = input.toLowerCase()

  if (lower.includes('증거') || lower.includes('서류') || lower.includes('문서')) {
    return {
      assistantReply: '증거와 서류는 분쟁 대응의 핵심이에요. 지금은 어떤 자료가 있는지부터 정리해 두면 좋습니다.',
      summaryRights: ['증거 보존', '서류 준비'],
      summaryAction: '이미 확보한 자료와 빠진 자료를 나눠서 체크리스트로 정리해보세요.',
      summaryNote: '증거가 정리되면 상담 결과 화면의 서류 체크 흐름과도 자연스럽게 이어집니다.',
    }
  }

  if (lower.includes('반박') || lower.includes('은행')) {
    return {
      assistantReply: '은행 반박은 보통 “고객이 서명했다”, “설명을 들었다” 같은 논리로 돌아가요. 내 주장과 비교해 보며 정리하는 편이 좋습니다.',
      summaryRights: ['반박 대응', '권리 안내'],
      summaryAction: '은행이 내세울 수 있는 반박 논리와, 내가 보완해야 할 증거를 나란히 정리해보세요.',
      summaryNote: '상담 결과에서 확인한 쟁점과 연결하면 반박 대응의 방향이 더 선명해집니다.',
    }
  }

  return {
    assistantReply: '좋아요. 지금 상황을 기준으로 바로 이어질 수 있는 권리와 행동을 정리해보겠습니다.',
    summaryRights: ['설명의무', '증거 정리'],
    summaryAction: '내 사건의 핵심 쟁점과 보유 자료를 한 번에 정리해두세요.',
    summaryNote: '최근 상담 결과를 바탕으로 보면, 이 흐름이 가장 현실적입니다.',
  }
}

export function RightsSimulationScreen({ onBack, context, initialSession }: RightsSimulationScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialSession?.messages ?? [
      {
        role: 'assistant',
        text: buildInitialMessage(context),
      },
    ],
  )
  const [draft, setDraft] = useState('')
  const [completed, setCompleted] = useState(initialSession?.completed ?? false)
  const [summary, setSummary] = useState<{
    rights: string[]
    action: string
    note: string
  } | null>(initialSession?.summary ?? null)
  const [saveState, setSaveState] = useState<'idle' | 'saved'>(initialSession ? 'saved' : 'idle')

  useEffect(() => {
    if (initialSession) {
      setMessages(initialSession.messages)
      setDraft('')
      setCompleted(initialSession.completed)
      setSummary(initialSession.summary ?? null)
      setSaveState('idle')
      return
    }

    setMessages([
      {
        role: 'assistant',
        text: buildInitialMessage(context),
      },
    ])
    setDraft('')
    setCompleted(false)
    setSummary(null)
    setSaveState('idle')
  }, [context?.text, context?.historyEntryId, initialSession?.id])

  const historySummary = useMemo(() => {
    const history = loadHistory()
    const latest = context?.historyEntryId ? history.find((entry) => entry.id === context.historyEntryId) : history[0]
    if (!latest) return null
    return {
      issueCount: latest.issues.length,
      possessedEvidence: latest.possessedEvidence,
      checkedDocuments: latest.checkedDocuments,
    }
  }, [context?.historyEntryId])

  function appendMessage(role: ChatMessage['role'], text: string) {
    setMessages((prev) => [...prev, { role, text }])
  }

  function handleChoice(option: QuickOption) {
    appendMessage('user', option.label)
    appendMessage('assistant', option.assistantReply)
    setSummary({
      rights: option.summaryRights,
      action: option.summaryAction,
      note: option.summaryNote,
    })
    setCompleted(true)
  }

  function handleSend() {
    const trimmed = draft.trim()
    if (!trimmed) return

    const reply = buildFreeformReply(trimmed)
    appendMessage('user', trimmed)
    appendMessage('assistant', reply.assistantReply)
    setSummary({
      rights: reply.summaryRights,
      action: reply.summaryAction,
      note: reply.summaryNote,
    })
    setCompleted(true)
    setDraft('')
  }

  function resetSimulation() {
    setMessages([
      {
        role: 'assistant',
        text: buildInitialMessage(context),
      },
    ])
    setDraft('')
    setCompleted(false)
    setSummary(null)
    setSaveState('idle')
  }

  function handleSave() {
    if (!summary) return
    const savedId = initialSession?.id
    saveSimulationEntry({
      id: savedId,
      messages,
      summary,
      completed: true,
      contextText: context?.text,
      contextIssues: context?.issues,
      contextHistoryEntryId: context?.historyEntryId,
    })
    setSaveState('saved')
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="권리 찾기 시뮬레이션" onBack={onBack} />

      <div className={styles.content}>
        <section className={styles.heroCard}>
          <div className={styles.heroIcon}>
            <Sparkles size={18} />
          </div>
          <div>
            <p className={styles.heroLabel}>미리봄 시뮬레이션</p>
            <h2 className={styles.heroTitle}>최근 상담 결과와 연결해서, 지금 가장 현실적인 권리 대응을 미리 연습해 봐요.</h2>
          </div>
        </section>

        {historySummary && (
          <section className={styles.historyCard}>
            <p className={styles.historyLabel}>최근 상담에서 반영된 내용</p>
            <p className={styles.historyText}>
              {historySummary.issueCount}개 쟁점, 보유한 자료 {historySummary.possessedEvidence.length}개, 체크한 서류 {historySummary.checkedDocuments.length}개
            </p>
          </section>
        )}

        <section className={styles.chatCard}>
          <div className={styles.chatMessages}>
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`${styles.bubble} ${message.role === 'user' ? styles.userBubble : styles.assistantBubble}`}>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
        </section>

        {!completed && (
          <>
            <section className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <p className={styles.stepLabel}>대화형 가이드</p>
                <h3 className={styles.questionTitle}>지금 가장 먼저 확인하고 싶은 걸 선택해 주세요.</h3>
              </div>

              <div className={styles.optionList}>
                {QUICK_OPTIONS.map((option) => (
                  <button key={option.id} type="button" className={styles.optionButton} onClick={() => handleChoice(option)}>
                    <span>{option.label}</span>
                    <span className={styles.optionArrow}>↳</span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.inputCard}>
              <p className={styles.inputHint}>또는 이렇게 써보세요: “증거가 아직 없어요”, “은행이 반박할까 봐 걱정돼요”</p>
              <div className={styles.inputRow}>
                <input
                  type="text"
                  className={styles.input}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="자유롭게 입력해 주세요"
                />
                <button type="button" className={styles.sendButton} onClick={handleSend}>
                  <Send size={16} />
                </button>
              </div>
            </section>
          </>
        )}

        {completed && summary && (
          <section className={styles.resultCard}>
            <div className={styles.resultHeader}>
              <div className={styles.resultIcon}>
                <CircleCheckBig size={18} />
              </div>
              <div>
                <p className={styles.resultLabel}>추천 결과</p>
                <h3 className={styles.resultTitle}>이 흐름대로 정리하면 다음 단계가 더 수월해집니다.</h3>
              </div>
            </div>

            <div className={styles.resultBody}>
              <div className={styles.resultBlock}>
                <h4>추천 권리</h4>
                <div className={styles.rightsList}>
                  {summary.rights.map((right) => (
                    <span key={right} className={styles.rightChip}>{right}</span>
                  ))}
                </div>
              </div>

              <div className={styles.resultBlock}>
                <h4>바로 해볼 행동</h4>
                <p>{summary.action}</p>
              </div>

              <div className={styles.resultBlock}>
                <h4>한 줄 메모</h4>
                <p>{summary.note}</p>
              </div>
            </div>

            <div className={styles.resultActions}>
              <button type="button" className={styles.saveButton} onClick={handleSave}>
                <Save size={16} />
                {saveState === 'saved' ? '마이페이지에 저장됨' : '결과 저장하기'}
              </button>
              <button type="button" className={styles.resetButton} onClick={resetSimulation}>
                <ArrowLeft size={16} />
                다시 시작하기
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
