import { useState, useEffect } from 'react'
import { ExternalLink, Route, ShieldAlert, Calendar, Clock } from 'lucide-react'
import { AccordionSection } from '../../../components/AccordionSection'
import { Checkbox } from '../../../components/Checkbox'
import { EvidencePatternsAccordion } from '../EvidencePatternsAccordion'
import { ComplaintDraftAccordion } from '../ComplaintDraftAccordion'
import { loadHistory, setCheckedDocument } from '../../../lib/history'
import type { Classified, Evidence, EvidencePattern, Procedure } from '../../../lib/api'
import type { ReactNode } from 'react'
import styles from './ResultPrepareTab.module.css'

const TIMELINE_STAGES = ['자료 정리', '은행 민원', '금감원 분쟁조정', '결과 확인']
const CURRENT_STAGE_INDEX = 0

// 기한 계산을 위한 헬퍼 함수
function calculateRemainingDays(targetDate: Date): number {
  const today = new Date()
  const diffTime = targetDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

// 실제 존재를 확인한 공식 URL만 쓴다(가짜 링크 없음).
const STAGE_LINKS = [
  {
    label: 'KB국민은행 민원접수',
    href: 'https://obank.kbstar.com/quics?page=C044215',
    note: 'KB국민은행 공식 페이지로 이동합니다',
  },
  {
    label: '금융감독원 분쟁조정 신청(파인)',
    href: 'https://fine.fss.or.kr',
    note: '금융감독원 공식 사이트로 이동합니다',
  },
]

interface ResultPrepareTabProps {
  procedure: Procedure | null
  evidencePatterns: EvidencePattern[]
  text: string
  classified: Classified
  evidence: Evidence | null
  historyEntryId: string | null
}

function PrepareSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={`${styles.section} card`}>
      <div className={styles.sectionHeader}>
        <span className={styles.iconBadge} aria-hidden="true">
          {icon}
        </span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {children}
    </section>
  )
}

