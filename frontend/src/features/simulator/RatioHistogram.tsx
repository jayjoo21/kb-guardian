import styles from './RatioHistogram.module.css'

interface RatioHistogramProps {
  values: number[]
  median: number
}

const BIN_SIZE = 10
const BIN_COUNT = 100 / BIN_SIZE

function binValues(values: number[]): number[] {
  const bins = new Array(BIN_COUNT).fill(0)
  for (const v of values) {
    const idx = Math.min(Math.floor(v / BIN_SIZE), BIN_COUNT - 1)
    bins[idx] += 1
  }
  return bins
}

/** 배상비율 실측 분포 히스토그램. 10%p 단위 막대, 중앙값이 속한 막대만 강조.
    개별 데이터는 표시 그대로 접근 가능하도록 시각 요소 옆에 sr-only 표로도 제공한다. */
export function RatioHistogram({ values, median }: RatioHistogramProps) {
  const bins = binValues(values)
  const maxCount = Math.max(...bins, 1)
  const medianBinIdx = Math.min(Math.floor(median / BIN_SIZE), BIN_COUNT - 1)

  return (
    <div className={styles.wrap}>
      <div className={styles.bars} role="img" aria-label={`배상비율 분포 히스토그램, 표본 ${values.length}건`}>
        {bins.map((count, idx) => {
          const rangeStart = idx * BIN_SIZE
          const rangeEnd = rangeStart + BIN_SIZE
          const isMedianBin = idx === medianBinIdx
          return (
            <div
              key={idx}
              className={`${styles.bar} ${isMedianBin ? styles.barMedian : ''}`}
              style={{ height: `${(count / maxCount) * 100}%`, animationDelay: `${idx * 30}ms` }}
              title={`${rangeStart}~${rangeEnd}%: ${count}건`}
            >
              {count > 0 && <span className={`${styles.count} mono`}>{count}</span>}
            </div>
          )
        })}
      </div>
      <div className={styles.axis}>
        <span className="mono">0%</span>
        <span className="mono">50%</span>
        <span className="mono">100%</span>
      </div>
      <table className={styles.srTable}>
        <caption>쟁점별 배상비율 구간 분포</caption>
        <thead>
          <tr>
            <th scope="col">구간</th>
            <th scope="col">건수</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((count, idx) => (
            <tr key={idx}>
              <td>{idx * BIN_SIZE}~{idx * BIN_SIZE + BIN_SIZE}%</td>
              <td>{count}건</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
