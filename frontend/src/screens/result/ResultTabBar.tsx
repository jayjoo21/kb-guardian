import styles from './ResultTabBar.module.css'

export type ResultTabId = 'summary' | 'analysis' | 'prepare' | 'evidence'

const TABS: { id: ResultTabId; label: string }[] = [
  { id: 'summary', label: '요약' },
  { id: 'analysis', label: '분석' },
  { id: 'prepare', label: '준비' },
  { id: 'evidence', label: '근거' },
]

interface ResultTabBarProps {
  active: ResultTabId
  onChange: (tab: ResultTabId) => void
}

export function ResultTabBar({ active, onChange }: ResultTabBarProps) {
  return (
    <div className={styles.bar} role="tablist" aria-label="상담 결과 탭">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`${styles.tab} ${active === tab.id ? styles.tabActive : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
