import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { gameAssets } from '../assets'
import type { LearnerProfile, PlacementItem } from '../engine'
import {
  completePlacement,
  generateForFact,
  seedPlacementAttempt,
} from '../engine'
import { Keypad } from '../components/Keypad'

interface PlacementScreenProps {
  items: PlacementItem[]
  profile: LearnerProfile
  onUpdateProfile: (profile: LearnerProfile) => void
  onDone: (profile: LearnerProfile) => void
  onBack?: () => void
  muted?: boolean
  onToggleMute?: () => void
}

export function PlacementScreen({
  items,
  profile,
  onUpdateProfile,
  onDone,
  onBack,
  muted,
  onToggleMute,
}: PlacementScreenProps) {
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now())
  const [hint, setHint] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [intro, setIntro] = useState(true)
  const [streak, setStreak] = useState(0)

  const item = items[index]
  const question = useMemo(
    () => (item ? generateForFact(item.factId, () => 0.25, 0.5) : null),
    [item],
  )

  useEffect(() => {
    if (intro) return
    const id = window.setInterval(() => {
      setElapsed(Date.now() - sessionStartedAt)
    }, 200)
    return () => window.clearInterval(id)
  }, [intro, sessionStartedAt])

  useEffect(() => {
    if (intro) return
    setDraft('')
    setLocked(false)
    setHint(null)
    setStartedAt(Date.now())
  }, [index, intro])

  if (!item || !question) {
    return null
  }

  const expression =
    question.prompt.type === 'expression' ? question.prompt.expression : '—'

  function begin() {
    const now = Date.now()
    setIntro(false)
    setSessionStartedAt(now)
    setStartedAt(now)
  }

  function submit() {
    if (intro || locked || draft === '' || !item || !question) return
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    setLocked(true)
    const latencyMs = Math.max(0, Date.now() - startedAt)
    const correct = value === item.product
    if (!correct) {
      setHint(`Almost! ${item.a}×${item.b}=${item.product}`)
      setStreak(0)
    } else {
      setStreak((s) => s + 1)
      setHint(null)
    }
    const next = seedPlacementAttempt(
      profile,
      item.factId,
      correct,
      latencyMs,
    )
    onUpdateProfile(next)

    window.setTimeout(() => {
      const nextIndex = index + 1
      if (nextIndex >= items.length) {
        const done = completePlacement(next)
        onUpdateProfile(done)
        onDone(done)
      } else {
        setIndex(nextIndex)
      }
    }, correct ? 180 : 700)
  }

  if (intro) {
    return (
      <section className="placement-intro">
        <div className="play-toolbar">
          {onBack ? (
            <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
              ←
            </button>
          ) : (
            <span className="icon-btn ghost" />
          )}
          <h1 className="placement-title">Placement Run</h1>
          {onToggleMute ? (
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? '×' : '♪'}
            </button>
          ) : (
            <span className="icon-btn ghost" />
          )}
        </div>

        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="placement-runner"
          draggable={false}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />

        <p className="placement-lead">Let&apos;s see how fast you are!</p>
        <p className="placement-bubble">
          This quick run helps us learn <strong>your strengths</strong> so we
          can give you the perfect challenges!
        </p>

        <motion.button
          type="button"
          className="mode-btn mode-quick placement-start"
          onClick={begin}
          whileTap={{ scale: 0.98 }}
        >
          <img
            src={gameAssets.icons.lightning}
            alt=""
            className="mode-icon"
            draggable={false}
          />
          <span className="mode-copy">
            <span className="mode-title">Start run</span>
            <span className="mode-desc">{items.length} questions · clock starts</span>
          </span>
        </motion.button>
      </section>
    )
  }

  const totalSec = Math.floor(elapsed / 1000)
  const clock = `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`

  return (
    <section className="play">
      <div className="play-hud">
        <div className="hud-cell">
          <span className="hud-label">Time</span>
          <strong>{clock}</strong>
        </div>
        <div className="hud-cell hud-streak">
          <img
            src={gameAssets.icons.streakFire}
            alt=""
            className="hud-fire"
            draggable={false}
          />
          <strong>{streak}</strong>
          <span className="hud-label">Streak</span>
        </div>
        <div className="hud-cell">
          <span className="hud-label">Question</span>
          <strong>
            {index + 1}/{items.length}
          </strong>
        </div>
      </div>

      <div className="play-progress-wrap">
        <div className="play-progress" aria-hidden>
          <span style={{ width: `${((index + 1) / items.length) * 100}%` }} />
        </div>
        <span className="progress-count">
          Question <strong>{index + 1}</strong> of {items.length}
        </span>
      </div>

      <div className="prompt-stage">
        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="play-runner small"
          draggable={false}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <AnimatePresence mode="wait">
          <motion.h2
            key={item.factId}
            className="prompt-expression"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {expression}
          </motion.h2>
        </AnimatePresence>
        <div className={`answer-draft${draft ? '' : ' empty'}`}>{draft || ''}</div>
        <div className={`feedback-line${hint ? ' miss' : ''}`}>{hint ?? ''}</div>
        <p className="placement-foot">
          <img
            src={gameAssets.icons.lightning}
            alt=""
            className="pace-bolt"
            draggable={false}
          />
          Fast answers help us tune your challenge!
        </p>
      </div>

      <Keypad
        disabled={locked}
        onDigit={(d) => setDraft((p) => (p.length >= 4 ? p : p + d))}
        onBackspace={() => setDraft((p) => p.slice(0, -1))}
        onEnter={submit}
      />
    </section>
  )
}
