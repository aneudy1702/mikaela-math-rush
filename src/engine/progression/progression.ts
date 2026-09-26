import type {
  BadgeAward,
  BadgeDef,
  BadgeId,
  LearnerProfile,
  LevelId,
  PlayerProgress,
  ProgressionEvent,
  SessionLogEntry,
  SkillProgress,
  XpBreakdown,
  XpContext,
} from '../contracts'
import { RULES, SPEC_CONSTANTS, levelIndexOf } from '../contracts'

/**
 * D6 player progression: XP, player level, titles and badges.
 *
 * Every function here is pure. Progression reads session summaries, curriculum status
 * (unlocked / completed level IDs), player state and typed events only. It never reads
 * or writes academic mastery fields (fact evidence, evidence buffers, v1 `facts`).
 */

/** Session IDs reconstructed by v1 migration (mirrors persistence's INFERRED_SESSION_PREFIX). */
const INFERRED_SESSION_PREFIX = 'v1-inferred-'

const ZERO_XP: XpBreakdown = Object.freeze({
  perCorrect: 0,
  completionBonus: 0,
  perfectBonus: 0,
  factMastered: 0,
  levelCompleted: 0,
  recordBeaten: 0,
  total: 0,
})

function nonNegInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** Perfect session: completed, at least one draw answer, and every draw answer correct. */
function isPerfectSession(entry: SessionLogEntry): boolean {
  return (
    entry.completed &&
    entry.drawAnswers > 0 &&
    entry.drawCorrect === entry.drawAnswers
  )
}

/**
 * XP earned by one session (D6).
 *
 * - Per correct: +1 on an uncompleted level; ⌊correct / 5⌋ on a completed level.
 * - Completion bonus (finished sessions only): Quick 10 · Practice 25 · Rush 100; × 0.2 on
 *   completed levels except the first finish of that level+mode.
 * - Perfect session: + ⌊50% of the bonus paid⌋.
 * - One-time: +5 per newly `everMastered` fact; +100 when the level is completed by play
 *   (never on a level that was already completed).
 * - Record beaten (not baseline) on the progress level: +25, when today's record XP is
 *   still available (`isRecordXpAvailableToday`).
 *
 * Placement, inference and migration earn 0: never call this for them. As a guard,
 * sessions reconstructed by migration (`v1-inferred-…`) always earn 0.
 */
export function xpForSession(
  entry: SessionLogEntry,
  ctx: XpContext,
): XpBreakdown {
  if (entry.sessionId.startsWith(INFERRED_SESSION_PREFIX)) return { ...ZERO_XP }
  const x = RULES.xp
  const completedLevel = ctx.levelCompletedBefore
  const correct = nonNegInt(entry.correct)

  const perCorrect = completedLevel
    ? Math.floor(correct / x.completedLevelCorrectPerXp)
    : correct * x.perCorrect

  let completionBonus = 0
  if (entry.completed) {
    const full = x.completionBonus[entry.mode]
    completionBonus =
      completedLevel && !ctx.firstFinishLevelMode
        ? Math.round(full * x.completedLevelBonusMultiplier)
        : full
  }

  const perfectBonus = isPerfectSession(entry)
    ? Math.floor(completionBonus * x.perfectBonusFraction)
    : 0

  const factMastered = nonNegInt(ctx.newlyMasteredFacts) * x.factMastered

  const levelCompleted =
    ctx.levelCompletedNow && !completedLevel ? x.levelCompleted : 0

  const recordBeaten =
    ctx.recordBeaten && ctx.isProgressLevel && ctx.recordXpAvailableToday
      ? x.recordBeaten
      : 0

  return {
    perCorrect,
    completionBonus,
    perfectBonus,
    factMastered,
    levelCompleted,
    recordBeaten,
    total:
      perCorrect +
      completionBonus +
      perfectBonus +
      factMastered +
      levelCompleted +
      recordBeaten,
  }
}