export function ResultPrepareTab({
  procedure,
  evidencePatterns,
  text,
  classified,
  evidence,
  historyEntryId,
}: ResultPrepareTabProps) {
  const [checkedDocs, setCheckedDocs] = useState<string[]>(
    () => loadHistory().find((e) => e.id === historyEntryId)?.checkedDocuments ?? [],
  )
  
  // 기한 계산 상태
  const [contractDate, setContractDate] = useState<string>('')
  const [awarenessDate, setAwarenessDate] = useState<string>('')
  const [remainingDays, setRemainingDays] = useState<{
    oneYear: number | null
    fiveYears: number | null
    threeYears: number | null
  }>({
    oneYear: null,
    fiveYears: null,
    threeYears: null,
  })

  function handleDateChange() {
    if (awarenessDate) {
      const awareness = new Date(awarenessDate)
      const oneYearLater = new Date(awareness)
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
      const threeYearsLater = new Date(awareness)
      threeYearsLater.setFullYear(threeYearsLater.getFullYear() + 3)
      
      setRemainingDays({
        oneYear: calculateRemainingDays(oneYearLater),
        fiveYears: contractDate ? calculateRemainingDays(new Date(new Date(contractDate).setFullYear(new Date(contractDate).getFullYear() + 5))) : null,
        threeYears: calculateRemainingDays(threeYearsLater),
      })
    } else {
      setRemainingDays({ oneYear: null, fiveYears: null, threeYears: null })
    }
  }

  useEffect(() => {
    handleDateChange()
  }, [contractDate, awarenessDate])

  function toggleDocument(doc: string) {
    const next = !checkedDocs.includes(doc)
    setCheckedDocs((prev) => (next ? [...prev, doc] : prev.filter((d) => d !== doc)))
    if (historyEntryId) setCheckedDocument(historyEntryId, doc, next)
  }

  if (!procedure && evidencePatterns.length === 0) {
    return (
      <div className={styles.panel} role="tabpanel">
        <p className={styles.empty}>준비 안내를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.panel} role="tabpanel">
      {procedure && (procedure.steps.length > 0 || procedure.documents.length > 0) && (
        <PrepareSection title="진행 단계" icon={<Route size={16} />}>
          <ol className={styles.timeline}>
            {TIMELINE_STAGES.map((stage, i) => {
              const state =
                i < CURRENT_STAGE_INDEX ? 'past' : i === CURRENT_STAGE_INDEX ? 'current' : 'future'
              return (
                <li key={stage} className={`${styles.timelineStep} ${styles[state]}`}>
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.timelineLabel}>{stage}</span>
                </li>
              )
            })}
          </ol>

          <div className={styles.stageLinks}>
            {STAGE_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.stageLink}
              >
                <ExternalLink size={13} aria-hidden="true" />
                <span>
                  <span className={styles.stageLinkLabel}>{link.label}</span>
                  <span className={styles.stageLinkNote}>{link.note}</span>
                </span>
              </a>
            ))}
          </div>

          {procedure.steps.length > 0 && (
            <AccordionSection title="세부 절차" defaultOpen={false}>
              <ul className={styles.steps}>
                {procedure.steps.map((step, i) => (
                  <li key={i} className={styles.step}>
                    {step}
                  </li>
                ))}
              </ul>
            </AccordionSection>
          )}

          {procedure.documents.length > 0 && (
            <div className={styles.documents}>
              <p className={styles.documentsLabel}>제출 서류 체크리스트</p>
              <ul className={styles.docList}>
                {procedure.documents.map((doc, i) => (
                  <li key={i}>
                    <Checkbox checked={checkedDocs.includes(doc)} onChange={() => toggleDocument(doc)}>
                      <span className={checkedDocs.includes(doc) ? styles.docChecked : undefined}>{doc}</span>
                    </Checkbox>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PrepareSection>
      )}

      {/* 기한 안내 카드 */}
      <PrepareSection title="법적 기한 안내" icon={<Clock size={16} />}>
        <div className={styles.deadlineCalculator}>
          <p className={styles.deadlineNotice}>
            ※ 법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
          </p>
          
          <div className={styles.dateInputSection}>
            <div className={styles.dateInputGroup}>
              <label className={styles.dateLabel}>
                <Calendar size={14} className={styles.dateIcon} />
                위반 사실을 안 날
              </label>
              <input
                type="date"
                className={styles.dateInput}
                value={awarenessDate}
                onChange={(e) => setAwarenessDate(e.target.value)}
              />
            </div>
            
            <div className={styles.dateInputGroup}>
              <label className={styles.dateLabel}>
                <Calendar size={14} className={styles.dateIcon} />
                계약 체결일 (선택)
              </label>
              <input
                type="date"
                className={styles.dateInput}
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
              />
            </div>
          </div>

          {awarenessDate && (
            <div className={styles.deadlineResults}>
              <div className={styles.deadlineItem}>
                <span className={styles.deadlineTitle}>위법계약해지권 (1년)</span>
                <span className={styles.deadlineValue}>
                  {remainingDays.oneYear !== null && remainingDays.oneYear > 0 
                    ? `${remainingDays.oneYear}일 남음` 
                    : remainingDays.oneYear !== null && remainingDays.oneYear <= 0 
                    ? '기간 만료' 
                    : '날짜를 입력해주세요'}
                </span>
              </div>
              
              {contractDate && remainingDays.fiveYears !== null && (
                <div className={styles.deadlineItem}>
                  <span className={styles.deadlineTitle}>위법계약해지권 (5년)</span>
                  <span className={styles.deadlineValue}>
                    {remainingDays.fiveYears > 0 
                      ? `${remainingDays.fiveYears}일 남음` 
                      : '기간 만료'}
                  </span>
                </div>
              )}
              
              <div className={styles.deadlineItem}>
                <span className={styles.deadlineTitle}>손해배상청구권 (3년)</span>
                <span className={styles.deadlineValue}>
                  {remainingDays.threeYears !== null && remainingDays.threeYears > 0 
                    ? `${remainingDays.threeYears}일 남음` 
                    : remainingDays.threeYears !== null && remainingDays.threeYears <= 0 
                    ? '기간 만료' 
                    : '날짜를 입력해주세요'}
                </span>
              </div>
            </div>
          )}

          {!awarenessDate && (
            <p className={styles.dateHint}>
              위반 사실을 안 날을 입력하면 남은 기간을 계산해 드려요.
            </p>
          )}
        </div>
      </PrepareSection>

      <PrepareSection title="위법계약해지권 안내" icon={<ShieldAlert size={16} />}>
        <p className={styles.legalNotice}>
          금융소비자보호법 제47조에 따라, 금융회사가 설명의무 등 주요 의무를 위반한 사실을 <strong>안
          날부터 1년</strong>, <strong>계약체결일부터 5년</strong> 이내에는 계약을 해지할 수 있어요(위법계약해지권).
        </p>
        <p className={styles.legalNotice}>
          다만 펀드·ELS 등 투자성 상품은 계약 해지가 아니라 별도의 <strong>청약철회</strong> 제도가 적용되고,
          그 행사 기간이 더 짧게 제한되어 있으니 유의하세요.
        </p>
      </PrepareSection>

      {evidencePatterns.length > 0 && <EvidencePatternsAccordion items={evidencePatterns} />}

      <ComplaintDraftAccordion text={text} classified={classified} evidence={evidence} procedure={procedure} />
    </div>
  )
}
