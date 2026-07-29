import styles from './TopAppBar.module.css'

interface TopAppBarProps {
  title: string
  onBack?: () => void
  onHome?: () => void
}

export function TopAppBar({ title, onBack, onHome }: TopAppBarProps) {
  return (
    <header className={styles.bar}>
      {onBack ? (
        <button type="button" className={styles.action} onClick={onBack} aria-label="뒤로가기">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
      ) : (
        <span className={styles.spacer} aria-hidden="true" />
      )}
      <h1 className={styles.title}>{title}</h1>
      {onHome ? (
        <button type="button" className={styles.action} onClick={onHome} aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M6 10v9h12v-9" />
          </svg>
        </button>
      ) : (
        <span className={styles.spacer} aria-hidden="true" />
      )}
    </header>
  )
}
