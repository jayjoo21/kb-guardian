import { Chip } from '../../components/Chip'
import styles from './AnswerPanelPlaceholder.module.css'

const MOCK_ISSUES = ['설명의무_위반', '우대금리_미적용']
const MOCK_PRODUCTS = ['예적금']

/** 3단계에서 실제 입력폼 + SSE 스트리밍으로 교체된다. 지금은 완성된 상태의
    타이포그래피·칩·근거 통계 배치를 목킹 데이터로 미리 보여준다. */
export function AnswerPanelPlaceholder() {
  return (
    <div className={styles.panel}>
      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder="민원 내용을 입력하세요 (예: 적금 중도해지 시 우대금리를 못 받았습니다)"
          disabled
        />
        <button type="button" className={styles.submit} disabled>
          상담하기
        </button>
      </div>

      <div className={styles.chips} aria-label="분류된 쟁점·상품 (목업)">
        {MOCK_ISSUES.map((issue) => (
          <Chip key={issue}>{issue}</Chip>
        ))}
        {MOCK_PRODUCTS.map((p) => (
          <Chip key={p}>{p}</Chip>
        ))}
      </div>

      <div className={styles.answer}>
        <p>
          가입 시 우대금리 조건에 대한 설명을 받지 못했다면, 금융소비자보호법 제19조에 따른
          설명의무 위반과 관련될 수 있습니다. 유사 분쟁조정 사례들을 참고하면 배상비율은
          사안별 사실관계에 따라 크게 달라집니다.
        </p>
        <p className={styles.mockNote}>* 3단계에서 실제 답변이 이 자리에 타이핑되듯 렌더됩니다</p>
      </div>

      <div className={styles.statBlock}>
        <span className={styles.statLabel}>배상비율 분포</span>
        <span className={`${styles.statValue} mono`}>
          <strong className={styles.statMedian}>40%</strong>
          <span className={styles.statRange}>10%–100% · n=42</span>
        </span>
      </div>
    </div>
  )
}
