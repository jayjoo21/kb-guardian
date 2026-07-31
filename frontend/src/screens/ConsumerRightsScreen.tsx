import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Scale, FileText, Clock, CheckCircle, AlertCircle, X } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { fetchConsumerRights, type ConsumerRight } from '../lib/api'
import styles from './ConsumerRightsScreen.module.css'

interface ConsumerRightsScreenProps {
  onBack?: () => void
}

export function ConsumerRightsScreen({ onBack }: ConsumerRightsScreenProps) {
  const [rights, setRights] = useState<ConsumerRight[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConsumerRights()
      .then((data) => {
        setRights(data.rights)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [])

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <TopAppBar title="내 권리" onBack={onBack} />
      
      <header className={styles.header}>
        <Scale className={styles.headerIcon} size={28} />
        <div>
          <h1 className={styles.title}>내 권리</h1>
          <p className={styles.subtitle}>금융소비자보호법으로 보장되는 권리</p>
        </div>
      </header>

      <div className={styles.rightsList}>
        {rights.map((right) => {
          const isExpanded = expandedId === right.id
          return (
            <div key={right.id} className={styles.rightCard}>
              <button
                type="button"
                className={styles.rightHeader}
                onClick={() => toggleExpand(right.id)}
                aria-expanded={isExpanded}
              >
                <div className={styles.rightHeaderContent}>
                  <div className={styles.rightIcon}>
                    <FileText size={20} />
                  </div>
                  <div className={styles.rightTitleGroup}>
                    <h3 className={styles.rightTitle}>{right.title}</h3>
                    <p className={styles.rightDescription}>{right.description}</p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {isExpanded && (
                <div className={styles.rightDetails}>
                  <div className={styles.detailSection}>
                    <div className={styles.detailHeader}>
                      <Clock size={16} className={styles.detailIcon} />
                      <h4 className={styles.detailTitle}>언제 쓰는지</h4>
                    </div>
                    <p className={styles.detailText}>{right.when_to_use}</p>
                  </div>

                  <div className={styles.detailSection}>
                    <div className={styles.detailHeader}>
                      <CheckCircle size={16} className={styles.detailIcon} />
                      <h4 className={styles.detailTitle}>어떻게 행사하는지</h4>
                    </div>
                    <p className={styles.detailText}>{right.how_to_exercise}</p>
                  </div>

                  <div className={styles.lawSection}>
                    <div className={styles.lawHeader}>
                      <AlertCircle size={16} className={styles.lawIcon} />
                      <h4 className={styles.lawTitle}>법적 근거</h4>
                    </div>
                    <p className={styles.lawRef}>{right.law_article_ref}</p>
                    {right.law_article_detail && (
                      <div className={styles.lawContent}>
                        <p className={styles.lawArticle}>{right.law_article_detail.article}</p>
                        <p className={styles.lawText}>{right.law_article_detail.content}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <footer className={styles.legalNotice}>
        <p className={styles.legalText}>
          법률 자문이 아닌 참고 정보입니다. 실제 법적 절차는 전문가와 상담하세요.
        </p>
      </footer>
    </div>
  )
}
