import { useState } from 'react'
import { FilePlus, Copy, Download, Check } from 'lucide-react'
import { AccordionSection } from '../../components/AccordionSection'
import { buildComplaintDraft } from '../../lib/complaintDraft'
import type { Classified, Evidence, Procedure } from '../../lib/api'
import styles from './ComplaintDraftAccordion.module.css'

interface ComplaintDraftAccordionProps {
  text: string
  classified: Classified
  evidence: Evidence | null
  procedure: Procedure | null
}

/** "분쟁조정 신청서 만들기" — 상담 데이터(쟁점·유리 정황·준비 서류)로 신청서 문안
    초안을 조립해 화면에 보여준다. 복사·다운로드 모두 실제로 동작하고, 마지막 버튼은
    실제 존재하는 파인(FINE) 사이트로 새 탭 연결한다(가짜 접수 버튼 아님 — 접수
    자체는 파인에서 사용자가 직접 진행). */
export function ComplaintDraftAccordion({ text, classified, evidence, procedure }: ComplaintDraftAccordionProps) {
  const [copied, setCopied] = useState(false)
  const draft = buildComplaintDraft({ text, classified, evidence, procedure })

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // 클립보드 권한이 없는 환경이면 조용히 무시(다운로드로 대체 가능)
    }
  }

  function handleDownload() {
    const blob = new Blob([draft], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '분쟁조정_신청서_초안.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AccordionSection title="분쟁조정 신청서 만들기" icon={<FilePlus size={16} />}>
      <p className={styles.hint}>상담 내용으로 신청서 초안을 만들었어요. 제출 전 꼭 확인·보완해주세요.</p>

      <pre className={styles.draft}>{draft}</pre>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.utilButton} onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? '복사됨' : '복사하기'}
        </button>
        <button type="button" className={styles.utilButton} onClick={handleDownload}>
          <Download size={14} />
          다운로드
        </button>
      </div>

      <a href="https://fine.fss.or.kr" target="_blank" rel="noopener noreferrer" className={styles.submitLink}>
        작성한 내용으로 파인에서 접수하기
      </a>
      <p className={styles.submitNote}>금융감독원 공식 사이트로 이동합니다</p>
    </AccordionSection>
  )
}
