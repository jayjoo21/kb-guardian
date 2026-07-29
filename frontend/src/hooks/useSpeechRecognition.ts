import { useCallback, useEffect, useRef, useState } from 'react'

// 표준 lib.dom.d.ts에 Web Speech API 타입이 없어 필요한 부분만 최소로 선언한다.
interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface MinimalSpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => MinimalSpeechRecognition

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** 브라우저 내장 Web Speech API(SpeechRecognition, ko-KR)로 음성을 텍스트로 바꾼다.
    고령·취약계층 접근성을 위한 실제 동작 기능 — 미지원 브라우저는 supported=false만
    돌려주고, 호출부(MicButton)가 그 경우 버튼 자체를 숨긴다. */
export function useSpeechRecognition(onResult: (text: string) => void) {
  const [supported] = useState(() => getCtor() !== null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.lang = 'ko-KR'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('')
      onResultRef.current(transcript)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { supported, listening, start, stop }
}
