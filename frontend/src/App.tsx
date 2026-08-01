import { useEffect, useRef, useState } from 'react'
import { PhoneFrame } from './app/PhoneFrame'
import { ScreenTransition } from './app/ScreenTransition'
import { BottomTabBar } from './app/BottomTabBar'
import { useScreenNav, isTabScreen } from './app/useScreenNav'
import { SplashScreen } from './screens/SplashScreen'
import { LoginScreen } from './screens/LoginScreen'
import { SignupScreen } from './screens/SignupScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MyPageScreen } from './screens/MyPageScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatsScreen } from './screens/StatsScreen'
import { ConsultInputScreen } from './screens/ConsultInputScreen'
import { ConsultResultScreen } from './screens/ConsultResultScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ConsumerRightsScreen } from './screens/ConsumerRightsScreen'
import { PreventionScreen } from './screens/PreventionScreen'
import { LearningScreen } from './screens/LearningScreen'
import { RightsSimulationScreen } from './screens/RightsSimulationScreen'
import { AIAssistantFloatingButton } from './components/AIAssistantFloatingButton'
import { type Classified, type Evidence, type Procedure } from './lib/api'
import { isLoggedIn, logout } from './lib/auth'
import { loadHistory, saveHistoryEntry, type ConsultHistoryEntry, type SavedSimulationEntry } from './lib/history'

