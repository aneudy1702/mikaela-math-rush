import { motion } from 'framer-motion'

interface HomeScreenProps {
  bestQuick: string
  muted: boolean
  onToggleMute: () => void
  onQuick: () => void
  onPractice: () => void
}

export function HomeScreen({
  bestQuick,
  muted,
  onToggleMute,
  onQuick,
  onPractice,
}: HomeScreenProps) {
  return (
    <section className="home">
      <div className="home-atmosphere" aria-hidden />
      <motion.div
        className="home-copy"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="brand">
          Mikaela
          <span>Math Rush</span>
        </h1>
        <p className="home-lead">
          Beat the clock. Soft misses come back later. Streaks earn the fireworks.
        </p>
        <div className="home-cta">
          <motion.button
            type="button"
            className="btn-primary"
            onClick={onQuick}
            whileTap={{ scale: 0.97 }}
          >
            Quick Play · 10
          </motion.button>
          <motion.button
            type="button"
            className="btn-secondary"
            onClick={onPractice}
            whileTap={{ scale: 0.97 }}
          >
            Practice · 25
          </motion.button>
        </div>
        <div className="home-meta">
          <span>
            Best Quick: <strong>{bestQuick}</strong>
          </span>
          <button
            type="button"
            className="mute-btn"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? 'Muted' : 'Sound'}
          </button>
        </div>
      </motion.div>
    </section>
  )
}
