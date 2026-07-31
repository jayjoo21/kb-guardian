import { useEffect, useRef, useState } from 'react'
import { PhoneFrame } from './app/PhoneFrame'
import { ScreenTransition } from './app/ScreenTransition'
import { BottomTabBar } from './app/BottomTabBar'
import { useScreenNav, isTabScreen } from './app/useScreenNav'
import { SplashScreen } from './screens/SplashScreen'
import { LoginScreen } from './screens/LoginScreen'
import { SignupScreen } from './screens/SignupScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MyConsultScreen } from './screens/MyConsultScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatsScreen } from './screens/StatsScreen'
import { ConsultInputScreen } from './screens/ConsultInputScreen'
import { ConsultResultScreen } from './screens/ConsultResultScreen'
import { ResultScreen } from './screens/ResultScreen'
import { ConsumerRightsScreen } from './screens/ConsumerRightsScreen'
import { PreventionScreen } from './screens/PreventionScreen'
import { LearningScreen } from './screens/LearningScreen'
import { AIAssistantFloatingButton } from './components/AIAssistantFloatingButton'
import {
  streamConsult,
  type AgentStep,
  type ClarificationCandidate,
  type Classified,
  type Evidence,
  type Procedure,
} from './lib/api'
import { isLoggedIn, logout } from './lib/auth'
import { saveHistoryEntry, type ConsultHistoryEntry } from './lib/history'

function App() {
  const nav = useScreenNav('splash')
  const [text, setText] = useState('')
  const [consultQuery, setConsultQuery] = useState('')
  const [classified, setClassified] = useState<Classified | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [procedure, setProcedure] = useState<Procedure | null>(null)
  const [answer, setAnswer] = useState('')
  const [answerDone, setAnswerDone] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [clarification, setClarification] = useState<ClarificationCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  /** SSE 호출 + 상태 관리만 담당(화면 전환은 호출부가 정한다) — 최초 상담(startConsult,
      home -> consult push)과 재분석(reanalyzeWithIssue, result -> consult로 교체)이
      네비게이션 방식만 다르고 나머지 로직은 동일해서 공통으로 뺐다. */
  function runConsult(input: string, overrideIssues?: string[]) {
    controllerRef.current?.abort()
    clearNavTimeout()
    const controller = new AbortController()
    controllerRef.current = controller

    // SSE 콜백은 이 함수 호출 시점의 React state 클로저를 그대로 캡처하므로(스테일
    // 클로저), onDone에서 "방금 받은" classified/evidence/procedure를 참조하려면
    // React state가 아니라 이 지역 변수를 읽어야 한다.
    let latestClassified: Classified | null = null
    let latestEvidence: Evidence | null = null
    let latestProcedure: Procedure | null = null

    setText(input)
    setConsultQuery(input)
    setClassified(null)
    setEvidence(null)
    setProcedure(null)
    setAnswer('')
    setAnswerDone(false)
    setAgentSteps([])
    setClarification(null)
    setError(null)
    setHistoryEntryId(null)

    // 스트리밍 타이핑 표시는 하지 않는다 — SSE로 데이터는 계속 받되(단계 체크용),
    // 화면 전환은 답변이 완전히 완성(done)된 뒤 한 번에 이뤄진다.
    streamConsult(
      input,
      {
        onAgentStep: (step) => {
          setAgentSteps((prev) => {
            const rest = prev.filter((s) => s.step !== step.step)
            return [...rest, step]
          })
        },
        onNeedsClarification: (candidates) => {
          setClarification(candidates)
        },
        onClassified: (data) => {
          latestClassified = data
          setClassified(data)
        },
        onEvidence: (data) => {
          latestEvidence = data
          setEvidence(data)
        },
        onProcedure: (data) => {
          latestProcedure = data
          setProcedure(data)
        },
        onDone: (full) => {
          setAnswer(full)
          setAnswerDone(true)
          if (latestClassified) {
            const id = saveHistoryEntry({
              text: consultQuery,
              classified: latestClassified,
              answer: full,
              evidence: latestEvidence,
              procedure: latestProcedure,
            })
            setHistoryEntryId(id)
          }
          // 3단계(대응 가이드 생성) 체크가 화면에 실제로 보인 뒤 result로 넘어간다.
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          navTimeoutRef.current = window.setTimeout(() => {
            navTimeoutRef.current = null
            nav.replaceTop('result')
          }, reduceMotion ? 0 : 500)
        },
      },
      controller.signal,
      overrideIssues,
    ).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      clearNavTimeout()
      setError(err instanceof Error ? err.message : String(err))
      nav.replaceAll('home')
    })
  }

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
  function reanalyzeWithIssue(issue: string) {
    nav.replaceTop('consult-result')
    // ConsultResultScreen 내부에서 overrideIssues 처리 필요
    // 임시로 기존 query 유지
  }

  /** 8-1 능동 제안(쟁점 보완) "확인하고 재분석" — 기존 분류는 그대로 두고 제안된
      쟁점을 더해 재조회한다(교체가 아니라 추가라는 점이 reanalyzeWithIssue와 다르다). */
  function addIssueAndReanalyze(issue: string) {
    if (!classified) return
    nav.replaceTop('consult-result')
    // ConsultResultScreen 내부에서 overrideIssues 처리 필요
    // 임시로 기존 query 유지
  }

  /** 로딩 화면 되묻기(①) — 사용자가 고른 쟁점으로 파이프라인을 이어간다. */
  function pickClarification(issue: string) {
    runConsult(consultQuery, [issue])
  }

  function cancelConsult() {
    controllerRef.current?.abort()
    clearNavTimeout()
    nav.back()
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
            isSplashVisible={false}
            error={error} 
          />
        )}
        {nav.current === 'my-consult' && (
          <MyConsultScreen
            onOpenEntry={viewHistoryEntry}
            onStartConsult={goHome}
            onOpenSettings={() => nav.push('settings')}
          />
        )}
        {nav.current === 'settings' && <SettingsScreen onBack={nav.back} onLogout={handleLogout} />}
        {nav.current === 'stats' && <StatsScreen />}
        {nav.current === 'consumer-rights' && <ConsumerRightsScreen onBack={nav.back} />}
        {nav.current === 'prevention' && <PreventionScreen onBack={nav.back} />}
        {nav.current === 'learning' && <LearningScreen onBack={nav.back} onStartConsult={startConsult} />}
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
