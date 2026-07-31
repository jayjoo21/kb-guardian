import { useState } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { chatWithAssistant, type ChatResponse } from '../lib/api'
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
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '죄송합니다. 현재 답변 처리 중 오류가 발생했습니다.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
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
