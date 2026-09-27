/**
 * V3 platform contracts. These sit beside the live V2 profile.
 * The running app still loads `LearnerProfile` (V2) until migration is wired.
 */

import type { LevelId } from './curriculum'
import type { FactStatus, RawLog, SkillProgress } from './evidence'
import type { PlayerProgress } from './progression'
import type { PersonalRecord, SessionLogEntry } from './records'
import type { PendingReinforcement } from './types'

/** V3 household blob. Not the V2 key. */
export const HOUSEHOLD_STORAGE_KEY = 'math-rush:household-v3'

export type ConceptRelationshipKind = 'inverse' | 'prerequisite' | 'related' | 'equivalent'

export interface LearningConcept {
  id: string
  skillId: string
  title: string
}

export interface ConceptRelationship {
  fromId: string
  toId: string
  kind: ConceptRelationshipKind
}

/** Smallest context a distractor generator may see. Not a learner profile. */
export interface DistractorContext {
  skillId: string
  concepts: readonly { conceptId: string; status: FactStatus }[]
}

/** Academic state for the evidence pips. The component does not compute this. */
export interface EvidenceMarksView {
  marks: 0 | 1 | 2 | 3
  mastered: boolean
}

export interface LocalLearnerIdentity {
  id: string
  displayName: string
  grade?: number
  avatarId?: string
}

export interface LastActivePath {
  skillId: string
  levelId: LevelId
}

/**
 * One learner's gameplay. The TypeScript name is V3 so it can sit beside the
 * live V2 `LearnerProfile` until the app switches saves.
 */
export interface LearnerProfileV3 {
  identity: LocalLearnerIdentity
  lastActivePath?: LastActivePath
  skills: Record<string, SkillProgress>
  player: PlayerProgress
  records: Record<string, PersonalRecord>
  rawLog: RawLog
  sessionLog: SessionLogEntry[]
  pendingReinforcements: PendingReinforcement[]
}

export interface HouseholdMigrationStamp {
  source: 'learner-v2'
  completed: true
  completedAtMs: number
  migratedLearnerId: string
}

export interface Household {
  activeLearnerId: string | null
  learners: Record<string, LearnerProfileV3>
  migration?: HouseholdMigrationStamp
}

/** Concept id for a canonical multiplication fact. `7x8` → `multiplication.fact.7x8`. */
export function multiplicationConceptId(canonicalFactId: string): string {
  const prefix = 'multiplication.fact.'
  return canonicalFactId.startsWith(prefix) ? canonicalFactId : `${prefix}${canonicalFactId}`
}

/** Instance used for within-session suppression. Older attempts fall back to the fact id. */
export function evidenceInstanceKey(attempt: {
  factId: string
  instanceKey?: string
}): string {
  return attempt.instanceKey ?? attempt.factId
}
