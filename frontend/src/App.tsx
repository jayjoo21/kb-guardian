import { useEffect, useState } from 'react'
import { Header, type TabId } from './components/Header'
import { Footer } from './components/Footer'
import { LoadingScreen } from './components/LoadingScreen'
import { PlaceholderView } from './components/PlaceholderView'
import { ConsultView } from './features/consult/ConsultView'
import styles from './App.module.css'

const BOOT_DELAY_MS = 700

function App() {
  const [booted, setBooted] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('consult')

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => setBooted(true), reduceMotion ? 0 : BOOT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!booted) {
    return <LoadingScreen />
  }

  return (
    <div className={styles.shell}>
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <main className={styles.main}>
        {activeTab === 'consult' && <ConsultView />}
        {activeTab === 'stats' && <PlaceholderView label="통계" />}
      </main>
      <Footer />
    </div>
  )
}

export default App