/**
 * Whether record-beaten XP can still be paid on `dayKey` (D6: at most
 * `RULES.xp.recordBeatenMaxPerDay` (1) per calendar day overall). Feeds
 * `XpContext.recordXpAvailableToday`.
 */
export function isRecordXpAvailableToday(
  player: PlayerProgress,
  dayKey: string,
): boolean {
  return player.lastRecordXpDayKey !== dayKey
}

/** Total XP needed to reach player level `level`: 25·L·(L−1). Level ≤ 1 → 0. */
export function xpToReachLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 1) return 0
  const l = Math.floor(level)
  return RULES.xp.levelCurveFactor * l * (l - 1)
}

/**
 * Player level for a total XP: the largest L with 25·L·(L−1) ≤ xp (minimum 1).
 * Same definition as the v1 → v2 migration.
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1
  const f = RULES.xp.levelCurveFactor
  // Closed-form estimate, then correct for floating-point error.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / f)) / 2))
  while (level > 1 && xpToReachLevel(level) > xp) level--
  while (xpToReachLevel(level + 1) <= xp) level++
  return level
}

/** Title for a player level (SPEC_CONSTANTS.playerTitles). */
export function titleForLevel(level: number): string {
  const titles = SPEC_CONSTANTS.playerTitles
  let title = titles[0].title
  for (const t of titles) {
    if (level >= t.minLevel) title = t.title
  }
  return title
}

export interface PlayerLevelInfo {
  level: number
  title: string
  /** XP earned since reaching `level`. */
  xpIntoLevel: number
  /** XP still needed to reach `level + 1`. */
  xpToNext: number
  /** XP span of the current level (xpToReachLevel(level + 1) − xpToReachLevel(level)). */
  levelSpan: number
}

/** Player level, title and progress within the level for a total XP. */
export function playerLevelInfo(xp: number): PlayerLevelInfo {
  const total = Number.isFinite(xp) && xp > 0 ? xp : 0
  const level = levelForXp(total)
  const start = xpToReachLevel(level)
  const next = xpToReachLevel(level + 1)
  return {
    level,
    title: titleForLevel(level),
    xpIntoLevel: total - start,
    xpToNext: next - total,
    levelSpan: next - start,
  }
}

/** D6 "progress level": the lowest unlocked level not yet completed (null if none). */
export function progressLevelId(progress: SkillProgress): LevelId | null {
  const completed = new Set(progress.completedLevelIds)
  let best: LevelId | null = null
  let bestIndex = Infinity
  for (const id of progress.unlockedLevelIds) {
    if (completed.has(id)) continue
    const index = levelIndexOf(id)
    if (index < bestIndex) {
      bestIndex = index
      best = id
    }
  }
  return best
}

const BADGE_DEFS: readonly BadgeDef[] = Object.freeze(
  (
    [
      {
        id: 'first-run',
        title: 'First Run',
        description: 'Finish any session.',
        perLevel: false,
      },
      {
        id: 'hot-streak',
        title: 'Hot Streak',
        description: `${SPEC_CONSTANTS.hotStreakCorrectInRow} correct in a row.`,
        perLevel: false,
      },
      {
        id: 'on-fire',
        title: 'On Fire',
        description: `${SPEC_CONSTANTS.onFireCorrectInRow} correct in a row.`,
        perLevel: false,
      },
      {
        id: 'perfect-session',
        title: 'Perfect Session',
        description: 'Finish a session with every answer correct.',
        perLevel: false,
      },
      {
        id: 'level-mastered',
        title: 'Level Mastered',
        description: 'Complete a level by playing it.',
        perLevel: true,
      },
      {
        id: 'comeback-kid',
        title: 'Comeback Kid',
        description:
          'Get a fact right the first time in a new session after missing it before.',
        perLevel: false,
      },
      {
        id: 'record-breaker',
        title: 'Record Breaker',
        description: `Beat your own record ${SPEC_CONSTANTS.recordBreakerRecords} times.`,
        perLevel: false,
      },
      {
        id: 'three-day-streak',
        title: '3-Day Streak',
        description: `Play ${SPEC_CONSTANTS.dayStreakBadgeDays} days in a row.`,
        perLevel: false,
      },
      {
        id: 'speedster',
        title: 'Speedster',
        description: 'Beat your own record on a completed level.',
        perLevel: false,
      },
    ] satisfies BadgeDef[]
  ).map((d) => Object.freeze(d)),
)

