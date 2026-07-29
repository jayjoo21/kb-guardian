import { useState } from 'react'
import { Scale } from 'lucide-react'
import { basisConsumerTitle, basisPrepHint } from '../../../lib/basisLabels'
import { groupLawArticles } from '../../../lib/lawLinks'
import type { LawArticleRef, RespondentArgumentGroup } from '../../../lib/api'
import styles from './ResultAnalysisTab.module.css'

const WEAK_THRESHOLD = 0.5
const INITIAL_VISIBLE = 3
// KB국민은행 공식 페이지에서 실제 존재를 확인한 URL(금소법 6대 판매원칙 안내).
const KB_LAW_GUIDE_URL = 'https://obank.kbstar.com/quics?page=C103664'

interface ResultAnalysisTabProps {
  items: RespondentArgumentGroup[]
  /** 이번에 분류된 쟁점의 근거 법조항(그래프 GOVERNED_BY 관계 기반) — 헤더 아래 인용 칩으로 표시. */
  lawArticles: LawArticleRef[]
}

export function ResultAnalysisTab({ items, lawArticles }: ResultAnalysisTabProps) {
  const [showAll, setShowAll] = useState(false)
  const lawGroups = groupLawArticles(lawArticles.map((l) => l.ref))

  const mapped = items
    .map((item) => ({ item, title: basisConsumerTitle(item.basis) }))
    .filter((x): x is { item: RespondentArgumentGroup; title: string } => x.title !== null)
    .sort((a, b) => a.item.rejected_rate - b.item.rejected_rate)

  if (mapped.length === 0) {
    return (
      <div className={styles.panel} role="tabpanel">
        <p className={styles.empty}>이번 상담에서 확인된 은행 반박 유형이 없습니다.</p>
      </div>
    )
  }

  const visible = showAll ? mapped : mapped.slice(0, INITIAL_VISIBLE)
  const hiddenCount = mapped.length - INITIAL_VISIBLE

  return (
    <div className={styles.panel} role="tabpanel">
      <div className={styles.header}>
        <span className={styles.iconBadge} aria-hidden="true">
          <Scale size={16} />
        </span>
        <h2 className={styles.title}>은행 반박 ↔ 내 대응</h2>
      </div>

      {lawGroups.length > 0 && (
        <div className={styles.lawRow} aria-label="관련 법조항">
          {lawGroups.map((g) => (
            <a
              key={g.lawName}
              href={g.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.lawChip}
              title="국가법령정보센터 공식 사이트로 이동합니다"
            >
              {g.lawName}
              {g.articles.length > 0 ? ` ${g.articles.join(', ')}` : ''}
            </a>
          ))}
          <a
            href={KB_LAW_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.lawChip}
            title="KB국민은행 공식 페이지로 이동합니다"
          >
            금융소비자보호법 판매원칙 안내(KB 공식)
          </a>
        </div>
      )}
      {lawGroups.length > 0 && (
        <p className={styles.lawNote}>탭하면 국가법령정보센터·KB국민은행 공식 페이지로 이동합니다</p>
      )}

      <ul className={styles.list}>
        {visible.map(({ item, title }) => {
          const isWeak = item.rejected_rate < WEAK_THRESHOLD
          const sample = item.samples[0]

          return (
            <li key={item.basis} className={`${styles.card} ${isWeak ? styles.cardWeak : ''}`}>
              {isWeak && (
                <span className={styles.warning}>
                  이 주장은 실제로 받아들여진 경우가 많아요 — 대비가 필요해요
                </span>
              )}

              <div className={styles.side}>
                <span className={styles.sideLabel}>은행 주장</span>
                <p className={styles.sideText}>{title}</p>
              </div>

              {sample?.quote && (
                <div className={styles.side}>
                  <span className={styles.sideLabel}>위원회 판단</span>
                  <p className={styles.sideText}>
                    “{sample.quote}”
                    <span className={styles.caseNo}>
                      {' '}
                      · {sample.case_no ? `금감원 분쟁조정 ${sample.case_no}` : `사건 ${sample.case_id}`}
                    </span>
                  </p>
                </div>
              )}

              <div className={styles.side}>
                <span className={styles.sideLabel}>나의 준비</span>
                <p className={styles.sideText}>{basisPrepHint(item.basis)}</p>
              </div>

              <p className={styles.stat}>
                비슷한 사례 {item.count}건 중 {item.rejected_count}건
                {isWeak ? '에서만' : '에서'} 위원회가 이 주장을 받아들이지 않았어요
              </p>
            </li>
          )
        })}
      </ul>

      {!showAll && hiddenCount > 0 && (
        <button type="button" className={styles.moreButton} onClick={() => setShowAll(true)}>
          더 보기({hiddenCount}개)
        </button>
      )}
    </div>
  )
}
