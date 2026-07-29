import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isSpeechSupported, speak, stopSpeaking } from '../lib/tts'
import styles from './SpeakButton.module.css'

interface SpeakButtonProps {
  text: string
}

/** 설정의 "음성 안내"를 켠 경우에만 노출되는 실제 음성 재생 버튼(브라우저 내장
    SpeechSynthesis). 지원하지 않는 브라우저에서는 아예 렌더링하지 않는다 —
    눌러도 반응 없는 가짜 버튼을 두지 않는다. */
export function SpeakButton({ text }: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => () => stopSpeaking(), [])

  if (!isSpeechSupported()) return null

  function toggle() {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
    } else {
      speak(text, () => setSpeaking(false))
      setSpeaking(true)
    }
  }

  return (
    <button type="button" className={styles.button} onClick={toggle} aria-pressed={speaking}>
      {speaking ? <VolumeX size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
      {speaking ? '음성 멈추기' : '음성으로 듣기'}
    </button>
  )
}
