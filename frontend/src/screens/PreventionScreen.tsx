import { useState, useEffect } from 'react'
import { TopAppBar } from '../app/TopAppBar'
import { AlertTriangle, CheckCircle, FileText, Upload, ChevronRight, AlertCircle } from 'lucide-react'
import { fetchProductStats, fetchProductDetail, analyzeRiskSignal, type ProductStat, type ProductDetail, type RiskSignalAnalysis } from '../lib/api'
import { DocumentScanner } from '../components/DocumentScanner'
import styles from './PreventionScreen.module.css'

interface PreventionScreenProps {
  onBack: () => void
}

const CHECKLIST_ITEMS = [
  {
    id: 'explanation_written',
    question: '설명 내용을 서면이나 녹취로 남기셨나요?',
    description: '분쟁 시 중요한 증거가 됩니다'
  },
  {
    id: 'risk_understood',
    question: '상품의 위험성을 충분히 이해하셨나요?',
    description: '원금 보장 여부, 손실 가능성 등'
  },
  {
    id: 'suitability_checked',
    question: '제 투자성향에 맞는 상품인지 확인하셨나요?',
    description: '고위험 상품의 경우 적합성 확인 필요'
  },
  {
    id: 'terms_reviewed',
    question: '약관 및 상품설명서를 충분히 검토하셨나요?',
    description: '중요 조건 및 비용 확인'
  },
  {
    id: 'cooling_period',
    question: '청약철회 기간을 확인하셨나요?',
    description: '보통 15일, 투자성 상품은 다를 수 있음'
  },
]

