import { Scale } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { DocumentScanner } from '../components/DocumentScanner'
import styles from './EvidenceEvaluationScreen.module.css'

interface EvidenceEvaluationScreenProps {
  onBack: () => void
}

/** 홈 "증거 자료 평가" 전용 화면 — 사용자가 보유한 증거(계약서·통장거래내역·문자
    캡처 등) 이미지/PDF를 올리면 실제 Claude Vision으로 판독해 보여준다(목업 아님,
    ConsultInputScreen 툴바에서 쓰는 DocumentScanner와 동일한 컴포넌트 재사용). */
export function EvidenceEvaluationScreen({ onBack }: EvidenceEvaluationScreenProps) {
  return (
    <div className={styles.screen}>
      <TopAppBar title="증거 자료 평가" onBack={onBack} />

      <div className={styles.content}>
        <section className={styles.introSection}>
          <div className={styles.introBadge}>
            <Scale size={16} className={styles.introBadgeIcon} />
            <span className={styles.introBadgeText}>증거 평가</span>
          </div>
          <h2 className={styles.introTitle}>증거 자료를 올려주세요</h2>
          <p className={styles.introDesc}>
            계약서·통장거래내역·문자 캡처 등 보유한 자료 사진이나 PDF를 올리면, 어떤
            서류인지·서명이 있는지·투자성향 표기가 있는지를 확인해 드려요.
          </p>
        </section>

        <section className={styles.uploadSection}>
          <DocumentScanner />
        </section>

        <p className={styles.hint}>
          이미지에 실제로 보이는 내용만 보고해 드리고, 판독이 어려우면 그렇게 정확히
          안내해 드려요. 서명의 진위 여부까지는 판단하지 않습니다.
        </p>
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          법률 자문이 아닌 참고 정보입니다. 실제 분쟁 대응은 전문가와 상담하세요.
        </p>
      </footer>
    </div>
  )
}
