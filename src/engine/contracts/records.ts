/** D3 — personal records and the per-session log. */

import type { LevelId } from './curriculum'
import type { SessionMode } from './types'

/** Records never compare across skill, level, mode or rulesVersion. */
export interface RecordKey {
  skillId: string
  levelId: LevelId
  mode: SessionMode
  rulesVersion: number
}

/** Frozen string form used as the key of `LearnerProfile.records`. */
export function recordKeyId(key: RecordKey): string {
  return `${key.skillId}|${key.levelId}|${key.mode}|v${key.rulesVersion}`
}

/**
 * Personal record at one key. Baseline semantics: the first eligible run sets
 * `baselineMs` and `bestMs` together and is NOT a "new record" moment (no XP, no badge).
 * Later eligible runs faster than `bestMs` beat the record.
 */
export interface PersonalRecord {
  key: RecordKey
  baselineMs: number
  baselineAtMs: number
  baselineSessionId: string
  /** Fastest eligible real elapsed time. Equals baselineMs until first beaten. */
  bestMs: number
  bestAtMs: number
  bestSessionId: string
  eligibleRuns: number
  /** Times the record was beaten (baseline excluded). */
  timesBeaten: number
}

/** Outcome of checking one finished session against its record key. */
export interface RecordEvaluation {
  key: RecordKey
  /** Run completed and draw accuracy ≥ RULES.recordMinAccuracy. */
  eligible: boolean
  /** First eligible run at this key. */
  isBaseline: boolean
  /** Eligible, not baseline, and faster than the previous best. */
  isNewRecord: boolean
  previousBestMs: number | null
  elapsedMs: number
}

/** One finished (or abandoned) v2 session, summarized. Log capped by SPEC_CONSTANTS.sessionLogMax. */
export interface SessionLogEntry {
  sessionId: string
  skillId: string
  levelId: LevelId
  mode: SessionMode
  rulesVersion: number
  startedAtMs: number
  endedAtMs: number
  /** Real elapsed gameplay time (visibility pauses excluded). Used for records. */
  elapsedMs: number
  /** Local calendar day key of `endedAtMs`. */
  dayKey: string
  /** Every question of the run was answered. */
  completed: boolean
  /** All answered questions (every source). */
  answered: number
  correct: number
  /** Answers with source `draw` (record eligibility, perfect session). */
  drawAnswers: number
  drawCorrect: number
  longestStreak: number
  /** The level was already completed before this session started. */
  isReplay: boolean
}
