/**
 * Learner profile — V1 (legacy, read only for migration) and V2 (current).
 *
 * V2 is persisted under a new storage key; the V1 blob is never written or deleted
 * (it stays as a backup). See persistence/ for loading order and migration.
 */

import type { SkillProgress, RawLog } from './evidence'
import type { PlayerProgress } from './progression'
import type { PersonalRecord, SessionLogEntry } from './records'
import type {
  FactRecord,
  PendingReinforcement,
  SessionMode,
} from './types'

/** Exact V1 shape as persisted under `mikaela-math-rush:learner-v1`. */
export interface LearnerProfileV1 {
  version: 1
  learnerName: string
  createdAtMs: number
  updatedAtMs: number
  placementComplete: boolean
  facts: Record<string, FactRecord>
  bestTimeMsByMode: Partial<Record<SessionMode, number>>
  bestStreakByMode: Partial<Record<SessionMode, number>>
  dailyStreak: number
  lastPlayDayKey: string | null
  gameXp: number
  pendingReinforcements: PendingReinforcement[]
}

/** Provenance of a profile migrated from V1 (informational). */
export interface ProfileMigrationInfo {
  fromVersion: 1
  migratedAtMs: number
  /** v1 recentAttempts found (all fact keys). */
  v1Attempts: number
  /** Attempts written to the raw log (equals v1Attempts unless an attempt had no usable timestamp). */
  migratedAttempts: number
  inferredSessions: number
  /** Non-canonical v1 fact keys re-canonicalized (merged into their canonical key). */
  mergedFactKeys: string[]
  /** v1 fact keys that are not a valid fact at all (dropped). */
  droppedFactKeys: string[]
  /** v1 pendingReinforcements dropped (outside the core 1–10 space or malformed). */
  droppedPendingReinforcements: number
}

export interface LearnerProfileV2 {
  version: 2
  learnerName: string
  createdAtMs: number
  updatedAtMs: number
  placementComplete: boolean
  /** Consecutive calendar days with at least one finished session. */
  dailyStreak: number
  /** Local calendar day key (YYYY-MM-DD) of last finished session. */
  lastPlayDayKey: string | null
  /** Carried spaced practice (reintroduce / later-check) surviving session boundaries. */
  pendingReinforcements: PendingReinforcement[]

  /** Curriculum position + derived evidence view for the (single) skill. */
  progress: SkillProgress
  /** D11 persisted raw history (source of truth). */
  rawLog: RawLog
  /** recordKeyId(key) → record. */
  records: Record<string, PersonalRecord>
  /** Most recent sessions, oldest first (capped). */
  sessionLog: SessionLogEntry[]
  player: PlayerProgress
  /** Present when this profile was migrated from V1. */
  migration?: ProfileMigrationInfo

  // ---- Deprecated V1 compat fields (kept until T8 removes them) ----------------------

  /**
   * @deprecated V1 mastery model used by the legacy selection/placement/session code.
   * Not V2 evidence (V2 evidence lives in `progress.factEvidence`). Removed in T8.
   */
  facts: Record<string, FactRecord>
  /** @deprecated V1 mode-only bests (dropped on migration, D3). Removed in T8. */
  bestTimeMsByMode: Partial<Record<SessionMode, number>>
  /** @deprecated V1 mode-only streak bests (dropped on migration). Removed in T8. */
  bestStreakByMode: Partial<Record<SessionMode, number>>
  /**
   * @deprecated V1 game XP counter still written by the legacy session engine.
   * V2 XP is `player.xp` (migration copies gameXp → player.xp). Removed in T8.
   */
  gameXp: number
}

/** The current profile type. */
export type LearnerProfile = LearnerProfileV2
