import type { ReactNode } from 'react'
import styles from './ScreenTransition.module.css'

interface ScreenTransitionProps {
  screenKey: string
  children: ReactNode
}

/** key가 바뀔 때마다 리마운트되어 슬라이드인 애니메이션이 재생된다(reduced-motion 존중). */
export function ScreenTransition({ screenKey, children }: ScreenTransitionProps) {
  return (
    <div key={screenKey} className={styles.enter}>
      {children}
    </div>
  )
}
