import { LogoMark } from './Logo'
import styles from './LoadingScreen.module.css'

export function LoadingScreen() {
  return (
    <div className={styles.screen} role="status" aria-label="불러오는 중">
      <LogoMark ignite size={40} />
    </div>
  )
}
