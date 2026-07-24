import type { ReactNode } from 'react'
import styles from './Chip.module.css'

interface ChipProps {
  children: ReactNode
  mono?: boolean
}

/** 쟁점/상품 태그 — "옐로 링"(채움 아님, 테두리만) 스타일. 노드 활성 채움과는 구분되는
    보조 강조 어휘라 배경 없이 kb-yellow 테두리만 쓴다. */
export function Chip({ children, mono = false }: ChipProps) {
  return <span className={`${styles.chip} ${mono ? 'mono' : ''}`}>{children}</span>
}
