import { Logo } from './Logo'
import styles from './Header.module.css'

export type TabId = 'consult' | 'graph' | 'stats'

const TABS: { id: TabId; label: string }[] = [
  { id: 'consult', label: '상담' },
  { id: 'graph', label: '그래프' },
  { id: 'stats', label: '통계' },
]

interface HeaderProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className={styles.header}>
      <Logo />
      <nav className={styles.tabs} aria-label="주요 화면 전환">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={styles.tab}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
