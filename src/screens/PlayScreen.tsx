import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { gameAssets } from '../assets'
import type { FeedbackTier, SessionSnapshot } from '../engine'
import { Keypad } from '../components/Keypad'

interface PlayScreenProps {
  snapshot: SessionSnapshot
  bestTimeMs?: number
  onSubmit: (value: number) => void
  onBack?: () => void
  muted?: boolean
  onToggleMute?: () => void
}

function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatBest(ms: number | undefined): string {
  if (ms == null) return '—'
  return formatClock(ms)
}

function feedbackLabel(tier: FeedbackTier | null, reveal: string | null): {
  text: string
  kind: 'ok' | 'miss' | 'celeb' | 'recovery' | ''
} {
  if (!tier) return { text: '', kind: '' }
  if (tier === 'soft-miss') {
    return { text: reveal ? `Almost! ${reveal}` : 'Almost!', kind: 'miss' }
  }
  if (tier === 'got-it-back') return { text: 'Got it back!', kind: 'recovery' }
  if (tier === 'correct-subtle') return { text: 'Nice!', kind: 'ok' }
  if (tier === 'new-record') return { text: 'New record!', kind: 'celeb' }
  const map: Record<string, string> = {
    'streak-5': 'Nice!',
    'streak-10': 'On Fire!',
    'streak-25': 'Incredible!',
    'streak-50': 'Unstoppable!',
    'streak-100': 'Perfect Run!',
  }
  return { text: map[tier] ?? '', kind: 'celeb' }
}

function isMilestone(tier: FeedbackTier | null): boolean {
  return (
    tier === 'streak-5' ||
    tier === 'streak-10' ||
    tier === 'streak-25' ||
    tier === 'streak-50' ||
    tier === 'streak-100'
  )
}

