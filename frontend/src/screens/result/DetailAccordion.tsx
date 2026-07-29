import { FileText } from 'lucide-react'
import { AccordionSection } from '../../components/AccordionSection'
import styles from './DetailAccordion.module.css'

interface DetailAccordionProps {
  /** 3겹 답변 중 ①상황요약을 제외한 나머지 문단들(②왜 문제인가, ③무엇을 할 수 있는가) */
  paragraphs: string[]
}

export function DetailAccordion({ paragraphs }: DetailAccordionProps) {
  if (paragraphs.length === 0) return null

  return (
    <AccordionSection title="자세한 설명" icon={<FileText size={16} />}>
      <div className={styles.body}>
        {paragraphs.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
    </AccordionSection>
  )
}