export function PreventionScreen({ onBack }: PreventionScreenProps) {
  const [products, setProducts] = useState<ProductStat[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  const [riskAnalysis, setRiskAnalysis] = useState<RiskSignalAnalysis | null>(null)
  const [analyzingDocument, setAnalyzingDocument] = useState(false)

  useEffect(() => {
    fetchProductStats()
      .then((data) => {
        setProducts(data.products)
        setLoading(false)
      })
      .catch((err) => {
        console.error('상품 통계 조회 실패:', err)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (selectedProduct) {
      fetchProductDetail(selectedProduct)
        .then((data) => {
          setProductDetail(data.detail)
        })
        .catch((err) => {
          console.error('상품 상세 조회 실패:', err)
        })
    } else {
      setProductDetail(null)
    }
  }, [selectedProduct])

  function toggleCheckItem(id: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleDocumentUpload(file: File) {
    setAnalyzingDocument(true)
    try {
      const result = await analyzeRiskSignal(file)
      setRiskAnalysis(result.analysis)
    } catch (err) {
      console.error('위험 신호 분석 실패:', err)
    } finally {
      setAnalyzingDocument(false)
    }
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="예방 진단" onBack={onBack} />
      
      <div className={styles.content}>
        <section className={styles.introSection}>
          <div className={styles.introBadge}>
            <AlertTriangle size={16} className={styles.introBadgeIcon} />
            <span className={styles.introBadgeText}>예방</span>
          </div>
          <h2 className={styles.introTitle}>가입 전 확인하기</h2>
          <p className={styles.introDesc}>
            과거 분쟁 사례를 바탕으로 가입 전 확인해야 할 핵심 사항을 안내해 드려요.
          </p>
        </section>

        <section className={styles.productSection}>
          <h3 className={styles.sectionTitle}>상품 유형 선택</h3>
          {loading ? (
            <p className={styles.loading}>로딩 중...</p>
          ) : (
            <div className={styles.productGrid}>
              {products.map((product) => (
                <button
                  key={product.product}
                  type="button"
                  className={`${styles.productCard} ${selectedProduct === product.product ? styles.selected : ''}`}
                  onClick={() => setSelectedProduct(product.product)}
                >
                  <div className={styles.productHeader}>
                    <span className={styles.productName}>{product.product}</span>
                    <span className={styles.productCount}>{product.case_count}건</span>
                  </div>
                  <div className={styles.productStats}>
                    <span className={styles.productStat}>
                      평균 배상: {product.ratio_stats.median ? `${product.ratio_stats.median.toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {productDetail && (
          <section className={styles.detailSection}>
            <h3 className={styles.sectionTitle}>{productDetail.product} 분쟁 통계</h3>
            
            <div className={styles.statCard}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>총 분쟁 사례</span>
                <span className={styles.statValue}>{productDetail.case_count}건</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>평균 배상비율</span>
                <span className={styles.statValue}>
                  {productDetail.avg_ratio ? `${productDetail.avg_ratio.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            </div>

            {productDetail.issues.length > 0 && (
              <div className={styles.issuesCard}>
                <h4 className={styles.issuesTitle}>자주 발생하는 쟁점</h4>
                <div className={styles.issuesList}>
                  {productDetail.issues.map((issue) => (
                    <span key={issue} className={styles.issueTag}>{issue}</span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.checklistSection}>
              <h3 className={styles.sectionTitle}>가입 전 확인 체크리스트</h3>
              <div className={styles.checklist}>
                {CHECKLIST_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.checklistItem} ${checkedItems.has(item.id) ? styles.checked : ''}`}
                    onClick={() => toggleCheckItem(item.id)}
                  >
                    <span className={styles.checklistIcon}>
                      {checkedItems.has(item.id) ? <CheckCircle size={20} /> : <div className={styles.emptyCheck} />}
                    </span>
                    <div className={styles.checklistContent}>
                      <span className={styles.checklistQuestion}>{item.question}</span>
                      <span className={styles.checklistDescription}>{item.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.documentSection}>
              <h3 className={styles.sectionTitle}>약관 위험 신호 진단</h3>
              <p className={styles.documentHint}>
                약관이나 상품설명서를 업로드하면 위험 신호 문구를 추출해 쉬운 말로 설명해 드려요.
              </p>
              
              <div className={styles.uploadArea}>
                <input
                  type="file"
                  id="risk-document"
                  accept="image/*,.pdf"
                  className={styles.fileInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleDocumentUpload(file)
                  }}
                />
                <label htmlFor="risk-document" className={styles.uploadButton}>
                  <Upload size={20} className={styles.uploadIcon} />
                  <span>문서 업로드</span>
                </label>
              </div>

              {analyzingDocument && (
                <div className={styles.analyzing}>
                  <div className={styles.analyzingSpinner} />
                  <span className={styles.analyzingText}>문서 분석 중...</span>
                </div>
              )}

              {riskAnalysis && (
                <div className={styles.riskAnalysisResult}>
                  <div className={styles.riskSummary}>
                    <AlertCircle size={16} className={styles.riskSummaryIcon} />
                    <span className={styles.riskSummaryText}>{riskAnalysis.analysis_summary}</span>
                  </div>

                  {riskAnalysis.signals.length > 0 ? (
                    <div className={styles.signalList}>
                      {riskAnalysis.signals.map((signal, index) => (
                        <div key={index} className={styles.signalCard}>
                          <div className={styles.signalHeader}>
                            <span className={styles.signalType}>{signal.type}</span>
                          </div>
                          <div className={styles.signalOriginal}>
                            <span className={styles.signalOriginalLabel}>원문:</span>
                            <span className={styles.signalOriginalText}>{signal.original_text}</span>
                          </div>
                          <div className={styles.signalExplanation}>
                            <span className={styles.signalExplanationLabel}>설명:</span>
                            <span className={styles.signalExplanationText}>{signal.explanation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.noSignals}>
                      <FileText size={24} className={styles.noSignalsIcon} />
                      <p className={styles.noSignalsText}>
                        이 문서에서는 위험 신호가 확인되지 않았습니다.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {!selectedProduct && (
          <section className={styles.hintSection}>
            <div className={styles.hintCard}>
              <FileText size={24} className={styles.hintIcon} />
              <h4 className={styles.hintTitle}>상품을 선택해주세요</h4>
              <p className={styles.hintDesc}>
                상품 유형을 선택하면 해당 상품에서 실제 발생한 분쟁 통계를 확인할 수 있어요.
              </p>
            </div>
          </section>
        )}
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          ※ 법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
          개별 상품의 위험도·수익률·시세 예측은 제공하지 않습니다.
        </p>
      </footer>
    </div>
  )
}
