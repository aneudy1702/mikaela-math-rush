import { useEffect, useRef, useState } from 'react'
import type {
  FeedbackTier,
  LearnerProfile,
  PlacementItem,
  SessionMode,
} from './engine'
import {
  SessionEngine,
  buildPlacementSequence,
  createLocalStorageStore,
  createMultiplicationSkill,
} from './engine'
import {
  isMuted as readMuted,
  playSfx,
  toggleMuted,
  unlockAudio,
  type SfxEvent,
} from './audio/engine'
import { HomeScreen } from './screens/HomeScreen'
import { PlacementScreen } from './screens/PlacementScreen'
import { PlayScreen } from './screens/PlayScreen'
import { ResultsScreen } from './screens/ResultsScreen'

type Screen = 'home' | 'placement' | 'play' | 'results'

const store = createLocalStorageStore()
const skill = createMultiplicationSkill()

function formatBest(ms: number | undefined): string {
  if (ms == null) return '—'
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${rem.padStart(4, '0')}` : `${s.toFixed(1)}s`
}

function feedbackToSfx(tier: FeedbackTier | null): SfxEvent | null {
  if (!tier) return null
  if (tier === 'soft-miss') return 'miss'
  if (tier === 'correct-subtle') return 'correct'
  if (tier === 'got-it-back') return 'got-it-back'
  if (tier === 'new-record') return 'new-record'
  if (
    tier === 'streak-5' ||
    tier === 'streak-10' ||
    tier === 'streak-25' ||
    tier === 'streak-50' ||
    tier === 'streak-100'
  ) {
    return tier
  }
  return null
}

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [profile, setProfile] = useState<LearnerProfile>(() => store.load())
  const [muted, setMutedState] = useState(() => readMuted())
  const [clock, setClock] = useState(0)
  const [placementItems, setPlacementItems] = useState<PlacementItem[]>([])
  const engineRef = useRef<SessionEngine | null>(null)
  const lastSfxKey = useRef<string>('')

  useEffect(() => {
    if (screen !== 'play') return
    const id = window.setInterval(() => setClock((c) => c + 1), 200)
    return () => window.clearInterval(id)
  }, [screen])

  function ensureAudio() {
    void unlockAudio()
  }

  function persist(next: LearnerProfile) {
    setProfile(next)
    store.save(next)
  }

  function handleToggleMute() {
    ensureAudio()
    setMutedState(toggleMuted())
  }

  function startPlacement() {
    ensureAudio()
    playSfx('start')
    setPlacementItems(buildPlacementSequence(16))
    setScreen('placement')
  }

  function startSession(mode: SessionMode) {
    ensureAudio()
    playSfx('start')
    const fresh = store.load()
    setProfile(fresh)
    const engine = new SessionEngine(fresh, skill, mode)
    engineRef.current = engine
    engine.start(Date.now())
    lastSfxKey.current = ''
    setClock(0)
    setScreen('play')
  }

  function handleSubmit(value: number) {
    ensureAudio()
    const engine = engineRef.current
    if (!engine) return
    const snap = engine.submit(value, Date.now())
    persist(engine.getProfile())

    const sfx = feedbackToSfx(snap.lastFeedback)
    const key = `${snap.index}-${snap.lastFeedback}-${snap.missHold?.reveal ?? ''}-${snap.finished}`
    if (sfx && key !== lastSfxKey.current) {
      lastSfxKey.current = key
      playSfx(sfx)
    }

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

  if (screen === 'placement' && placementItems.length > 0) {
    return (
      <div className="app-shell">
        <PlacementScreen
          items={placementItems}
          profile={profile}
          onUpdateProfile={persist}
          onDone={(done) => {
            persist(done)
            setScreen('home')
          }}
        />
      </div>
    )
  }

  if (screen === 'play' && engineRef.current) {
    const snapshot = engineRef.current.snapshot(Date.now())
    void clock
    if (!snapshot.finished && (snapshot.current || snapshot.missHold)) {
      return (
        <div className="app-shell">
          <PlayScreen snapshot={snapshot} onSubmit={handleSubmit} />
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
        needsPlacement={!profile.placementComplete}
        onToggleMute={handleToggleMute}
        onQuick={() => startSession('quick')}
        onPractice={() => startSession('practice')}
        onRush={() => startSession('rush')}
        onPlacement={startPlacement}
      />
    </div>
  )
}