function App() {
  const nav = useScreenNav('splash')
  const [text, setText] = useState('')
  const [consultQuery, setConsultQuery] = useState('')
  const [classified, setClassified] = useState<Classified | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [procedure, setProcedure] = useState<Procedure | null>(null)
  const [answer, setAnswer] = useState('')
  const [, setAnswerDone] = useState(false)
  const [error] = useState<string | null>(null)
  const [simulationSession, setSimulationSession] = useState<SavedSimulationEntry | null>(null)
  // 8-1/8-2용 — 지금 result에 표시 중인 상담의 이력 id(자가보고 상태를 이 항목에
  // 이어 붙이거나, "지난 상담과 비교"에서 자기 자신을 제외하는 데 쓴다).
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const navTimeoutRef = useRef<number | null>(null)

  function clearNavTimeout() {
    if (navTimeoutRef.current !== null) {
      window.clearTimeout(navTimeoutRef.current)
      navTimeoutRef.current = null
    }
  }

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      clearNavTimeout()
    },
    [],
  )

  function startConsult(input: string) {
    setText(input)
    setConsultQuery(input)
    if (input) {
      nav.push('consult-result')
    } else {
      nav.push('consult-input')
    }
  }

  /** 결과 화면에서 "이 쟁점이 아니에요" → 다른 쟁점 선택 → 그 쟁점으로 강제
      재조회. 원래 입력 텍스트(consultQuery)는 그대로 두고 쟁점만 바꾼다. 현재 스택의
      'result'를 'consult-result'로 교체해, 뒤로가기가 틀렸던 결과가 아니라 home으로
      가도록 한다. */
  function reanalyzeWithIssue(_issue: string) {
    nav.replaceTop('consult-result')
    // ConsultResultScreen 내부에서 overrideIssues 처리 필요
    // 임시로 기존 query 유지
  }

  /** 8-1 능동 제안(쟁점 보완) "확인하고 재분석" — 기존 분류는 그대로 두고 제안된
      쟁점을 더해 재조회한다(교체가 아니라 추가라는 점이 reanalyzeWithIssue와 다르다). */
  function addIssueAndReanalyze(_issue: string) {
    if (!classified) return
    nav.replaceTop('consult-result')
    // ConsultResultScreen 내부에서 overrideIssues 처리 필요
    // 임시로 기존 query 유지
  }

  function goHome() {
    controllerRef.current?.abort()
    clearNavTimeout()
    nav.replaceAll('home')
  }

  function handleLogout() {
    controllerRef.current?.abort()
    clearNavTimeout()
    logout()
    nav.replaceAll('login')
  }

  /** "내 상담" 탭에서 저장된 이력을 탭했을 때 — 재상담 없이 그때 저장해둔 데이터로
      결과 화면을 그대로 다시 보여준다. */
  function viewHistoryEntry(entry: ConsultHistoryEntry) {
    controllerRef.current?.abort()
    clearNavTimeout()
    setText(entry.text)
    setConsultQuery(entry.text)
    setClassified(entry.classified)
    setAnswer(entry.answer)
    setEvidence(entry.evidence)
    setProcedure(entry.procedure)
    setAnswerDone(true)
    setHistoryEntryId(entry.id)
    nav.push('result')
  }

  function openSavedSimulation(entry: SavedSimulationEntry) {
    setSimulationSession(entry)
    nav.push('rights-simulation')
  }

  function openSavedSimulationResult(entry: SavedSimulationEntry) {
    const matchingHistory = loadHistory().find((savedEntry) => savedEntry.id === entry.contextHistoryEntryId)
    if (matchingHistory) {
      viewHistoryEntry(matchingHistory)
      return
    }
    setSimulationSession(entry)
    nav.push('rights-simulation')
  }

  return (
    <PhoneFrame>
      <ScreenTransition screenKey={nav.current}>
        {nav.current === 'splash' && (
          <SplashScreen onDone={() => nav.replaceAll(isLoggedIn() ? 'home' : 'login')} />
        )}
        {nav.current === 'login' && (
          <LoginScreen
            onLogin={() => nav.replaceAll('home')}
            onNavigateSignup={() => nav.push('signup')}
            onSkip={() => nav.replaceAll('home')}
          />
        )}
        {nav.current === 'signup' && (
          <SignupScreen onBack={nav.back} onSignedUp={() => nav.replaceAll('home')} />
        )}
        {nav.current === 'home' && (
          <HomeScreen 
            onStartConsult={startConsult} 
            onNavigateToRights={() => nav.push('consumer-rights')}
            onNavigateToStats={() => nav.replaceAll('stats')}
            onNavigateToPrevention={() => nav.push('prevention')}
            onNavigateToLearning={() => nav.push('learning')}
            onNavigateToSimulation={() => {
              setSimulationSession(null)
              nav.push('rights-simulation')
            }}
            error={error} 
          />
        )}
        {nav.current === 'my-page' && (
          <MyPageScreen
            onOpenEntry={viewHistoryEntry}
            onOpenSimulation={openSavedSimulation}
            onOpenSimulationResult={openSavedSimulationResult}
            onStartConsult={() => startConsult('')}
            onOpenSettings={() => nav.push('settings')}
          />
        )}
        {nav.current === 'settings' && <SettingsScreen onBack={nav.back} onLogout={handleLogout} />}
        {nav.current === 'stats' && <StatsScreen onBack={nav.back} />}
        {nav.current === 'consumer-rights' && <ConsumerRightsScreen onBack={nav.back} />}
        {nav.current === 'prevention' && <PreventionScreen onBack={nav.back} />}
        {nav.current === 'learning' && <LearningScreen onBack={nav.back} onStartConsult={startConsult} />}
        {nav.current === 'rights-simulation' && (
          <RightsSimulationScreen
            onBack={() => {
              setSimulationSession(null)
              nav.back()
            }}
            context={{
              text: consultQuery || text,
              issues: classified?.issues ?? [],
              evidence,
              procedure,
              historyEntryId,
            }}
            initialSession={simulationSession}
          />
        )}
        {nav.current === 'consult-input' && (
          <ConsultInputScreen
            onStartConsult={startConsult}
            onBack={nav.back}
          />
        )}
        {nav.current === 'consult-result' && (
          <ConsultResultScreen
            query={consultQuery}
            onBack={() => {
              controllerRef.current?.abort()
              nav.back()
            }}
            onComplete={(data) => {
              setClassified(data.classified)
              setEvidence(data.evidence)
              setProcedure(data.procedure)
              setAnswer(data.answer)
              setAnswerDone(true)
              if (data.classified) {
                const id = saveHistoryEntry({
                  text: consultQuery,
                  classified: data.classified,
                  answer: data.answer,
                  evidence: data.evidence,
                  procedure: data.procedure,
                })
                setHistoryEntryId(id)
              }
              nav.replaceTop('result')
            }}
          />
        )}
        {nav.current === 'result' && classified && (
          <ResultScreen
            text={text}
            classified={classified}
            answer={answer}
            evidence={evidence}
            procedure={procedure}
            historyEntryId={historyEntryId}
            onBack={nav.back}
            onHome={goHome}
            onReanalyze={reanalyzeWithIssue}
            onAddIssue={addIssueAndReanalyze}
            onNavigateToStats={() => nav.replaceAll('stats')}
          />
        )}
      </ScreenTransition>

      {nav.current !== 'splash' && (
        <AIAssistantFloatingButton
          currentEvidence={evidence as Record<string, unknown> | null}
          onNavigateToScreen={(screen) => nav.push(screen as any)}
          onStartConsult={startConsult}
        />
      )}

      {isTabScreen(nav.current) && <BottomTabBar active={nav.current} onChange={nav.replaceAll} />}
    </PhoneFrame>
  )
}

export default App
