import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  /** 실제 집계 수치만 넣을 것 — 예측 점수·확률처럼 근거 없는 수치의 카운트업은 금지 */
  value: number
  durationMs?: number
  className?: string
}

/** 집계 수치(사례 건수 등)가 화면에 등장할 때 0에서 실제값까지 세는 연출.
    reduced-motion이면 애니메이션 없이 바로 최종값을 보여준다. */
export function CountUp({ value, durationMs = 600, className }: CountUpProps) {
  const [display, setDisplay] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0,
  )
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      setDisplay(value)
      return
    }
    let raf: number
    startRef.current = null
    function tick(ts: number) {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - (1 - progress) ** 3
      setDisplay(Math.round(value * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return <span className={className}>{display}</span>
}
