import { useEffect, useRef, useState } from 'react'
import { streamConsult, type Classified } from '../../lib/api'
import { ConsultHero } from './ConsultHero'
import { ConsultActive } from './ConsultActive'
import styles from './ConsultView.module.css'

type Phase = 'initial' | 'loading' | 'result'

export function ConsultView() {
  const [phase, setPhase] = useState<Phase>('initial')
  const [text, setText] = useState('')
  const [classified, setClassified] = useState<Classified | null>(null)
  const [answer, setAnswer] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  function runConsult(input: string) {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setText(input)
    setClassified(null)
    setAnswer('')
    setError(null)
    setStreaming(true)
    setPhase('loading')

    streamConsult(
      input,
      {
        onClassified: (data) => {
          setClassified(data)
          setPhase('result')
        },
        onAnswerChunk: (delta) => setAnswer((prev) => prev + delta),
        onDone: (full) => {
          setAnswer(full)
          setStreaming(false)
        },
      },
      controller.signal,
    ).catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
      setStreaming(false)
      setPhase('initial')
    })
  }

  return (
    <div className={styles.view}>
      {phase === 'initial' ? (
        <ConsultHero onSubmit={runConsult} error={error} />
      ) : (
        <ConsultActive
          text={text}
          streaming={streaming}
          classified={classified}
          answer={answer}
          onResubmit={runConsult}
        />
      )}
    </div>
  )
}
