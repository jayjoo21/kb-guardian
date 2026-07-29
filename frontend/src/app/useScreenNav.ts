import { useCallback, useState } from 'react'

export type TabScreenId = 'home' | 'my-consult' | 'stats'
export type ScreenId = 'splash' | 'login' | 'signup' | TabScreenId | 'consult' | 'result' | 'settings'

export function isTabScreen(screen: ScreenId): screen is TabScreenId {
  return screen === 'home' || screen === 'my-consult' || screen === 'stats'
}

/** 화면 전환을 스택으로 관리 — 탭 전환은 replaceAll(형제 화면끼리 히스토리 없음),
    상세 진입(상담 등)은 push, 뒤로가기는 back으로 pop한다. */
export function useScreenNav(initial: ScreenId) {
  const [stack, setStack] = useState<ScreenId[]>([initial])
  const current = stack[stack.length - 1]

  const push = useCallback((screen: ScreenId) => {
    setStack((prev) => [...prev, screen])
  }, [])

  const replaceAll = useCallback((screen: ScreenId) => {
    setStack([screen])
  }, [])

  /** 스택 맨 위만 다른 화면으로 바꾼다(예: consult 로딩 -> result, 뒤로가기는 그 이전 화면으로). */
  const replaceTop = useCallback((screen: ScreenId) => {
    setStack((prev) => [...prev.slice(0, -1), screen])
  }, [])

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }, [])

  return { current, push, replaceAll, replaceTop, back, canGoBack: stack.length > 1 }
}
