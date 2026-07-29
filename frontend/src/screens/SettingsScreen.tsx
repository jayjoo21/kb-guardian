import { useState, type ReactNode } from 'react'
import { Type, Volume2 } from 'lucide-react'
import { TopAppBar } from '../app/TopAppBar'
import { NotificationPreview } from './myconsult/NotificationPreview'
import { loadLargeText, loadVoiceGuide, setLargeText, setVoiceGuide } from '../lib/settings'
import { isSpeechSupported } from '../lib/tts'
import styles from './SettingsScreen.module.css'

interface SettingsScreenProps {
  onBack: () => void
  onLogout: () => void
}

interface ToggleRowProps {
  icon: ReactNode
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ icon, label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={styles.rowHint}>{hint}</span>
      </span>
      <button
        type="button"
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  )
}

/** 설정 화면 — 큰 글씨 모드(실제로 화면 zoom 1.2배 적용)·음성 안내(브라우저
    SpeechSynthesis 지원 시에만 노출)·알림 관리(내 상담 화면에 있던 것을 이동)·
    로그아웃. 서버로 전송되는 값은 없고 전부 이 브라우저의 localStorage에만 남는다. */
export function SettingsScreen({ onBack, onLogout }: SettingsScreenProps) {
  const [largeText, setLargeTextState] = useState(loadLargeText)
  const [voiceGuide, setVoiceGuideState] = useState(loadVoiceGuide)
  const speechSupported = isSpeechSupported()

  function handleLargeText(next: boolean) {
    setLargeTextState(next)
    setLargeText(next)
  }

  function handleVoiceGuide(next: boolean) {
    setVoiceGuideState(next)
    setVoiceGuide(next)
  }

  return (
    <div className={styles.screen}>
      <TopAppBar title="설정" onBack={onBack} />
      <div className={styles.body}>
        <section className={`${styles.card} card`} aria-label="화면·음성">
          <ToggleRow
            icon={<Type size={17} />}
            label="큰 글씨 모드"
            hint="화면 전체 글씨를 1.2배로 키워요"
            checked={largeText}
            onChange={handleLargeText}
          />
          {speechSupported ? (
            <ToggleRow
              icon={<Volume2 size={17} />}
              label="음성 안내"
              hint="상담 결과 화면에서 답변을 음성으로 들을 수 있어요"
              checked={voiceGuide}
              onChange={handleVoiceGuide}
            />
          ) : (
            <p className={styles.unsupported}>이 브라우저는 음성 안내를 지원하지 않아요</p>
          )}
        </section>

        <NotificationPreview />

        <button type="button" className={styles.logout} onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
