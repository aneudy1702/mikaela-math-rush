import { motion } from 'framer-motion'
import type { SessionResultSummary } from '../engine'

interface ResultsScreenProps {
  summary: SessionResultSummary
  onAgain: () => void
  onHome: () => void
}

function formatTime(ms: number): string {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${rem.padStart(4, '0')}` : `${s.toFixed(1)}s`
}

function learningLine(summary: SessionResultSummary): string {
  if (summary.softMisses > 0 && summary.recoveries > 0) {
    return `Came back to ${summary.softMisses} soft miss${summary.softMisses === 1 ? '' : 'es'} — you fixed ${summary.recoveries}.`
  }
  if (summary.factsGettingStronger > 0) {
    return `${summary.factsGettingStronger} fact${summary.factsGettingStronger === 1 ? '' : 's'} getting stronger.`
  }
  return 'Nice work — keep racing yesterday’s you.'
}

export function ResultsScreen({ summary, onAgain, onHome }: ResultsScreenProps) {
  return (
    <section className="results">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1>Session done</h1>
        {(summary.newTimeRecord || summary.newStreakRecord) && (
          <p className="record-banner">
            {summary.newTimeRecord ? 'NEW RECORD' : 'New streak record'}
          </p>
        )}
        <p className="learning-line">{learningLine(summary)}</p>
      </motion.div>

      <div className="results-grid">
        <div>
          <span className="stat-label">Score</span>
          <div className="stat-value">
            {summary.correctCount}/{summary.total}
          </div>
        </div>
        <div>
          <span className="stat-label">Time</span>
          <div className="stat-value">{formatTime(summary.elapsedMs)}</div>
        </div>
        <div>
          <span className="stat-label">Longest streak</span>
          <div className="stat-value">{summary.longestStreak}</div>
        </div>
        <div>
          <span className="stat-label">Avg answer</span>
          <div className="stat-value">
            {(summary.avgLatencyMs / 1000).toFixed(1)}s
          </div>
        </div>
      </div>

      <div className="home-cta">
        <motion.button
          type="button"
          className="btn-primary btn-pulse"
          onClick={onAgain}
          whileTap={{ scale: 0.97 }}
        >
          Play again
        </motion.button>
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={onHome}
          whileTap={{ scale: 0.97 }}
        >
          Home
        </motion.button>
      </div>
    </section>
  )
}
