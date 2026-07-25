import { LogoMark } from './Logo'
import styles from './Header.module.css'

export type TabId = 'consult' | 'stats'

const TABS: { id: TabId; label: string }[] = [
  { id: 'consult', label: '상담' },
  { id: 'stats', label: '통계' },
]

interface HeaderProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={`${styles.inner} container`}>
        <div className={styles.brand}>
          <LogoMark size={22} />
          <span className={styles.label}>금융분쟁 상담</span>
        </div>
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
      </div>
    </header>
  )
}
