/**
 * D2 level completion, D4 level-up, D5 placement, D5b start-level inference, and the
 * V2 session summary (T7 → T8).
 */

import type { LevelId } from './curriculum'
import type { BadgeAward, ProgressionEvent, XpBreakdown } from './progression'
import type { RecordEvaluation } from './records'
import type { SessionMode } from './types'

/** Table levels L1–L8: rules R1–R5 (D2). */
export interface TableLevelChecks {
  kind: 'table'
  /** R1: mastered gating ≥ n − a. */
  r1: { n: number; allowance: number; mastered: number; required: number; pass: boolean }
  /** R2: no gating fact struggling. */
  r2: { strugglingGatingFactIds: string[]; pass: boolean }
  /** R3: ≤ RULES.maxStrugglingTableFacts struggling table facts. */
  r3: { strugglingTableFactIds: string[]; pass: boolean }
  /** R4: accuracy over the last RULES.levelAccuracyWindow buffer answers (null when fewer). */
  r4: { answers: number; accuracy: number | null; pass: boolean }
  /** R5: finished sessions at this level. */
  r5: { sessions: number; pass: boolean }
  pass: boolean
}

/** Mixed level L9 (option B + V4). */
export interface MixedLevelChecks {
  kind: 'mixed'
  /** Shortest buffer suffix with ≥ mixedMinAnswers answers and ≥ mixedMinSessions sessions; null if none. */
  window: { answers: number; sessions: number; days: number; accuracy: number } | null
  strugglingFactIds: string[]
  pass: boolean
}

/** Speed level L10 (DEFERRED, D7): never completes this sprint. */
export interface NoCompletionChecks {
  kind: 'none'
  pass: false
}

export type LevelCompletionChecks =
  | TableLevelChecks
  | MixedLevelChecks
  | NoCompletionChecks

/** Session-end advancement (D2 completion + D4 level-up). */
export interface AdvancementResult {
  skillId: string
  levelId: LevelId
  evaluatedAtMs: number
  /** Level was already completed before this evaluation. */
  wasCompleted: boolean
  /** The completion rule passes now. */
  passed: boolean
  /** passed && !wasCompleted — celebrate, +100 XP, Level Mastered badge. */
  newlyCompleted: boolean
  /** Next level unlocked by this completion (null if none/already unlocked). */
  unlockedLevelId: LevelId | null
  /** Current level after level-up (next level on newly completed, else unchanged). */
  currentLevelId: LevelId
  checks: LevelCompletionChecks
  /** Facts whose everMastered flipped during the evaluated session. */
  newlyMasteredFactIds: string[]
  events: ProgressionEvent[]
}

// ---- D5 placement --------------------------------------------------------------------

/** One warm-up question the staircase wants asked next. */
export interface PlacementProbe {
  levelId: LevelId
  factId: string
  isTiebreaker: boolean
  /** 1-based question number within the warm-up (≤ RULES.placementMaxQuestions). */
  questionNumber: number
}

export interface PlacementResult {
  startLevelId: LevelId
  /** Levels below the start counted as passed (unlocked, NOT completed). */
  passedLevelIds: LevelId[]
  probedLevelIds: LevelId[]
  questionsAsked: number
  hitQuestionCap: boolean
  /** Unprobed gating facts of passed levels + all intro facts (success floor only). */
  placementLikelyFactIds: string[]
}

// ---- D5b start-level inference ---------------------------------------------------------

export interface LevelInferenceVerdict {
  levelId: LevelId
  evidenced: boolean
  passes: boolean
  clearlyFails: boolean
}

export type StartLevelOutcome = 'recommend' | 'insufficient' | 'contradictory'

export interface StartLevelInference {
  outcome: StartLevelOutcome
  /** Set when outcome is 'recommend' (L9 if L1–L8 all pass). */
  recommendedLevelId: LevelId | null
  /** L1–L8 in order (walk may stop early). */
  verdicts: LevelInferenceVerdict[]
  /** Raw attempts inside the inferenceMaxAgeDays window that were considered. */
  attemptsConsidered: number
  /** Facts whose recomputed status is mastered (everMastered set silently on apply). */
  masteredFactIds: string[]
}

// ---- V2 session summary ---------------------------------------------------------------

/** D10 session-level visible progress over the current level's table facts. */
export interface MarksProgress {
  /** Σ marks + 3 × mastered at session start. */
  before: number
  after: number
  /** after > before. */
  advanced: boolean
}

/** New V2 result summary (the V1 `SessionResultSummary` stays untouched until T8). */
export interface SessionResultSummaryV2 {
  sessionId: string
  skillId: string
  levelId: LevelId
  mode: SessionMode
  completed: boolean
  elapsedMs: number
  answered: number
  correct: number
  drawAnswers: number
  drawCorrect: number
  /** drawCorrect / drawAnswers (0 when no draw answers). */
  accuracy: number
  longestStreak: number
  isReplay: boolean
  record: RecordEvaluation
  /** D3: pace/best/record moments shown only on completed levels and L10. */
  recordVisible: boolean
  advancement: AdvancementResult
  xp: XpBreakdown
  xpBefore: number
  xpAfter: number
  playerLevelBefore: number
  playerLevelAfter: number
  badgesEarned: BadgeAward[]
  factsMasteredThisSession: string[]
  marks: MarksProgress
  events: ProgressionEvent[]
}
