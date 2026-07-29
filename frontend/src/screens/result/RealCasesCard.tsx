import { useState } from 'react'
import { Gavel, ChevronRight } from 'lucide-react'
import { AccordionSection } from '../../components/AccordionSection'
import { fetchCaseDetail, type SimilarCase, type CaseDetail } from '../../lib/api'
import styles from './RealCasesCard.module.css'

interface RealCasesCardProps {
  cases: SimilarCase[]
}

/** "실제 결정례" 아코디언 — 이 상담의 유사 사례 근거로 실제 쓰인 사건들을 카드로.
    지어내지 않고 그래프 실제값(similar_cases)만 쓴다. 펼치면 /api/case/{id}를
    조회해 결정문 요약(summary/recommendation)을 보여준다(있는 경우만). */
export function RealCasesCard({ cases }: RealCasesCardProps) {
  if (cases.length === 0) return null

  return (
    <AccordionSection id="real-cases" title="실제 결정례" icon={<Gavel size={16} />} badge={cases.length}>
      <ul className={styles.list}>
        {cases.map((c) => (
          <RealCaseRow key={c.case_id} caseItem={c} />
        ))}
      </ul>
    </AccordionSection>
  )
}

function RealCaseRow({ caseItem }: { caseItem: SimilarCase }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(false)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !detail) {
      setLoading(true)
      fetchCaseDetail(caseItem.case_id)
        .then(setDetail)
        .catch(() => {
          // 원문 요약 조회 실패해도 카드 자체(사건번호/제목/결과)는 이미 보여주고 있으므로 조용히 무시
        })
        .finally(() => setLoading(false))
    }
  }

  const hasRatio = caseItem.ratio !== null
  const caseRef = caseItem.case_no ? `금감원 분쟁조정 ${caseItem.case_no}` : `사건 ${caseItem.case_id}`

  return (
    <li className={styles.row}>
      <button type="button" className={styles.rowHeader} onClick={toggle} aria-expanded={open}>
        <div className={styles.rowMain}>
          <span className={styles.caseNo}>{caseRef}</span>
          <span className={styles.caseTitle}>{caseItem.title}</span>
          {(caseItem.result || hasRatio) && (
            <span className={styles.caseResult}>
              {caseItem.result}
              {caseItem.result && hasRatio ? ' · ' : ''}
              {hasRatio ? `배상비율 ${caseItem.ratio}%` : ''}
            </span>
          )}
        </div>
        <ChevronRight className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.body}>
          {loading && <p className={styles.loading}>불러오는 중…</p>}
          {!loading && detail?.summary && <p className={styles.text}>{detail.summary}</p>}
          {!loading && detail?.recommendation && <p className={styles.text}>{detail.recommendation}</p>}
          {!loading && !detail?.summary && !detail?.recommendation && (
            <p className={styles.empty}>이 사건의 원문 요약 정보가 없습니다.</p>
          )}
        </div>
      )}
    </li>
  )
}
