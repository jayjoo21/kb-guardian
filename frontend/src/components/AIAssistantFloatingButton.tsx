import { useState, type KeyboardEvent } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { chatWithAssistant } from '../lib/api'
import styles from './AIAssistantFloatingButton.module.css'

interface AIAssistantFloatingButtonProps {
  currentEvidence?: Record<string, unknown> | null
  onNavigateToScreen?: (screen: string) => void
  onStartConsult?: (text: string) => void
}

export function AIAssistantFloatingButton({
  currentEvidence,
  onNavigateToScreen,
  onStartConsult,
}: AIAssistantFloatingButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; source?: string }>>([])
  const [loading, setLoading] = useState(false)

  function createMockAssistantReply(input: string) {
    const trimmed = input.trim()
    const lower = trimmed.toLowerCase()

    if (lower.includes('시뮬레이션') || lower.includes('권리 찾기')) {
      return {
        answer:
          '권리 찾기 시뮬레이션으로 바로 이동해 드릴게요. 몇 가지 선택지에 답하면 내 상황에 맞는 권리와 다음 행동을 정리해 드립니다.',
        source: '모의 응답',
        action: 'navigate_to_screen' as const,
        action_data: 'rights-simulation',
      }
    }

    if (lower.includes('서류') || lower.includes('문서') || lower.includes('체크')) {
      return {
        answer:
          '금감원 분쟁조정에선 계약서, 통화 녹취, 송금 내역, 상담 기록과 같은 증거를 먼저 정리하는 것이 중요합니다. 지금은 서류 체크 흐름으로 안내해 드릴게요.',
        source: '모의 응답',
        action: 'navigate_to_screen' as const,
        action_data: 'prevention',
      }
    }

    if (lower.includes('법') || lower.includes('금소법') || lower.includes('설명의무') || lower.includes('적합성')) {
      return {
        answer:
          '금소법(금융소비자보호법)에 따라 금융회사는 설명의무를 다하고, 적합성원칙에 따라 투자성향에 맞지 않는 상품 권유는 문제가 될 수 있습니다. 권리 안내 화면에서 관련 조항을 더 확인해 보세요.',
        source: '모의 응답',
        action: 'navigate_to_screen' as const,
        action_data: 'consumer-rights',
      }
    }

    if (lower.includes('반박') || lower.includes('예측') || lower.includes('은행')) {
      return {
        answer:
          '은행이 자주 내세우는 반박은 “고객이 직접 서명했다”, “설명을 충분히 받았다”는 식입니다. 현재 상황을 바탕으로 반박 포인트를 정리해 드릴게요.',
        source: '모의 응답',
        action: 'start_consult' as const,
        action_data: '반박 예측이 필요합니다. 현재 상황을 자세히 알려주세요.',
      }
    }

    return {
      answer:
        '현재 백엔드 연결이 불안정해도 데모용으로 바로 이어서 답변할 수 있습니다. 상담 시작, 서류 체크, 권리 안내 중 원하는 흐름을 한 번 더 말해 주세요.',
      source: '모의 응답',
      action: null,
      action_data: null,
    }
  }

  async function handleSend() {
    if (!message.trim() || loading) return

    const userMessage = message
    setMessage('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      const response = await chatWithAssistant({
        message: userMessage,
        current_evidence: currentEvidence,
      })

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.answer,
          source: response.source || undefined,
        },
      ])

      // 액션 처리
      if (response.action === 'navigate_to_screen' && response.action_data && onNavigateToScreen) {
        onNavigateToScreen(response.action_data)
      } else if (response.action === 'start_consult' && response.action_data && onStartConsult) {
        onStartConsult(response.action_data)
      }
    } catch (err) {
      console.error('채팅 실패:', err)
      const fallback = createMockAssistantReply(userMessage)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fallback.answer,
          source: fallback.source,
        },
      ])

      if (fallback.action === 'navigate_to_screen' && fallback.action_data && onNavigateToScreen) {
        onNavigateToScreen(fallback.action_data)
      } else if (fallback.action === 'start_consult' && fallback.action_data && onStartConsult) {
        onStartConsult(fallback.action_data)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.container}>
      {isOpen && (
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderContent}>
              <MessageCircle size={20} className={styles.chatIcon} />
              <span className={styles.chatTitle}>AI 도우미</span>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>

          <div className={styles.chatMessages}>
            {messages.length === 0 && (
              <div className={styles.welcomeMessage}>
                <p className={styles.welcomeText}>
                  안녕하세요! 금융 소비자 보호 AI 도우미입니다.
                </p>
                <p className={styles.welcomeHint}>
                  용어, 앱 기능, 현재 상담 결과에 대해 물어보세요.
                </p>
              </div>
            )}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : styles.assistantMessage}`}
              >
                <div className={styles.messageContent}>
                  <p className={styles.messageText}>{msg.content}</p>
                  {msg.source && <p className={styles.messageSource}>{msg.source}</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={styles.messageContent}>
                  <p className={styles.messageText}>답변 중...</p>
                </div>
              </div>
            )}
          </div>

          <div className={styles.chatInput}>
            <input
              type="text"
              className={styles.input}
              placeholder="질문을 입력하세요..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <button
              type="button"
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!message.trim() || loading}
              aria-label="전송"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`${styles.floatingButton} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? '채팅 닫기' : 'AI 도우미'}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  )
}
