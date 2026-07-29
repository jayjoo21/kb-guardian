// "알림 받기" 토글은 실제 서버 발송이나 시스템 푸시를 켜지 않는다(그런 기능이
// 없어서 — 가짜 버튼 방지). 이 화면에 예시 알림을 계속 보여줄지 여부만 로컬에 저장.
const NOTIF_PREF_KEY = 'kb-mirybom-notif-enabled'

export function loadNotifPref(): boolean {
  return localStorage.getItem(NOTIF_PREF_KEY) === 'true'
}

export function saveNotifPref(enabled: boolean): void {
  localStorage.setItem(NOTIF_PREF_KEY, String(enabled))
}
