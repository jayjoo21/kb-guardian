import { useEffect } from 'react'
import { LogoMark } from '../components/Logo'
import styles from './SplashScreen.module.css'

const SPLASH_MS = 1200

interface SplashScreenProps {
  onDone: () => void
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(onDone, reduceMotion ? 0 : SPLASH_MS)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className={styles.splash} role="status" aria-label="불러오는 중">
      <LogoMark ignite size={52} />
      <h1 className={styles.name}>KB 미리봄</h1>
      <p className={styles.tagline}>내 상황, 결과를 미리 봅니다</p>
    </div>
  )
}
