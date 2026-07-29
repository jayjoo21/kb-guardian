import { Home, MessageSquareText, BarChart3 } from 'lucide-react'
import type { TabScreenId } from './useScreenNav'
import styles from './BottomTabBar.module.css'

interface TabDef {
  id: TabScreenId
  label: string
  Icon: typeof Home
}

const TABS: TabDef[] = [
  { id: 'home', label: '홈', Icon: Home },
  { id: 'my-consult', label: '내 상담', Icon: MessageSquareText },
  { id: 'stats', label: '통계', Icon: BarChart3 },
]

interface BottomTabBarProps {
  active: TabScreenId
  onChange: (id: TabScreenId) => void
}

export function BottomTabBar({ active, onChange }: BottomTabBarProps) {
  return (
    <nav className={styles.bar} aria-label="주요 화면 전환">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <span className={`${styles.iconWrap} ${isActive ? styles.iconWrapActive : ''}`} aria-hidden="true">
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
            </span>
            <span className={styles.label}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
