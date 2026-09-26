import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { gameAssets } from '../assets'
import { FactProgress } from '../components/FactProgress'
import { Keypad } from '../components/Keypad'
import type { LevelProgressFact, LevelSessionSnapshot } from '../engine'

interface PlayScreenProps {
  snapshot: LevelSessionSnapshot
  levelTitle: string
  levelProgress: readonly LevelProgressFact[]
  showRecordInfo: boolean
  bestTimeMs?: number
  persistenceWarning?: string | null
  onSubmit: (value: number) => void
  onDismissReveal: () => void
  onBack: () => void
  muted: boolean
  onToggleMute: () => void
}

function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function PlayScreen({
  snapshot,
  levelTitle,
  levelProgress,
  showRecordInfo,
  bestTimeMs,
  persistenceWarning,
  onSubmit,
  onDismissReveal,
  onBack,
  muted,
  onToggleMute,
}: PlayScreenProps) {
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const reveal = snapshot.reveal
  const question = snapshot.current?.question
  const expression =
    question?.prompt.type === 'expression'
      ? question.prompt.expression
      : question?.prompt.type === 'text'
        ? question.prompt.text
        : '—'

  useEffect(() => {
    if (!reveal) return
    function handleRevealKey(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return
      event.preventDefault()
      onDismissReveal()
    }
    window.addEventListener('keydown', handleRevealKey)
    return () => window.removeEventListener('keydown', handleRevealKey)
  }, [onDismissReveal, reveal])

  useEffect(() => {
    setDraft('')
    setLocked(false)
  }, [question?.id])

  const sessionProgress = snapshot.total > 0 ? snapshot.answered / snapshot.total : 0
  const displayQuestion = Math.min(
    snapshot.total,
    snapshot.answered + (snapshot.current ? 1 : 0),
  )
  const paceDeltaSeconds =
    showRecordInfo && bestTimeMs != null && snapshot.answered > 0
      ? Math.round(
          (bestTimeMs -
            (snapshot.elapsedMs / snapshot.answered) * snapshot.total) /
            1000,
        )
      : null

  function appendDigit(digit: string) {
    if (locked) return
    setDraft((previous) => (previous.length >= 4 ? previous : previous + digit))
  }

  function backspace() {
    if (locked) return
    setDraft((previous) => previous.slice(0, -1))
  }

  function submit() {
    if (locked || draft === '') return
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    setLocked(true)
    onSubmit(value)
  }

  return (
    <section className="play" aria-label={`${levelTitle} ${snapshot.mode} run`}>
      <div className="play-toolbar">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back home">
          ←
        </button>
        <div className="play-level-name">
          <span>{snapshot.levelId}</span>
          <strong>{levelTitle}</strong>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '×' : '♪'}
        </button>
      </div>

      {persistenceWarning ? (
        <div className="save-warning" role="status">
          <strong>Progress is not being saved.</strong> {persistenceWarning}
        </div>
      ) : null}

      <div className="play-hud">
        <div className="hud-cell">
          <span className="hud-label">
            <span className="hud-clock-dot" aria-hidden /> Time
          </span>
          <strong className={snapshot.hidden ? 'timer-paused' : undefined}>
            {formatClock(snapshot.elapsedMs)}
          </strong>
        </div>
        <motion.div
          className={`hud-cell hud-streak${snapshot.streak >= 5 ? ' hot' : ''}`}
          key={`streak-${snapshot.streak}`}
          animate={snapshot.streak > 0 && snapshot.streak % 5 === 0 ? { scale: [1, 1.2, 1] } : { scale: 1 }}
        >
          <img src={gameAssets.icons.streakFire} alt="" className="hud-fire" draggable={false} />
          <strong>{snapshot.streak}</strong>
          <span className="hud-label">Streak</span>
        </motion.div>
        <div className="hud-cell">
          {showRecordInfo ? (
            <>
              <span className="hud-label">
                <img src={gameAssets.icons.trophy} alt="" className="hud-mini" draggable={false} />
                Best
              </span>
              <strong className="cyan">{bestTimeMs == null ? '—' : formatClock(bestTimeMs)}</strong>
            </>
          ) : (
            <>
              <span className="hud-label">Answered</span>
              <strong>{snapshot.answered}</strong>
            </>
          )}
        </div>
      </div>

      <div className="play-progress-wrap">
        <div className="play-progress" aria-hidden>
          <span style={{ width: `${Math.min(100, sessionProgress * 100)}%` }} />
        </div>
        <img src={gameAssets.icons.rushFlag} alt="" className="progress-flag" draggable={false} />
        <span className="progress-count">
          {displayQuestion} / {snapshot.total}
        </span>
      </div>

      {!showRecordInfo ? <FactProgress facts={levelProgress} compact /> : null}

      <div className={`prompt-stage${reveal ? ' miss-hold' : ''}`}>
        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="play-runner"
          draggable={false}
          animate={{ y: [0, -5, 0], x: `${(sessionProgress - 0.5) * 12}%` }}
          transition={{
            y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
            x: { duration: 0.6 },
          }}
        />

        {reveal ? (
          <motion.button
            type="button"
            className="reveal-card"
            onClick={onDismissReveal}
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            <span className="reveal-eyebrow">Almost!</span>
            <strong>{reveal.text}</strong>
            <span className="reveal-got-it">Got it</span>
          </motion.button>
        ) : (
          <motion.div
            className="problem-card"
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            <h1 className="prompt-expression">{expression}</h1>
            <div className={`answer-draft${draft ? '' : ' empty'}`}>{draft}</div>
          </motion.div>
        )}

        {!reveal && paceDeltaSeconds != null && paceDeltaSeconds > 0 && snapshot.answered >= 3 ? (
          <div className="pace-line">
            <img src={gameAssets.icons.lightning} alt="" className="pace-bolt" draggable={false} />
            {paceDeltaSeconds} sec ahead of your best!
          </div>
        ) : null}

        {!reveal && snapshot.current?.source !== 'draw' ? (
          <div className="coming-back">Coming back to this one</div>
        ) : null}
      </div>

      {!reveal ? (
        <Keypad
          disabled={locked || snapshot.hidden}
          onDigit={appendDigit}
          onBackspace={backspace}
          onEnter={submit}
        />
      ) : null}
    </section>
  )
}
