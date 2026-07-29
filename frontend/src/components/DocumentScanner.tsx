import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { scanDocument, type DocumentScanResult } from '../lib/api'
import styles from './DocumentScanner.module.css'

type Status = 'idle' | 'loading' | 'done' | 'error'

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  상품설명서_교부: '상품설명서',
  투자자정보확인서_자필: '투자자정보확인서(자필)',
  투자자정보확인서_대필: '투자자정보확인서(대필)',
  자필서명: '자필서명 서류',
  대리서명: '대리서명 서류',
  계약서: '계약서',
  통장거래내역: '통장거래내역',
  문자_메신저: '문자·메신저 캡처',
  기타: '서류',
}

function findings(result: DocumentScanResult): string[] {
  const out: string[] = []
  const typeLabel = DOCUMENT_TYPE_LABEL[result.document_type]
  if (typeLabel) out.push(`문서 종류: ${typeLabel}`)
  if (result.has_signature !== null) {
    out.push(result.has_signature ? '자필 서명이 확인됐어요' : '자필 서명이 보이지 않아요')
  }
  if (result.investment_profile_marked !== null) {
    out.push(
      result.investment_profile_marked ? '투자성향 표기가 확인됐어요' : '투자성향 표기가 보이지 않아요',
    )
  }
  if (result.product_name) out.push(`상품명: ${result.product_name}`)
  return out
}

/** "관련 서류 사진 올리기" — 실제 Claude 비전 API로 서류를 판독한다(목업 아님).
    이미지에 없는 내용은 절대 지어내지 않고, 판독 불가면 그렇게 그대로 보여준다. */
export function DocumentScanner() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<DocumentScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    setStatus('loading')
    setResult(null)
    setError(null)
    try {
      const res = await scanDocument(file)
      setResult(res)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.trigger} onClick={() => inputRef.current?.click()}>
        <Camera size={16} strokeWidth={1.8} />
        관련 서류 사진 올리기
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className={styles.hiddenInput}
        onChange={handleFile}
      />

      {status === 'loading' && (
        <p className={styles.status}>
          <Loader2 size={14} className={styles.spin} />
          {fileName} 판독 중…
        </p>
      )}

      {status === 'error' && <p className={styles.statusError}>서류를 판독하지 못했습니다: {error}</p>}

      {status === 'done' && result && (
        <div className={styles.resultBox}>
          {result.readable ? (
            <>
              <p className={styles.resultTitle}>업로드하신 서류에서 이런 내용이 확인됐어요</p>
              {findings(result).length > 0 ? (
                <ul className={styles.findingList}>
                  {findings(result).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.resultNote}>구체적인 항목은 확인되지 않았어요.</p>
              )}
              {result.notes && <p className={styles.resultNote}>{result.notes}</p>}
            </>
          ) : (
            <p className={styles.resultNote}>
              업로드하신 서류를 판독하지 못했어요.{' '}
              {result.notes ?? '더 선명한 사진으로 다시 시도해주세요.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
