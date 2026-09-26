import { motion } from 'framer-motion'
import { gameAssets } from '../assets'
import { FactProgress } from '../components/FactProgress'
import { LevelLadder } from '../components/LevelLadder'
import {
  PersistenceBanner,
  type PersistenceNoticeItem,
} from '../components/PersistenceBanner'
import {
  RULES,
  factDisplayValue,
  factStatus,
  getLevel,
  playerLevelInfo,
  recordKey,
  recordKeyId,
  type LearnerProfile,
  type LevelDef,
  type LevelId,
  type LevelProgressFact,
  type SessionMode,
} from '../engine'

export interface StartPrompt {
  kind: 'recommend' | 'warm-up'
  levelId?: LevelId
}

export interface DropDownPrompt {
  fromLevelId: LevelId
  toLevelId: LevelId
}

interface HomeScreenProps {
  profile: LearnerProfile
  levels: readonly LevelDef[]
  notices: readonly PersistenceNoticeItem[]
  persistentWarning?: string | null
  startPrompt?: StartPrompt | null
  dropDownPrompt?: DropDownPrompt | null
  showPracticeNudge: boolean
  muted: boolean
  onToggleMute: () => void
  onQuick: () => void
  onPractice: () => void
  onRush: () => void
  onPlacement: () => void
  onSelectLevel: (levelId: LevelId) => void
  onParentUnlock: (levelId: LevelId) => void
  onDismissNotices: (id: string) => void
  onDismissStartPrompt: () => void
  onAcceptDropDown: () => void
  onDismissDropDown: () => void
  onDismissPracticeNudge: () => void
  onInstallHint?: () => void
  showInstallHint?: boolean
}

const modes = [
  {
    id: 'quick' as const,
    title: 'Quick 10',
    description: '10 questions · A quick learning run',
    icon: gameAssets.icons.lightning,
    className: 'mode-btn mode-quick',
  },
  {
    id: 'practice' as const,
    title: 'Practice 25',
    description: '25 questions · Build fact progress',
    icon: gameAssets.icons.practiceTarget,
    className: 'mode-btn mode-practice',
  },
  {
    id: 'rush' as const,
    title: 'Rush 100',
    description: '100 questions · A bigger challenge',
    icon: gameAssets.icons.rushFlag,
    className: 'mode-btn mode-rush',
  },
]

