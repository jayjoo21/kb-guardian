// 진행 단계는 앱이 실제로 아는 정보가 아니라 사용자가 스스로 표시하는 값이다
// (금감원/은행 시스템과 연동이 없으므로 자동 추적은 거짓이 된다). localStorage에만 저장.
const STAGE_KEY = 'kb-mirybom-progress-stage'

export function loadCurrentStage(): number | null {
  const raw = localStorage.getItem(STAGE_KEY)
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function saveCurrentStage(stage: number): void {
  localStorage.setItem(STAGE_KEY, String(stage))
}

export function clearCurrentStage(): void {
  localStorage.removeItem(STAGE_KEY)
}
