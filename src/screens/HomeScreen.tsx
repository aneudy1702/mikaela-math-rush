import { motion } from 'framer-motion'
import { gameAssets } from '../assets'

interface HomeScreenProps {
  bestQuick: string
  dailyStreak: number
  muted: boolean
  needsPlacement: boolean
  onToggleMute: () => void
  onQuick: () => void
  onPractice: () => void
  onRush: () => void
  onPlacement: () => void
  onInstallHint?: () => void
  showInstallHint?: boolean
}

const modes = [
  {
    id: 'quick' as const,
    title: 'Quick 10',
    description: '10 questions • Beat your best time',
    icon: gameAssets.icons.lightning,
    className: 'mode-btn mode-quick',
  },
  {
    id: 'practice' as const,
    title: 'Practice 25',
    description: '25 questions • Build your skills',
    icon: gameAssets.icons.practiceTarget,
    className: 'mode-btn mode-practice',
  },
  {
    id: 'rush' as const,
    title: 'Rush 100',
    description: '100 questions • For a real challenge',
    icon: gameAssets.icons.rushFlag,
    className: 'mode-btn mode-rush',
  },
]

export function HomeScreen({
  bestQuick,
  dailyStreak,
  muted,
  needsPlacement,
  onToggleMute,
  onQuick,
  onPractice,
  onRush,
  onPlacement,
  onInstallHint,
  showInstallHint,
}: HomeScreenProps) {
  const starters = {
    quick: onQuick,
    practice: onPractice,
    rush: onRush,
  }

  return (
    <section className="home">
      <div className="home-stars" aria-hidden />

      <header className="home-header">
        <div className="home-title-block">
          <h1 className="brand">
            <span className="brand-mikaela">Mikaela</span>
            <span className="brand-math">Math</span>
            <span className="brand-rush">
              Rush
              <img
                src={gameAssets.icons.lightning}
                alt=""
                className="brand-bolt"
                draggable={false}
              />
            </span>
          </h1>
          <p className="home-lead">Beat your best time</p>
        </div>
        <button
          type="button"
          className="mute-btn"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <MuteIcon />
          ) : (
            <SoundIcon />
          )}
        </button>
      </header>

      <motion.img
        src={gameAssets.characters.runner}
        alt=""
        className="home-runner"
        draggable={false}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: [0, -6, 0] }}
        transition={{
          opacity: { duration: 0.45 },
          y: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
        }}
      />

      <div className="home-stats">
        <div className="stat-card stat-best">
          <img
            src={gameAssets.icons.trophy}
            alt=""
            className="stat-icon"
            draggable={false}
          />
          <div>
            <span className="stat-label">Best Time</span>
            <strong className="stat-value cyan">{bestQuick}</strong>
          </div>
        </div>
        <div className="stat-card stat-streak">
          <img
            src={gameAssets.icons.streakFire}
            alt=""
            className="stat-icon"
            draggable={false}
          />
          <div>
            <span className="stat-label">Current Streak</span>
            <strong className="stat-value hot">
              {dailyStreak > 0 ? `${dailyStreak} day${dailyStreak === 1 ? '' : 's'}` : '—'}
            </strong>
          </div>
        </div>
      </div>

      <div className="home-modes">
        {needsPlacement ? (
          <motion.button
            type="button"
            className="mode-btn mode-quick"
            onClick={onPlacement}
            whileTap={{ scale: 0.98 }}
          >
            <img
              src={gameAssets.icons.lightning}
              alt=""
              className="mode-icon"
              draggable={false}
            />
            <span className="mode-copy">
              <span className="mode-title">Placement Run</span>
              <span className="mode-desc">Quick warm-up · map your facts</span>
            </span>
            <Chevron />
          </motion.button>
        ) : (
          modes.map((m) => (
            <motion.button
              key={m.id}
              type="button"
              className={m.className}
              onClick={starters[m.id]}
              whileTap={{ scale: 0.98 }}
            >
              <img
                src={m.icon}
                alt=""
                className="mode-icon"
                draggable={false}
              />
              <span className="mode-copy">
                <span className="mode-title">{m.title}</span>
                <span className="mode-desc">{m.description}</span>
              </span>
              <Chevron />
            </motion.button>
          ))
        )}
      </div>

      {showInstallHint ? (
        <button type="button" className="install-hint" onClick={onInstallHint}>
          <ShareIcon />
          Add to Home Screen
        </button>
      ) : (
        <p className="install-hint static">
          <ShareIcon />
          Add to Home Screen
        </p>
      )}
    </section>
  )
}

function Chevron() {
  return (
    <svg className="mode-chevron" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M16.5 12a4.5 4.5 0 0 0-1.3-3.2l1.1-1.1A6 6 0 0 1 18 12c0 .9-.2 1.7-.5 2.5l-1.1-1.1c.2-.4.3-.9.3-1.4ZM4.3 3.7 3 5l3.4 3.4H3v7h4l5 4v-6.6l4.7 4.7a6 6 0 0 1-1.5 1l1.1 1.1A7.8 7.8 0 0 0 19 15.2l2 2 1.3-1.3L4.3 3.7ZM14 7.2v-.7l-2.1 1.7L14 7.2Z"
      />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.8v6.4a4.5 4.5 0 0 0 2.5-3.2ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3v10h-1.5V6.2L6.7 10 5.6 8.9 12 2.5l6.4 6.4-1.1 1.1-3.8-3.8V13H12V3ZM5 14v5h14v-5h1.5v6.5H3.5V14H5Z"
      />
    </svg>
  )
}