/** Static badge catalogue (D6). */
export function getBadgeDefs(): readonly BadgeDef[] {
  return BADGE_DEFS
}

/** Previous calendar day of a `YYYY-MM-DD` key (null when malformed). */
function previousDayKey(dayKey: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Daily streak including `entry`'s day. Works whether or not `profile` already
 * reflects the session (same-day → unchanged; yesterday → +1; otherwise 1).
 */
function streakIncludingDay(profile: LearnerProfile, dayKey: string): number {
  const last = profile.lastPlayDayKey
  const streak = nonNegInt(profile.dailyStreak)
  if (last === dayKey) return Math.max(1, streak)
  if (last !== null && last === previousDayKey(dayKey)) return streak + 1
  return 1
}

/**
 * Badges newly earned by a session (D6). Idempotent: badges already in
 * `profile.player.badges` are never returned again (`level-mastered` once per level).
 *
 * `profile` is the state before this session's player updates are applied (in particular
 * `player.recordsBeaten` does not yet include this session's `record-beaten` events).
 * Badges carry no XP. Sessions reconstructed by migration earn no badges.
 */
export function evaluateBadges(
  profile: LearnerProfile,
  entry: SessionLogEntry,
  events: readonly ProgressionEvent[],
): BadgeAward[] {
  if (entry.sessionId.startsWith(INFERRED_SESSION_PREFIX)) return []

  const owned = new Set<string>()
  for (const b of profile.player.badges) {
    owned.add(b.badgeId === 'level-mastered' ? `${b.badgeId}|${b.levelId ?? ''}` : b.badgeId)
  }

  const awards: BadgeAward[] = []
  const award = (badgeId: BadgeId, levelId?: LevelId): void => {
    const key = badgeId === 'level-mastered' ? `${badgeId}|${levelId ?? ''}` : badgeId
    if (owned.has(key)) return
    owned.add(key)
    const a: BadgeAward = {
      badgeId,
      awardedAtMs: entry.endedAtMs,
      sessionId: entry.sessionId,
    }
    if (levelId !== undefined) a.levelId = levelId
    awards.push(a)
  }

  // Only this session's events count.
  const sessionEvents = events.filter(
    (e) => e.sessionId === null || e.sessionId === entry.sessionId,
  )

  if (entry.completed) award('first-run')
  if (entry.longestStreak >= SPEC_CONSTANTS.hotStreakCorrectInRow) award('hot-streak')
  if (entry.longestStreak >= SPEC_CONSTANTS.onFireCorrectInRow) award('on-fire')
  if (isPerfectSession(entry)) award('perfect-session')

  let recordsBeatenNow = 0
  for (const e of sessionEvents) {
    switch (e.type) {
      case 'level-completed':
        award('level-mastered', e.levelId)
        break
      case 'fact-comeback':
        if (e.missedInSessionId !== entry.sessionId) award('comeback-kid')
        break
      case 'record-beaten':
        recordsBeatenNow++
        if (e.levelCompleted) award('speedster')
        break
      default:
        break
    }
  }

  if (
    nonNegInt(profile.player.recordsBeaten) + recordsBeatenNow >=
    SPEC_CONSTANTS.recordBreakerRecords
  ) {
    award('record-breaker')
  }

  if (
    entry.completed &&
    streakIncludingDay(profile, entry.dayKey) >= SPEC_CONSTANTS.dayStreakBadgeDays
  ) {
    award('three-day-streak')
  }

  return awards
}
