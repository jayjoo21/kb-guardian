import { useState, type ReactNode } from 'react'
import styles from './AccordionSection.module.css'

interface AccordionSectionProps {
  title: string
  /** 섹션을 나타내는 의미 아이콘(lucide-react 등 라인 아이콘 엘리먼트) */
  icon?: ReactNode
  /** 옐로 포인트로 강조할 핵심/하이라이트 섹션인지(아이콘 배지 색만 바뀜, 남용 금지) */
  accent?: boolean
  /** 접힌 헤더에 보이는 작은 개수 배지(있는 경우) — 안에 뭐가 몇 개 있는지 미리 알려준다 */
  badge?: number
  defaultOpen?: boolean
  /** 다른 화면 요소(피드백 위젯 등)가 앵커 스크롤로 가리킬 때 쓰는 id */
  id?: string
  children: ReactNode
}

/** "전부 기본 접힘" 상세 섹션 공통 셸. 탭하면 펼쳐지고, 내용은 각 사용처가 채운다. */
export function AccordionSection({
  title,
  icon,
  accent = false,
  badge,
  defaultOpen = false,
  id,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section id={id} className={`${styles.section} card`}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.titleGroup}>
          {icon && (
            <span className={`${styles.iconBadge} ${accent ? styles.iconBadgeAccent : ''}`} aria-hidden="true">
              {icon}
            </span>
          )}
          <span className={styles.title}>{title}</span>
        </span>
        <span className={styles.headerRight}>
          {badge !== undefined && badge > 0 && <span className={styles.badge}>{badge}</span>}
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className={styles.content}>{children}</div>}
    </section>
  )
}
