import styles from './PlaceholderView.module.css'

export function PlaceholderView({ label }: { label: string }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.text}>{label} 화면은 준비 중입니다.</p>
    </div>
  )
}
