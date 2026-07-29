import { useState } from 'react'
import { Bell } from 'lucide-react'
import { loadNotifPref, saveNotifPref } from '../../lib/notifications'
import styles from './NotificationPreview.module.css'

// 실시간 발송 기능이 없으므로(서버 전송·시스템 푸시 미구현) 어디까지나 "이런 알림을
// 보여드릴 예정" 예시다. 그 중 은행 답변 기한(30일)만 실제 절차 데이터에 근거하고,
// 나머지는 화면 안내로만 쓴다 — 특정 사용자의 실제 기한을 아는 척하지 않는다.
const EXAMPLE_NOTIFICATIONS = [
  {
    title: '은행 답변 기한이 다가와요',
    body: '민원 접수 후 통상 30일 이내에 은행 답변이 옵니다.',
  },
  {
    title: '분쟁조정 신청을 준비해보세요',
    body: '은행 답변에 동의하지 않으신다면 금감원 분쟁조정을 신청할 수 있어요.',
  },
  {
    title: '저장된 상담을 다시 확인해보세요',
    body: '지난 상담 기록은 언제든 "내 상담"에서 다시 볼 수 있어요.',
  },
]

/** 알림 미리보기 — 정직한 mock. 실제 발송·시스템 푸시는 없다고 명시하고, 토글은
    이 화면에 예시를 계속 보여줄지만 결정한다(서버로 아무것도 보내지 않음). */
export function NotificationPreview() {
  const [enabled, setEnabled] = useState(() => loadNotifPref())

  function toggle() {
    const next = !enabled
    setEnabled(next)
    saveNotifPref(next)
  }

  return (
    <section className={`${styles.card} card`} aria-label="알림">
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.title}>알림</span>
          <span className={styles.subtitle}>잠금화면 알림(시스템 푸시)은 아직 없어요 — 준비 중이에요</span>
        </div>
        <button
          type="button"
          className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
          role="switch"
          aria-checked={enabled}
          aria-label="알림 받기"
          onClick={toggle}
        >
          <span className={styles.toggleKnob} />
        </button>
      </div>

      {enabled && (
        <div className={styles.list}>
          <p className={styles.listLabel}>이런 알림을 이 화면에서 보여드릴 예정이에요 (예시)</p>
          {EXAMPLE_NOTIFICATIONS.map((n) => (
            <div key={n.title} className={styles.item}>
              <Bell size={14} className={styles.itemIcon} aria-hidden="true" />
              <div>
                <p className={styles.itemTitle}>{n.title}</p>
                <p className={styles.itemBody}>{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
