import { ExternalLink, Phone } from 'lucide-react'
import { groupLawArticles, precedentUrl } from '../../lib/lawLinks'
import type { LawArticleRef } from '../../lib/api'
import styles from './ExternalLinksCard.module.css'

interface ExternalLinksCardProps {
  lawArticles: LawArticleRef[]
  precedents: string[]
}

interface ActionLink {
  label: string
  href: string
  note: string
  external: boolean
}

// 전부 실제 존재를 확인한 공개 URL만 쓴다(가짜 링크·예약 버튼 없음).
const ACTION_LINKS: ActionLink[] = [
  {
    label: 'KB 금융소비자보호 고객센터',
    href: 'https://obank.kbstar.com/quics?page=osupp',
    note: 'KB국민은행 공식 페이지로 이동합니다',
    external: true,
  },
  {
    label: 'KB 전화민원상담 080-000-7900',
    href: 'tel:080-000-7900',
    note: '전화 연결됩니다',
    external: false,
  },
  {
    label: '금융감독원 파인(FINE) — 분쟁조정 신청',
    href: 'https://fine.fss.or.kr',
    note: '금융감독원 공식 사이트로 이동합니다',
    external: true,
  },
  {
    label: '금융감독원 민원·신고 접수',
    href: 'https://www.fss.or.kr/fss/main/sub1.do?menuNo=201093',
    note: '금융감독원 공식 사이트로 이동합니다',
    external: true,
  },
  {
    label: '금융감독원 금융소비자 콜센터 1332',
    href: 'tel:1332',
    note: '전화 연결됩니다 · 평일 09:00~18:00(주말·공휴일 휴무)',
    external: false,
  },
]

/** "실제 대응은 여기서" — result 하단 고정 섹션. 존재를 확인한 공식 URL만 새 탭으로
    연결한다(금감원 파인/민원접수/콜센터, 인용된 법조항·판례는 국가법령정보센터).
    가짜 예약 버튼이나 확인 못한 링크는 절대 만들지 않는다. */
export function ExternalLinksCard({ lawArticles, precedents }: ExternalLinksCardProps) {
  const lawGroups = groupLawArticles(lawArticles.map((l) => l.ref))
  const precedentLinks = precedents
    .map((ref) => ({ ref, url: precedentUrl(ref) }))
    .filter((p): p is { ref: string; url: string } => p.url !== null)
    .slice(0, 5)

  return (
    <section className={`${styles.card} card`} aria-label="실제 대응은 여기서">
      <h2 className={styles.title}>실제 대응은 여기서</h2>

      <ul className={styles.list}>
        {ACTION_LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              className={styles.actionLink}
            >
              <span className={styles.actionIcon} aria-hidden="true">
                {link.href.startsWith('tel:') ? <Phone size={15} /> : <ExternalLink size={15} />}
              </span>
              <span className={styles.actionText}>
                <span className={styles.actionLabel}>{link.label}</span>
                <span className={styles.actionNote}>{link.note}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      {(lawGroups.length > 0 || precedentLinks.length > 0) && (
        <div className={styles.refSection}>
          <p className={styles.refLabel}>인용된 근거 원문 (국가법령정보센터)</p>
          <div className={styles.refLinks}>
            {lawGroups.map((g) => (
              <a
                key={g.lawName}
                href={g.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.refChip}
              >
                {g.lawName}
                {g.articles.length > 0 ? ` (${g.articles.join(', ')})` : ''}
              </a>
            ))}
            {precedentLinks.map((p) => (
              <a key={p.ref} href={p.url} target="_blank" rel="noopener noreferrer" className={styles.refChip}>
                {p.ref}
              </a>
            ))}
          </div>
          <p className={styles.refFootnote}>국가법령정보센터 공식 사이트로 이동합니다</p>
        </div>
      )}
    </section>
  )
}