function formatTime(ms: number | undefined): string {
  if (ms == null) return '—'
  const total = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function progressFor(profile: LearnerProfile, level: LevelDef): LevelProgressFact[] {
  const gating = new Set(level.gatingFactIds)
  return level.tableFactIds.map((factId) => {
    const evidence = profile.progress.factEvidence[factId]
    return {
      factId,
      status: factStatus(evidence),
      displayValue: factDisplayValue(evidence),
      gating: gating.has(factId),
    }
  })
}

function currentVisibleLevel(
  profile: LearnerProfile,
  levels: readonly LevelDef[],
): LevelDef {
  const current = levels.find((level) => level.id === profile.progress.currentLevelId)
  if (current) return current
  const unlocked = new Set(profile.progress.unlockedLevelIds)
  return [...levels].reverse().find((level) => unlocked.has(level.id)) ?? levels[0]!
}

export function HomeScreen({
  profile,
  levels,
  notices,
  persistentWarning,
  startPrompt,
  dropDownPrompt,
  showPracticeNudge,
  muted,
  onToggleMute,
  onQuick,
  onPractice,
  onRush,
  onPlacement,
  onSelectLevel,
  onParentUnlock,
  onDismissNotices,
  onDismissStartPrompt,
  onAcceptDropDown,
  onDismissDropDown,
  onDismissPracticeNudge,
  onInstallHint,
  showInstallHint,
}: HomeScreenProps) {
  const visibleLevels = levels.filter((level) => level.kind !== 'speed')
  const currentLevel = currentVisibleLevel(profile, visibleLevels)
  const facts = progressFor(profile, currentLevel)
  const player = playerLevelInfo(profile.player.xp)
  const playerPercent = player.levelSpan > 0
    ? Math.min(100, (player.xpIntoLevel / player.levelSpan) * 100)
    : 0
  const currentCompleted = profile.progress.completedLevelIds.includes(currentLevel.id)
  const modeStarts: Record<SessionMode, () => void> = {
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
              <img src={gameAssets.icons.lightning} alt="" className="brand-bolt" draggable={false} />
            </span>
          </h1>
          <p className="home-lead">Grow your fact power, one run at a time.</p>
        </div>
        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="home-runner compact"
          draggable={false}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <button
          type="button"
          className="mute-btn"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MuteIcon /> : <SoundIcon />}
        </button>
      </header>

      <PersistenceBanner
        notices={notices}
        persistentWarning={persistentWarning}
        onDismiss={onDismissNotices}
      />

      {startPrompt ? (
        <aside className="home-prompt start-prompt" aria-label="Starting level suggestion">
          <div>
            <span className="section-eyebrow">Welcome back</span>
            <h2>
              {startPrompt.kind === 'recommend' && startPrompt.levelId
                ? `We picked Level ${getLevel(startPrompt.levelId).index} for you`
                : 'Want help choosing a level?'}
            </h2>
            <p>
              {startPrompt.kind === 'recommend'
                ? 'You can start here, choose a lower unlocked level, or recalibrate with the warm-up.'
                : 'A short optional warm-up can find a comfortable place to begin.'}
            </p>
          </div>
          <div className="prompt-actions">
            <button type="button" className="small-action" onClick={onPlacement}>Try warm-up</button>
            <button type="button" className="text-link" onClick={onDismissStartPrompt}>Not now</button>
          </div>
        </aside>
      ) : null}

      {dropDownPrompt ? (
        <aside className="home-prompt drop-down-prompt" aria-label="Level suggestion">
          <div>
            <span className="section-eyebrow">A gentler option</span>
            <h2>Want to try Level {getLevel(dropDownPrompt.toLevelId).index}?</h2>
            <p>You can switch for now, or stay right where you are.</p>
          </div>
          <div className="prompt-actions">
            <button type="button" className="small-action" onClick={onAcceptDropDown}>Try it</button>
            <button type="button" className="text-link" onClick={onDismissDropDown}>Stay here</button>
          </div>
        </aside>
      ) : null}

      <div className="home-dashboard">
        <main className="home-main">
          <section className="player-card" aria-label="Player progress">
            <div className="player-level-medallion">{player.level}</div>
            <div className="player-card-copy">
              <span className="section-eyebrow">Player level {player.level}</span>
              <h2>{player.title}</h2>
              <div className="xp-track" aria-label={`${player.xpIntoLevel} of ${player.levelSpan} XP toward the next player level`}>
                <span style={{ width: `${playerPercent}%` }} />
              </div>
              <p>{player.xpIntoLevel} XP in this level · {player.xpToNext} to go</p>
            </div>
            <div className="daily-streak">
              <img src={gameAssets.icons.streakFire} alt="" draggable={false} />
              <strong>{profile.dailyStreak}</strong>
              <span>day streak</span>
            </div>
          </section>

          {showPracticeNudge ? (
            <aside className="practice-nudge">
              <img src={gameAssets.icons.practiceTarget} alt="" draggable={false} />
              <div>
                <strong>Want to build progress faster?</strong>
                <p>Practice gives these facts a little more time.</p>
              </div>
              <button type="button" className="nudge-practice" onClick={onPractice}>Practice</button>
              <button
                type="button"
                className="nudge-dismiss"
                onClick={onDismissPracticeNudge}
                aria-label="Dismiss practice suggestion"
              >
                ×
              </button>
            </aside>
          ) : null}

          <section className="home-modes" aria-labelledby="choose-run-title">
            <div className="section-heading-row">
              <div>
                <span className="section-eyebrow">Ready?</span>
                <h2 id="choose-run-title">Choose a run</h2>
              </div>
            </div>
            {modes.map((mode) => (
              <motion.button
                key={mode.id}
                type="button"
                className={mode.className}
                onClick={modeStarts[mode.id]}
                whileTap={{ scale: 0.98 }}
              >
                <img src={mode.icon} alt="" className="mode-icon" draggable={false} />
                <span className="mode-copy">
                  <span className="mode-title">{mode.title}</span>
                  <span className="mode-desc">{mode.description}</span>
                </span>
                <Chevron />
              </motion.button>
            ))}
          </section>

          <button type="button" className="warm-up-entry" onClick={onPlacement}>
            <img src={gameAssets.icons.practiceTarget} alt="" draggable={false} />
            <span>
              <strong>{profile.placementComplete ? 'Retake warm-up' : 'Try the optional warm-up'}</strong>
              <small>No timer, no score · find a comfortable level</small>
            </span>
            <Chevron />
          </button>

          <section className="current-level-card" aria-labelledby="current-level-title">
            <div className="section-heading-row">
              <div>
                <span className="section-eyebrow">Current level · {currentLevel.id}</span>
                <h2 id="current-level-title">{currentLevel.title}</h2>
              </div>
              {currentCompleted ? <span className="complete-chip">Completed</span> : null}
            </div>
            <FactProgress facts={facts} />
          </section>

          {currentCompleted ? (
            <section className="records-card" aria-labelledby="records-title">
              <div className="section-heading-row">
                <div>
                  <span className="section-eyebrow">Personal records</span>
                  <h2 id="records-title">{currentLevel.id} best times</h2>
                </div>
                <img src={gameAssets.icons.trophy} alt="" draggable={false} />
              </div>
              <div className="record-grid">
                {modes.map((mode) => {
                  const key = recordKeyId(
                    recordKey(profile.progress.skillId, currentLevel.id, mode.id, RULES.rulesVersion),
                  )
                  return (
                    <div key={mode.id}>
                      <span>{mode.title}</span>
                      <strong>{formatTime(profile.records[key]?.bestMs)}</strong>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="ladder-card" aria-labelledby="ladder-title">
          <div className="section-heading-row">
            <div>
              <span className="section-eyebrow">Your path</span>
              <h2 id="ladder-title">Level ladder</h2>
            </div>
          </div>
          <LevelLadder
            levels={visibleLevels}
            currentLevelId={currentLevel.id}
            unlockedLevelIds={profile.progress.unlockedLevelIds}
            completedLevelIds={profile.progress.completedLevelIds}
            onSelect={onSelectLevel}
            onParentUnlock={onParentUnlock}
          />
        </aside>
      </div>

      {showInstallHint ? (
        <button type="button" className="install-hint" onClick={onInstallHint}>
          <ShareIcon /> Add to Home Screen
        </button>
      ) : (
        <p className="install-hint static"><ShareIcon /> Add to Home Screen</p>
      )}
    </section>
  )
}

function Chevron() {
  return (
    <svg className="mode-chevron" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M16.5 12a4.5 4.5 0 0 0-1.3-3.2l1.1-1.1A6 6 0 0 1 18 12c0 .9-.2 1.7-.5 2.5l-1.1-1.1c.2-.4.3-.9.3-1.4ZM4.3 3.7 3 5l3.4 3.4H3v7h4l5 4v-6.6l4.7 4.7a6 6 0 0 1-1.5 1l1.1 1.1A7.8 7.8 0 0 0 19 15.2l2 2 1.3-1.3L4.3 3.7ZM14 7.2v-.7l-2.1 1.7L14 7.2Z" />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8.8v6.4a4.5 4.5 0 0 0 2.5-3.2ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path fill="currentColor" d="M12 3v10h-1.5V6.2L6.7 10 5.6 8.9 12 2.5l6.4 6.4-1.1 1.1-3.8-3.8V13H12V3ZM5 14v5h14v-5h1.5v6.5H3.5V14H5Z" />
    </svg>
  )
}
