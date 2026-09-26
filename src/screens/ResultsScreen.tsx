import { motion } from 'framer-motion'
import { gameAssets } from '../assets'
import type { SessionResultSummary } from '../engine'

interface ResultsScreenProps {
  summary: SessionResultSummary
  onAgain: () => void
  onHome: () => void
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDelta(deltaMs: number | null): string | null {
  if (deltaMs == null) return null
  const sec = Math.round(Math.abs(deltaMs) / 1000)
  if (deltaMs < 0) return `${sec} sec faster than your best!`
  if (deltaMs > 0) return `${sec} sec behind your best`
  return 'Matched your best!'
}

export function ResultsScreen({ summary, onAgain, onHome }: ResultsScreenProps) {
  const perfect = summary.correctCount === summary.total
  const showVictory =
    summary.newTimeRecord || summary.newStreakRecord || perfect
  const deltaLine = formatDelta(summary.deltaVsPreviousBestMs)
  const beatLabel =
    summary.previousBestTimeMs != null
      ? `Beat ${formatClock(summary.previousBestTimeMs)}`
      : 'Race again'

  return (
    <section className={`results${showVictory ? ' victory' : ''}`}>
      {showVictory ? (
        <div className="results-hero" aria-hidden>
          <motion.img
            src={gameAssets.effects.celebrationBurst}
            alt=""
            className="results-burst"
            draggable={false}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.95 }}
            transition={{ type: 'spring', stiffness: 150, damping: 14 }}
          />
          <motion.img
            src={gameAssets.characters.victory}
            alt=""
            className="results-victory"
            draggable={false}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      ) : (
        <motion.img
          src={gameAssets.icons.trophy}
          alt=""
          className="results-trophy-solo"
          draggable={false}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        />
      )}

      <motion.div
        className="results-head"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1>
          {summary.newTimeRecord || summary.newStreakRecord
            ? 'New Record!'
            : perfect
              ? 'Perfect Run!'
              : 'Great Run!'}
        </h1>
        {(summary.newTimeRecord || summary.newStreakRecord) && (
          <img
            src={gameAssets.icons.trophy}
            alt=""
            className="results-trophy-inline"
            draggable={false}
          />
        )}
      </motion.div>

      <div className="results-time-card">
        <span className="stat-label">Your Best Time</span>
        <div className="stat-value cyan xl">{formatClock(summary.elapsedMs)}</div>
        {deltaLine && summary.deltaVsPreviousBestMs != null && summary.deltaVsPreviousBestMs < 0 ? (
          <div className="delta-pill">
            <img
              src={gameAssets.icons.lightning}
              alt=""
              className="pace-bolt"
              draggable={false}
            />
            {deltaLine}
          </div>
        ) : null}
      </div>

      <div className="results-grid four">
        <div className="mini-stat">
          <span className="stat-label">Score</span>
          <div className="stat-value">
            {summary.correctCount} / {summary.total}
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-label">
            <img
              src={gameAssets.icons.streakFire}
              alt=""
              className="inline-icon"
              draggable={false}
            />
            Longest Streak
          </span>
          <div className="stat-value">{summary.longestStreak}</div>
        </div>
        <div className="mini-stat">
          <span className="stat-label">Avg Answer</span>
          <div className="stat-value">
            {(summary.avgLatencyMs / 1000).toFixed(1)}s
          </div>
        </div>
        <div className="mini-stat">
          <span className="stat-label">
            <img
              src={gameAssets.icons.lightning}
              alt=""
              className="inline-icon"
              draggable={false}
            />
            Faster than Best
          </span>
          <div className="stat-value">
            {summary.deltaVsPreviousBestMs == null
              ? '—'
              : summary.deltaVsPreviousBestMs < 0
                ? `${Math.round(Math.abs(summary.deltaVsPreviousBestMs) / 1000)}s`
                : '—'}
          </div>
        </div>
      </div>

      {summary.factsGettingStronger > 0 ? (
        <div className="mastery-card">
          <span className="stat-label">Multiplication Mastery</span>
          <p>You&apos;re getting stronger!</p>
          <div className="mastery-bar" aria-hidden>
            <span
              style={{
                width: `${Math.min(100, 20 + summary.factsGettingStronger * 4)}%`,
              }}
            />
          </div>
          <strong className="mastery-delta">
            +{Math.min(12, summary.factsGettingStronger)}%
          </strong>
        </div>
      ) : null}

      <div className="results-cta">
        <motion.button
          type="button"
          className="mode-btn mode-quick"
          onClick={onAgain}
          whileTap={{ scale: 0.98 }}
        >
          <span className="mode-copy">
            <span className="mode-title">Play Again</span>
          </span>
        </motion.button>
        <motion.button
          type="button"
          className="mode-btn mode-practice"
          onClick={onAgain}
          whileTap={{ scale: 0.98 }}
        >
          <img
            src={gameAssets.icons.rushFlag}
            alt=""
            className="mode-icon"
            draggable={false}
          />
          <span className="mode-copy">
            <span className="mode-title">{beatLabel}</span>
          </span>
        </motion.button>
        <button type="button" className="text-link" onClick={onHome}>
          Home
        </button>
      </div>
    </section>
  )
}
