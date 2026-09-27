/**
 * D6 — player progression (XP, player level, badges) and the typed progression events
 * that connect advancement (T4), records (T2) and progression (T3).
 *
 * XP and badges never read or write academic mastery fields: they read status and events only.
 */

import type { LevelId } from './curriculum'
import type { RecordKey } from './records'
import type { UnlockReason } from './evidence'

export type BadgeId =
  | 'first-run'
  | 'hot-streak'
  | 'on-fire'
  | 'perfect-session'
  | 'level-mastered'
  | 'comeback-kid'
  | 'record-breaker'
  | 'three-day-streak'
  | 'speedster'

export interface BadgeDef {
  id: BadgeId
  title: string
  description: string
  /** `level-mastered` is awarded once per level ("Level Mastered ×N"); all others once ever. */
  perLevel: boolean
}

export interface BadgeAward {
  badgeId: BadgeId
  awardedAtMs: number
  sessionId: string | null
  /** Set for per-level badges (`level-mastered`). */
  levelId?: LevelId
}

export interface PlayerProgress {
  xp: number
  /** Player level; XP to reach L = RULES.xp.levelCurveFactor·L·(L−1). */
  level: number
  badges: BadgeAward[]
  /** `${levelId}:${mode}` pairs finished at least once (first finish pays the full bonus, D6). */
  finishedLevelModes: string[]
  /** Records beaten (baseline excluded) — Record Breaker badge. */
  recordsBeaten: number
  /** Day key of the last record-beaten XP award (daily cap, D6). */
  lastRecordXpDayKey: string | null
}

/** Session-scoped inputs to XP that are not in the SessionLogEntry. */
export interface XpContext {
  /** Level was completed before this session (replay). */
  levelCompletedBefore: boolean
  /**
   * Frontier of the skill being played: its lowest unlocked level not yet completed.
   * Another skill's finished ladder does not set this.
   */
  isProgressLevel: boolean
  /** First finish of this level+mode (pays full bonus even on a completed level). */
  firstFinishLevelMode: boolean
  /** Facts whose everMastered became true this session. */
  newlyMasteredFacts: number
  /** Level completed by play at the end of this session. */
  levelCompletedNow: boolean
  /** A record (not baseline) was beaten this session. Saving the record does not depend on this. */
  recordBeaten: boolean
  /** Daily record XP bonus still available for this learner. Does not gate saving the record. */
  recordXpAvailableToday: boolean
}

export interface XpBreakdown {
  perCorrect: number
  completionBonus: number
  perfectBonus: number
  factMastered: number
  levelCompleted: number
  recordBeaten: number
  total: number
}

// ---- Typed progression events --------------------------------------------------------

interface EventBase {
  atMs: number
  sessionId: string | null
}

/** A fact's status became mastered. `firstTime` = everMastered flipped (+5 XP). */
export interface FactMasteredEvent extends EventBase {
  type: 'fact-mastered'
  factId: string
  levelId: LevelId | null
  firstTime: boolean
}

/** Comeback Kid input: missed in an earlier session, correct as its first counted attempt in this one. */
export interface FactComebackEvent extends EventBase {
  type: 'fact-comeback'
  factId: string
  missedInSessionId: string
}

/** A level was completed by play (placement/inference never complete). */
export interface LevelCompletedEvent extends EventBase {
  type: 'level-completed'
  levelId: LevelId
}

export interface LevelUnlockedEvent extends EventBase {
  type: 'level-unlocked'
  levelId: LevelId
  reason: UnlockReason
}

export interface BaselineSetEvent extends EventBase {
  type: 'baseline-set'
  key: RecordKey
  baselineMs: number
}

export interface RecordBeatenEvent extends EventBase {
  type: 'record-beaten'
  key: RecordKey
  previousBestMs: number
  newBestMs: number
  /** The record's level was completed before this session (Speedster). */
  levelCompleted: boolean
  isProgressLevel: boolean
}

export interface BadgeEarnedEvent extends EventBase {
  type: 'badge-earned'
  award: BadgeAward
}

export interface PlayerLevelUpEvent extends EventBase {
  type: 'player-level-up'
  fromLevel: number
  toLevel: number
}

export type ProgressionEvent =
  | FactMasteredEvent
  | FactComebackEvent
  | LevelCompletedEvent
  | LevelUnlockedEvent
  | BaselineSetEvent
  | RecordBeatenEvent
  | BadgeEarnedEvent
  | PlayerLevelUpEvent

export type ProgressionEventType = ProgressionEvent['type']
