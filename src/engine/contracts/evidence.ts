/**
 * D2 / D11 — raw attempt log (persisted source of truth) and the derived evidence view.
 *
 * The raw log keeps every answered question. The evidence view (counted attempts,
 * per-fact status inputs, per-level evidence buffers) is a pure function of the raw
 * log + RULES and may be cached, but must always be recomputable from the raw log.
 */

import type { LevelId } from './curriculum'
import type { SessionMode } from './types'

/** D2 fact status (L1–L9). Latency is never an input. Kid-facing "struggling" = "practicing". */
export type FactStatus = 'new' | 'learning' | 'mastered' | 'struggling'

/** Where a question came from. There is no `confirm` source (removed in revision 4). */
export type AttemptSource = 'draw' | 'reintroduce' | 'later-check' | 'placement'

/**
 * One answered question (D11). Every attempt is a first answer (no retype step).
 * Questions discarded on hide are NOT attempts (see SessionRecord.discardedOnHide).
 */
export interface RawAttempt {
  /** Canonical fact ID (D9). Live multiplication evidence is still keyed by this. */
  factId: string
  /**
   * Semantic question instance. Absent on V2 attempts; counting then uses `factId`.
   * The V2 raw-log codec does not store this yet. New in-memory attempts set it.
   */
  instanceKey?: string
  /** Selected choice, when the question offered choices. */
  selectedChoiceId?: string
  /** Misconception of that choice, when it had one. */
  misconceptionId?: string
  /** Presented orientation "a × b". null only for migrated v1 attempts (unknown). */
  a: number | null
  b: number | null
  correct: boolean
  /** Numeric answer given. null when unknown (migrated v1) or not a finite number. */
  given: number | null
  latencyMs: number
  /** Wall-clock time the answer was submitted. */
  atMs: number
  sessionId: string
  /** True only for sessions reconstructed by v1 migration (D5b step 2). */
  sessionInferred: boolean
  /** Level the session was played at. null for migrated v1 attempts. */
  levelId: LevelId | null
  /** null for migrated v1 attempts (mode unknown). */
  mode: SessionMode | null
  source: AttemptSource
  /** The session replayed an already completed level. */
  isReplay: boolean
}

export type SessionKind = 'play' | 'placement'

/**
 * How a session ended. `inferred` = reconstructed by migration (unknown).
 * null = still running.
 */
export type SessionEndReason = 'finished' | 'abandoned' | 'inferred'

export interface SessionPause {
  startedAtMs: number
  /** null while the pause is open. */
  endedAtMs: number | null
}

/** A question that was on screen when the app was hidden; not counted, not logged as an attempt (D3). */
export interface DiscardedQuestion {
  factId: string
  shownAtMs: number
  discardedAtMs: number
}

/** Session record in the raw log (D11). v2 session IDs are authoritative. */
export interface SessionRecord {
  id: string
  kind: SessionKind
  startedAtMs: number
  endedAtMs: number | null
  /** null only for inferred (migrated) sessions. */
  mode: SessionMode | null
  levelId: LevelId | null
  inferred: boolean
  endReason: SessionEndReason | null
  isReplay: boolean
  /** Visibility pauses (clock paused while hidden). */
  pauses: SessionPause[]
  discardedOnHide: DiscardedQuestion[]
}

/** Persisted raw history. Attempts in append (chronological) order. */
export interface RawLog {
  attempts: RawAttempt[]
  sessions: SessionRecord[]
}

/** One counted attempt inside W (last `RULES.windowSize` counted attempts). */
export interface EvidenceWindowEntry {
  correct: boolean
  sessionId: string
  sessionInferred: boolean
  atMs: number
}

/**
 * Derived per-fact evidence (cache; recomputable from the raw log except the two
 * flags noted below). Holds exactly the inputs D2 status, D2 likely-correct, D10 marks
 * and stage-2 fluency need.
 */
export interface FactEvidence {
  factId: string
  /** |C| — counted attempts so far. */
  countedAttempts: number
  /** Correct attempts in C (fast-track needs countedCorrect === countedAttempts). */
  countedCorrect: number
  /** W — last ≤ RULES.windowSize counted attempts, oldest first. */
  window: EvidenceWindowEntry[]
  /**
   * S(C) — distinct session IDs containing a correct counted attempt, oldest first.
   * May be truncated to the most recent entries; only `length ≥ minDistinctSessionsForMastery` is read.
   */
  correctSessionIds: string[]
  /** Some session in S(C) (full history, never truncated) is not inferred (fast-track rule (a)). */
  liveCorrectSession: boolean
  /** Last ≤ RULES.fluencySlowness.sampleSize correct latencies (any source). Stage-2 selection only. */
  recentCorrectLatenciesMs: number[]
  lastAttemptAtMs: number | null
  /** Set the first time status becomes mastered; never unset (D2). Carried across rebuilds. */
  everMastered: boolean
  /** Placement hint for the success floor only (D5); cleared on the fact's first counted attempt. Carried across rebuilds. */
  placementLikely: boolean
}

/** D2 per-level evidence buffer entry: counted attempts with source `draw` at that level. */
export interface EvidenceBufferEntry {
  factId: string
  correct: boolean
  sessionId: string
  /** Local calendar day key YYYY-MM-DD of the attempt. */
  dayKey: string
}

/** Where a level unlock came from. */
export type UnlockReason = 'start' | 'completion' | 'placement' | 'inference' | 'parent'

/** Per-skill curriculum position + derived evidence view. */
export interface SkillProgress {
  skillId: string
  currentLevelId: LevelId
  unlockedLevelIds: LevelId[]
  /** Completed by play only (placement/inference unlock, never complete). */
  completedLevelIds: LevelId[]
  /** Start level recommended by the placement warm-up (D5), if taken. */
  placementStartLevelId?: LevelId
  /** Start level recommended by v1 inference (D5b), if any. */
  inferredStartLevelId?: LevelId
  /** Canonical fact ID → evidence. Missing entry = status new. */
  factEvidence: Record<string, FactEvidence>
  /** levelId → last RULES.evidenceBufferMax entries (R4 and L9 read only this). */
  evidence: Record<LevelId, EvidenceBufferEntry[]>
  /** levelId → finished (endReason 'finished', kind 'play') sessions at that level (R5). */
  finishedSessionsByLevel: Record<LevelId, number>
  /**
   * True when `factEvidence` / `evidence` must be rebuilt from the raw log before use
   * (set by v1 migration; the raw log holds attempts not yet reflected in the caches).
   */
  evidenceStale: boolean
}
