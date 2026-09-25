import { useEffect, useRef, useState } from 'react'
import type { LearnerProfile, SessionMode } from './engine'
import {
  SessionEngine,
  createLocalStorageStore,
  createMultiplicationSkill,
} from './engine'
import { HomeScreen } from './screens/HomeScreen'
import { PlayScreen } from './screens/PlayScreen'
import { ResultsScreen } from './screens/ResultsScreen'

type Screen = 'home' | 'play' | 'results'

const store = createLocalStorageStore()
const skill = createMultiplicationSkill()

function formatBest(ms: number | undefined): string {
  if (ms == null) return '—'
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${rem.padStart(4, '0')}` : `${s.toFixed(1)}s`
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [profile, setProfile] = useState<LearnerProfile>(() => store.load())
  const [muted, setMuted] = useState(false)
  const [clock, setClock] = useState(0)
  const engineRef = useRef<SessionEngine | null>(null)

  useEffect(() => {
    if (screen !== 'play') return
    const id = window.setInterval(() => setClock((c) => c + 1), 200)
    return () => window.clearInterval(id)
  }, [screen])

  function startSession(mode: SessionMode) {
    const fresh = store.load()
    setProfile(fresh)
    const engine = new SessionEngine(fresh, skill, mode)
    engineRef.current = engine
    engine.start(Date.now())
    setClock(0)
    setScreen('play')
  }

  function handleSubmit(value: number) {
    const engine = engineRef.current
    if (!engine) return
    const snap = engine.submit(value, Date.now())
    const nextProfile = engine.getProfile()
    setProfile(nextProfile)
    store.save(nextProfile)
    if (snap.finished) {
      setScreen('results')
    } else {
      setClock((c) => c + 1)
    }
  }

  function goHome() {
    engineRef.current = null
    setScreen('home')
  }

  if (screen === 'play' && engineRef.current) {
    const snapshot = engineRef.current.snapshot(Date.now())
    void clock
    if (!snapshot.finished && snapshot.current) {
      return (
        <div className="app-shell">
          <PlayScreen
            snapshot={snapshot}
            bestMs={profile.bestTimeMsByMode[snapshot.mode]}
            onSubmit={handleSubmit}
          />
        </div>
      )
    }
  }

  if (screen === 'results' && engineRef.current) {
    const summary = engineRef.current.getSummary()
    if (summary) {
      return (
        <div className="app-shell">
          <ResultsScreen
            summary={summary}
            onAgain={() => startSession(summary.mode)}
            onHome={goHome}
          />
        </div>
      )
    }
  }

  return (
    <div className="app-shell">
      <HomeScreen
        bestQuick={formatBest(profile.bestTimeMsByMode.quick)}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
        onQuick={() => startSession('quick')}
        onPractice={() => startSession('practice')}
      />
    </div>
  )
}
