import type {
  BadgeAward,
  BadgeDef,
  LearnerProfile,
  LevelId,
  ProgressionEvent,
  SessionLogEntry,
  SkillProgress,
  XpBreakdown,
  XpContext,
} from '../contracts'

/**
 * T3 implements every function in this file (D6). Stubs throw until then.
 * Progression reads status and events only; it never writes academic fields.
 */

/** XP earned by one session (D6). Placement, inference and migration earn 0 (never call this for them). */
export function xpForSession(
  entry: SessionLogEntry,
  ctx: XpContext,
): XpBreakdown {
  void entry
  void ctx
  throw new Error('not implemented: xpForSession')
}

/** Player level for a total XP (XP to reach L = RULES.xp.levelCurveFactor·L·(L−1)). */
export function levelForXp(xp: number): number {
  void xp
  throw new Error('not implemented: levelForXp')
}

/** Total XP needed to reach player level `level`. */
export function xpToReachLevel(level: number): number {
  void level
  throw new Error('not implemented: xpToReachLevel')
}

/** Title for a player level (SPEC_CONSTANTS.playerTitles). */
export function titleForLevel(level: number): string {
  void level
  throw new Error('not implemented: titleForLevel')
}

/** D6 "progress level": the lowest unlocked level not yet completed (null if none). */
export function progressLevelId(progress: SkillProgress): LevelId | null {
  void progress
  throw new Error('not implemented: progressLevelId')
}

/** Static badge catalogue (D6). */
export function getBadgeDefs(): readonly BadgeDef[] {
  throw new Error('not implemented: getBadgeDefs')
}

/**
 * Badges newly earned by a session. Idempotent: badges already in
 * `profile.player.badges` are never returned again.
 */
export function evaluateBadges(
  profile: LearnerProfile,
  entry: SessionLogEntry,
  events: readonly ProgressionEvent[],
): BadgeAward[] {
  void profile
  void entry
  void events
  throw new Error('not implemented: evaluateBadges')
}
