import type { ReactNode } from 'react'
import styles from './Chip.module.css'

interface ChipProps {
  children: ReactNode
  mono?: boolean
}

/** 쟁점/상품 태그 — 연한 그레이 카드 배경 + 잉크 텍스트. 칩은 정보 표시이지 강조가
    아니므로 kb-yellow를 쓰지 않는다(옐로는 로고·CTA·핵심 데이터 강조 전용). */
export function Chip({ children, mono = false }: ChipProps) {
  return <span className={`${styles.chip} ${mono ? 'mono' : ''}`}>{children}</span>
}
