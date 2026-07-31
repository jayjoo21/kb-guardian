import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import styles from './SplashScreen.module.css'

const SPLASH_MS = 3500

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
      <Loader2 size={32} className={styles.spinner} />
      <LogoMark ignite size={80} />
      <h1 className={styles.name}>KB 미리봄</h1>
      <p className={styles.tagline}>
        불공정한 상황에서<br/>
        소비자 권익을 지키는<br/>
        금융 분쟁 대응 AI 에이전트
      </p>
    </div>
  )
}
