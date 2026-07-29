import { useEffect, useState } from 'react'
import { fetchSimulate, type SimulateResponse } from '../../lib/api'
import { RatioHistogram } from '../../features/simulator/RatioHistogram'
import { CountUp } from '../../components/CountUp'
import styles from './KeyFindingsCard.module.css'

interface KeyFindingsCardProps {
  issue: string | null
  /** 확인된 쟁점 개수 — 집계 문장("쟁점 N개가 확인됐고...")용 */
  issueCount: number
}

/** 1스크롤 요약의 핵심 카드. 통계 용어(중앙값/IQR/n)는 절대 노출하지 않고 자연수
    문장으로만 표현한다. 예측 점수·확률 게이지는 만들지 않는다 — 실측 분포와 집계
    건수만 보여준다. 데이터가 없으면 카드 자체를 숨긴다. */
export function KeyFindingsCard({ issue, issueCount }: KeyFindingsCardProps) {
  const [sim, setSim] = useState<SimulateResponse | null>(null)

  useEffect(() => {
    if (!issue) return
    const controller = new AbortController()
    setSim(null)
    fetchSimulate(issue, controller.signal)
      .then(setSim)
      .catch(() => {
        // 데이터 없으면 카드가 그냥 안 뜨는 것과 동일하게 처리
      })
    return () => controller.abort()
  }, [issue])

  const d = sim?.distribution
  if (!d || d.n === 0 || d.median === null) return null

  return (
    <section className={`${styles.card} card`} aria-label="비슷한 사례에서는">
      <p className={styles.headline}>
        비슷한 사례에서 보통{' '}
        <span className={`${styles.numberChip} mono`}>
          <CountUp value={d.median} />%
        </span>{' '}
        정도를 돌려받았어요
      </p>
      <RatioHistogram values={d.values} median={d.median} />
      <p className={styles.aggregate}>
        입력하신 상황에서 쟁점 {issueCount}개가 확인됐고, 관련 실제 사례가{' '}
        <CountUp value={d.n} className="mono" />건 있어요
      </p>
    </section>
  )
}
