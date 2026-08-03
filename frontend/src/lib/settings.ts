// 설정 화면 환경설정 — localStorage에만 저장(서버 전송 없음).
const LARGE_TEXT_KEY = 'kb-mirybom-large-text'
const VOICE_GUIDE_KEY = 'kb-mirybom-voice-guide'
const LARGE_TEXT_ZOOM = '1.2'

export function loadLargeText(): boolean {
  return localStorage.getItem(LARGE_TEXT_KEY) === '1'
}

/** 앱이 전부 px 고정 단위라 컨테이너 font-size로는 하위 요소가 같이 커지지 않는다.
    그래서 뷰포트 전체에 CSS zoom(레이아웃까지 실제로 재계산되는 표준 속성 —
    transform:scale과 달리 넘침·잘림이 생기지 않는다)을 적용해 1.2배로 키운다. */
export function applyLargeText(enabled: boolean): void {
  document.documentElement.style.setProperty('--large-text-zoom', enabled ? LARGE_TEXT_ZOOM : '1')
}

export function setLargeText(enabled: boolean): void {
  try {
    localStorage.setItem(LARGE_TEXT_KEY, enabled ? '1' : '0')
  } catch {
    // 저장 공간이 없으면 이번 세션에서만 적용
  }
  applyLargeText(enabled)
}

export function loadVoiceGuide(): boolean {
  return localStorage.getItem(VOICE_GUIDE_KEY) === '1'
}

export function setVoiceGuide(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_GUIDE_KEY, enabled ? '1' : '0')
  } catch {
    // 저장 공간이 없으면 이번 세션에서만 적용
  }
}

const RIGHTS_ALERT_KEY = 'kb-mirybom-rights-alert-subscribed'

/** "맞춤형 권리 알림" 구독 여부 — 실제 발송 기능은 아직 없고(준비 중), 원할 때
    구독 상태만 기기에 저장해 둔다. */
export function loadRightsAlertSubscribed(): boolean {
  return localStorage.getItem(RIGHTS_ALERT_KEY) === '1'
}

export function setRightsAlertSubscribed(enabled: boolean): void {
  try {
    localStorage.setItem(RIGHTS_ALERT_KEY, enabled ? '1' : '0')
  } catch {
    // 저장 공간이 없으면 이번 세션에서만 적용
  }
}