export function PlayScreen({
  snapshot,
  bestTimeMs,
  onSubmit,
  onBack,
  muted,
  onToggleMute,
}: PlayScreenProps) {
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const [shake, setShake] = useState(false)
  const [showBurst, setShowBurst] = useState(false)
  const missHold = snapshot.missHold
  const question = snapshot.current?.question
  const expression = missHold
    ? missHold.expression
    : question?.prompt.type === 'expression'
      ? question.prompt.expression
      : '—'

  useEffect(() => {
    setDraft('')
    setLocked(false)
  }, [question?.id, missHold?.reveal])

  useEffect(() => {
    if (snapshot.lastFeedback === 'soft-miss') {
      setShake(true)
      const id = window.setTimeout(() => setShake(false), 320)
      return () => window.clearTimeout(id)
    }
  }, [snapshot.lastFeedback, snapshot.lastReveal])

  useEffect(() => {
    const major =
      snapshot.lastFeedback === 'streak-25' ||
      snapshot.lastFeedback === 'streak-50' ||
      snapshot.lastFeedback === 'streak-100'
    if (!major) return
    setShowBurst(true)
    const id = window.setTimeout(() => setShowBurst(false), 1400)
    return () => window.clearTimeout(id)
  }, [snapshot.lastFeedback, snapshot.streak])

  const progress = snapshot.total > 0 ? snapshot.index / snapshot.total : 0
  const displayQ = Math.min(snapshot.index + (missHold ? 0 : 1), snapshot.total)
  const fb = feedbackLabel(snapshot.lastFeedback, snapshot.lastReveal)
  const streakHot = snapshot.streak >= 5
  const milestone = isMilestone(snapshot.lastFeedback)

  // Pace vs previous best (projected): if finishing at current avg would beat best.
  const paceDeltaSec =
    bestTimeMs != null && snapshot.index > 0
      ? Math.round(
          (bestTimeMs -
            (snapshot.elapsedMs / snapshot.index) * snapshot.total) /
            1000,
        )
      : null

  function appendDigit(d: string) {
    if (locked) return
    setDraft((prev) => (prev.length >= 4 ? prev : prev + d))
  }

  function backspace() {
    if (locked) return
    setDraft((prev) => prev.slice(0, -1))
  }

  function submit() {
    if (locked || draft === '') return
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    setLocked(true)
    onSubmit(value)
    if (missHold) {
      window.setTimeout(() => setLocked(false), 120)
    }
  }

  return (
    <section className="play">
      <div className="play-toolbar">
        {onBack ? (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
            ←
          </button>
        ) : (
          <span className="icon-btn ghost" />
        )}
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
        ) : null}
      </div>

      <div className="play-hud">
        <div className="hud-cell">
          <span className="hud-label">
            <span className="hud-clock-dot" aria-hidden />
            Time
          </span>
          <strong className={snapshot.timerPaused ? 'timer-paused' : undefined}>
            {formatClock(snapshot.elapsedMs)}
          </strong>
        </div>
        <motion.div
          className={`hud-cell hud-streak${streakHot ? ' hot' : ''}`}
          key={`streak-${snapshot.streak}-${snapshot.lastFeedback}`}
          animate={
            milestone
              ? { scale: [1, 1.35, 1], rotate: [0, -5, 5, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 0.45 }}
        >
          <img
            src={gameAssets.icons.streakFire}
            alt=""
            className="hud-fire"
            draggable={false}
          />
          <strong>{snapshot.streak}</strong>
          <span className="hud-label">Streak</span>
        </motion.div>
        <div className="hud-cell">
          <span className="hud-label">
            <img
              src={gameAssets.icons.trophy}
              alt=""
              className="hud-mini"
              draggable={false}
            />
            Best
          </span>
          <strong className="cyan">{formatBest(bestTimeMs)}</strong>
        </div>
      </div>

      <div className="play-progress-wrap">
        <div className="play-progress" aria-hidden>
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
        <img
          src={gameAssets.icons.rushFlag}
          alt=""
          className="progress-flag"
          draggable={false}
        />
        <span className="progress-count">
          {displayQ} / {snapshot.total}
        </span>
      </div>

      <div
        className={`prompt-stage${snapshot.current?.isBossPresentation && !missHold ? ' boss' : ''}${missHold ? ' miss-hold' : ''}`}
      >
        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="play-runner"
          draggable={false}
          animate={{
            y: [0, -5, 0],
            x: `${(progress - 0.5) * 12}%`,
          }}
          transition={{
            y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
            x: { duration: 0.6 },
          }}
        />

        <AnimatePresence>
          {showBurst ? (
            <motion.img
              src={gameAssets.effects.celebrationBurst}
              alt=""
              className="play-burst"
              draggable={false}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.9 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 150, damping: 14 }}
            />
          ) : null}
        </AnimatePresence>

        <div className="problem-card">
          <AnimatePresence mode="wait">
            <motion.h2
              key={missHold ? `miss-${missHold.reveal}` : (question?.id ?? 'empty')}
              className="prompt-expression"
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.04, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {expression}
            </motion.h2>
          </AnimatePresence>

          <motion.div
            className={`answer-draft${draft ? '' : ' empty'}`}
            animate={
              shake
                ? { x: [0, -8, 8, -6, 6, 0], scale: 1 }
                : snapshot.lastFeedback === 'correct-subtle' ||
                    snapshot.lastFeedback === 'got-it-back'
                  ? { scale: [1, 1.08, 1], x: 0 }
                  : { scale: 1, x: 0 }
            }
            transition={{ duration: shake ? 0.32 : 0.22 }}
          >
            {draft || ''}
          </motion.div>
        </div>

        <div className={`feedback-line ${fb.kind}`}>
          {missHold ? (
            <>
              <span className="almost-word">Almost!</span> {missHold.reveal}
              <div className="miss-hint">Type {missHold.expected} to keep going</div>
            </>
          ) : fb.text ? (
            <span className={`feedback-pill${fb.kind === 'celeb' ? ' celeb' : ''}`}>
              {fb.kind === 'ok' || fb.kind === 'celeb' || fb.kind === 'recovery' ? (
                <span className="feedback-star" aria-hidden>
                  ★
                </span>
              ) : null}
              {fb.text}
            </span>
          ) : null}
        </div>

        {!missHold && paceDeltaSec != null && paceDeltaSec > 0 && snapshot.index >= 3 ? (
          <div className="pace-line">
            <img
              src={gameAssets.icons.lightning}
              alt=""
              className="pace-bolt"
              draggable={false}
            />
            {paceDeltaSec} sec ahead of your best!
          </div>
        ) : null}

        {!missHold && snapshot.current?.isReinforcement ? (
          <div className="coming-back">Coming back to this one</div>
        ) : null}
      </div>

      <Keypad
        disabled={locked}
        onDigit={appendDigit}
        onBackspace={backspace}
        onEnter={submit}
      />
    </section>
  )
}
