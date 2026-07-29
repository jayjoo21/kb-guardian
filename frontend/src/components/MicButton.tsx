import { Mic, MicOff } from 'lucide-react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import styles from './MicButton.module.css'

interface MicButtonProps {
  onResult: (text: string) => void
}

/** 음성 입력 버튼 — Web Speech API 미지원 브라우저에서는 아예 렌더링하지 않는다
    (없는 기능을 있는 척하지 않는다). */
export function MicButton({ onResult }: MicButtonProps) {
  const { supported, listening, start, stop } = useSpeechRecognition(onResult)
  if (!supported) return null

  return (
    <button
      type="button"
      className={`${styles.button} ${listening ? styles.listening : ''}`}
      onClick={listening ? stop : start}
      aria-label={listening ? '음성 입력 중지' : '음성으로 입력하기'}
      aria-pressed={listening}
    >
      {listening ? <MicOff size={16} strokeWidth={1.8} /> : <Mic size={16} strokeWidth={1.8} />}
    </button>
  )
}
