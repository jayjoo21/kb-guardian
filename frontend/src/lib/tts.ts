// 브라우저 내장 SpeechSynthesis 래퍼 — 서버 TTS·녹음 파일이 아니라 실제 브라우저
// API로 진짜 읽어준다. 지원하지 않는 브라우저에서는 isSpeechSupported()가 false를
// 반환하므로, 호출부는 버튼 자체를 숨겨야 한다(동작하지 않는 버튼을 보여주지 않음).

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, onEnd?: () => void): void {
  if (!isSpeechSupported()) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  if (onEnd) {
    utterance.onend = onEnd
    utterance.onerror = onEnd
  }
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
