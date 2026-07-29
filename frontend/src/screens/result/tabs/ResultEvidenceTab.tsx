import { useMemo, useState } from 'react'
import { ChevronRight, ExternalLink, Gavel } from 'lucide-react'
import { fetchCaseDetail, type ArgumentSample, type Evidence, type SimilarCase, type CaseDetail } from '../../../lib/api'
import { groupLawArticles, lawArticleUrl, lawNameFromRef } from '../../../lib/lawLinks'
import styles from './ResultEvidenceTab.module.css'

const FSS_DISPUTE_LIST_URL = 'https://www.fss.or.kr/fss/bbs/B0000390/list.do?menuNo=201193'

interface ResultEvidenceTabProps {
  cases: SimilarCase[]
  evidence: Evidence | null
}

function findQuoteForCase(samples: ArgumentSample[], caseId: string): string | null {
  for (const group of samples) {
    for (const s of group) {
      if (s.case_id === caseId && s.quote) return s.quote
    }
  }
  return null
}

export function ResultEvidenceTab({ cases, evidence }: ResultEvidenceTabProps) {
  const quoteByCase = useMemo(() => {
    const map = new Map<string, string>()
    if (!evidence) return map
    for (const group of evidence.respondent_arguments) {
      for (const sample of group.samples) {
        if (sample.quote && !map.has(sample.case_id)) {
          map.set(sample.case_id, sample.quote)
        }
      }
    }
    return map
  }, [evidence])

  if (cases.length === 0) {
    return (
      <div className={styles.panel} role="tabpanel">
        <p className={styles.empty}>이번 상담에서 조회된 유사 결정례가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.panel} role="tabpanel">
      <div className={styles.header}>
        <span className={styles.iconBadge} aria-hidden="true">
          <Gavel size={16} />
        </span>
        <h2 className={styles.title}>실제 결정례 {cases.length}건</h2>
      </div>

      <ul className={styles.list}>
        {cases.map((c) => (
          <EvidenceCaseRow key={c.case_id} caseItem={c} fallbackQuote={quoteByCase.get(c.case_id) ?? null} />
        ))}
      </ul>
    </div>
  )
}

function EvidenceCaseRow({ caseItem, fallbackQuote }: { caseItem: SimilarCase; fallbackQuote: string | null }) {
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
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }

  const caseRef = caseItem.case_no ? `금감원 분쟁조정 ${caseItem.case_no}` : `사건 ${caseItem.case_id}`
  const hasRatio = caseItem.ratio !== null
  const quote = fallbackQuote ?? detail?.recommendation ?? detail?.summary ?? null
  const lawRefs = detail?.law_articles ?? []
  const lawGroups = groupLawArticles(lawRefs)

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

          {!loading && detail && detail.issues.length > 0 && (
            <div className={styles.metaBlock}>
              <span className={styles.metaLabel}>쟁점</span>
              <ul className={styles.issueList}>
                {detail.issues.map((issue) => (
                  <li key={issue.name}>
                    {issue.name.replace(/_/g, ' ')}
                    {issue.result ? ` · ${issue.result}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!loading && (caseItem.result || hasRatio) && (
            <div className={styles.metaBlock}>
              <span className={styles.metaLabel}>결과</span>
              <p className={styles.metaText}>
                {caseItem.result}
                {caseItem.result && hasRatio ? ' · ' : ''}
                {hasRatio ? `배상비율 ${caseItem.ratio}%` : ''}
              </p>
            </div>
          )}

          {!loading && quote && (
            <div className={styles.metaBlock}>
              <span className={styles.metaLabel}>핵심 인용</span>
              <p className={styles.quote}>“{quote}”</p>
            </div>
          )}

          {!loading && !quote && !detail?.summary && (
            <p className={styles.emptyDetail}>이 사건의 원문 인용 정보가 없습니다.</p>
          )}

          {!loading && (
            <div className={styles.links}>
              <a
                href={FSS_DISPUTE_LIST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                <ExternalLink size={14} aria-hidden="true" />
                금감원 분쟁조정결정례 공개 게시판
              </a>
              {lawGroups.map((g) => (
                <a
                  key={g.lawName}
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  {g.lawName}
                  {g.articles.length > 0 ? ` (${g.articles.join(', ')})` : ''}
                </a>
              ))}
              {lawRefs
                .filter((ref) => !groupLawArticles([ref]).some((g) => g.lawName === lawNameFromRef(ref)))
                .map((ref) => (
                  <a
                    key={ref}
                    href={lawArticleUrl(lawNameFromRef(ref))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    {ref}
                  </a>
                ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
