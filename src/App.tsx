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
  gameAudio,
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
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
  const [installHint, setInstallHint] = useState(false)
  const engineRef = useRef<SessionEngine | null>(null)
  const lastSfxKey = useRef<string>('')
  const lastBossIndex = useRef<number>(-1)
  const deferredPrompt = useRef<{ prompt: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (screen !== 'play') return
    const id = window.setInterval(() => setClock((c) => c + 1), 200)
    return () => window.clearInterval(id)
  }, [screen])

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as unknown as { prompt: () => Promise<void> }
      setInstallHint(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  useEffect(() => {
    if (screen === 'home') gameAudio.stopMusic()
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

  async function handleInstall() {
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt()
      deferredPrompt.current = null
      setInstallHint(false)
    }
  }

  function startPlacement() {
    ensureAudio()
    playSfx('start')
    gameAudio.resetSessionFlags()
    gameAudio.startMusic()
    setPlacementItems(buildPlacementSequence(12))
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
    lastBossIndex.current = -1
    gameAudio.resetSessionFlags()
    gameAudio.startMusic()
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

    const displayQ = Math.min(
      snap.index + (snap.missHold ? 0 : 1),
      snap.total,
    )
    const progress =
      snap.total > 0 ? Math.min(1, snap.index / snap.total) : 0
    gameAudio.setIntensity(progress)
    gameAudio.maybeProgressMilestone(displayQ, snap.total)

    if (
      snap.current?.isBossPresentation &&
      !snap.missHold &&
      snap.index !== lastBossIndex.current
    ) {
      lastBossIndex.current = snap.index
      playSfx('boss')
    }

    if (snap.finished) {
      gameAudio.stopMusic()
      const summary = engine.getSummary()
      if (
        summary &&
        !(summary.newTimeRecord || summary.newStreakRecord) &&
        summary.correctCount < summary.total
      ) {
        playSfx('milestone')
      }
      setScreen('results')
    } else {
      setClock((c) => c + 1)
    }
  }

  function goHome() {
    engineRef.current = null
    gameAudio.stopMusic()
    setScreen('home')
  }

  if (screen === 'placement' && placementItems.length > 0) {
    return (
      <div className="app-shell">
        <PlacementScreen
          items={placementItems}
          profile={profile}
          onUpdateProfile={persist}
          onBack={goHome}
          muted={muted}
          onToggleMute={handleToggleMute}
          onDone={(done) => {
            persist(done)
            playSfx('milestone')
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
      const mode = snapshot.mode
      const bestBefore = profile.bestTimeMsByMode[mode]

      return (
        <div className="app-shell">
          <PlayScreen
            snapshot={snapshot}
            bestTimeMs={bestBefore}
            onSubmit={handleSubmit}
            onBack={goHome}
            muted={muted}
            onToggleMute={handleToggleMute}
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
        dailyStreak={profile.dailyStreak}
        muted={muted}
        needsPlacement={!profile.placementComplete}
        onToggleMute={handleToggleMute}
        onQuick={() => startSession('quick')}
        onPractice={() => startSession('practice')}
        onRush={() => startSession('rush')}
        onPlacement={startPlacement}
        showInstallHint={installHint}
        onInstallHint={() => void handleInstall()}
      />
    </div>
  )
}
