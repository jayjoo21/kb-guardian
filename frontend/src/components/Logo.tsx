import styles from './Logo.module.css'

interface LogoProps {
  /** 최초 1회 점화 애니메이션(로딩 화면 전용) */
  ignite?: boolean
  size?: number
}

// frontend/public/에 있는 실제 로고 파일. webp를 우선 쓰고, 브라우저가 webp를
// 지원하지 않으면 <picture>가 자동으로 png로 대체한다(별도 JS 분기 불필요).
const LOGO_WEBP = '/KB_logo.svg.webp'
const LOGO_PNG = '/kb_logo.png'

/** 브랜드 마크. 실제 로고 이미지(webp, png 폴백)를 쓴다. */
export function LogoMark({ ignite = false, size = 20 }: LogoProps) {
  return (
    <picture>
      <source srcSet={LOGO_WEBP} type="image/webp" />
      <img
        src={LOGO_PNG}
        alt=""
        aria-hidden="true"
        className={ignite ? styles.ignite : undefined}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    </picture>
  )
}
