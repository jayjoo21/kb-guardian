import { useRef, useState } from 'react'
import { PenTool, Download, Loader2 } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { buildManualComplaintDraft } from '../lib/complaintDraft'
import { downloadElementAsPdf } from '../lib/pdf'
import styles from './ComplaintDraftFormScreen.module.css'

interface ComplaintDraftFormScreenProps {
  onBack: () => void
}

const INITIAL_FORM = {
  applicantName: '',
  applicantContact: '',
  respondentName: '',
  issueSummary: '',
  facts: '',
  desiredAmount: '',
}

/** 홈 "신청서 자동 작성" 전용 화면 — AI 상담 없이 사용자가 직접 입력한 값만으로
    분쟁조정 신청서 초안을 조립하고, PDF로 내려받을 수 있게 한다. */
export function ComplaintDraftFormScreen({ onBack }: ComplaintDraftFormScreenProps) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [draft, setDraft] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  function updateField(field: keyof typeof INITIAL_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleGenerate() {
    setDraft(buildManualComplaintDraft(form))
  }

  async function handleDownloadPdf() {
    if (!previewRef.current) return
    setDownloading(true)
    try {
      await downloadElementAsPdf(previewRef.current, '분쟁조정_신청서.pdf')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="신청서 자동 작성" onBack={onBack} />

      <div className={styles.content}>
        <section className={styles.introSection}>
          <div className={styles.introBadge}>
            <PenTool size={16} className={styles.introBadgeIcon} />
            <span className={styles.introBadgeText}>신청서 작성</span>
          </div>
          <h2 className={styles.introTitle}>분쟁조정 신청서 초안 만들기</h2>
          <p className={styles.introDesc}>
            아래 내용을 입력하면 금감원 분쟁조정 신청서 형식의 초안을 만들어 드려요.
            입력하지 않은 항목은 [ ]로 남으니, 제출 전 꼭 채워주세요.
          </p>
        </section>

        <section className={styles.formSection}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>신청인 성명</span>
            <input
              type="text"
              className={styles.input}
              value={form.applicantName}
              onChange={(e) => updateField('applicantName', e.target.value)}
              placeholder="홍길동"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>연락처</span>
            <input
              type="text"
              className={styles.input}
              value={form.applicantContact}
              onChange={(e) => updateField('applicantContact', e.target.value)}
              placeholder="010-0000-0000"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>피신청인 금융회사명</span>
            <input
              type="text"
              className={styles.input}
              value={form.respondentName}
              onChange={(e) => updateField('respondentName', e.target.value)}
              placeholder="OO은행"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>쟁점 요약</span>
            <input
              type="text"
              className={styles.input}
              value={form.issueSummary}
              onChange={(e) => updateField('issueSummary', e.target.value)}
              placeholder="설명의무 위반, 부당권유 등"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>사실관계</span>
            <textarea
              className={styles.textarea}
              rows={6}
              value={form.facts}
              onChange={(e) => updateField('facts', e.target.value)}
              placeholder="언제, 무엇을, 어떻게 겪으셨는지 최대한 구체적으로 적어주세요."
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>희망 배상 금액(선택)</span>
            <input
              type="text"
              className={styles.input}
              value={form.desiredAmount}
              onChange={(e) => updateField('desiredAmount', e.target.value)}
              placeholder="예: 5,000,000"
            />
          </label>

          <button type="button" className={styles.generateButton} onClick={handleGenerate} disabled={!form.facts.trim()}>
            초안 만들기
          </button>
        </section>

        {draft && (
          <section className={styles.previewSection}>
            <h3 className={styles.sectionTitle}>미리보기</h3>
            <div ref={previewRef} className={styles.previewSheet}>
              {draft.split('\n').map((line, i) => (
                <p key={i} className={styles.previewLine}>{line || ' '}</p>
              ))}
            </div>

            <button type="button" className={styles.downloadButton} onClick={handleDownloadPdf} disabled={downloading}>
              {downloading ? <Loader2 size={16} className={styles.spin} /> : <Download size={16} />}
              {downloading ? 'PDF 생성 중…' : 'PDF 다운로드'}
            </button>
          </section>
        )}
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          법률 자문이 아닌 참고 정보입니다. 제출 전 사실관계와 첨부 서류를 다시 확인하세요.
        </p>
      </footer>
    </div>
  )
}
