/**
 * V2 → V3 household entry point.
 *
 * The stamp decides whether migration runs. A missing learner does not.
 * The V2 profile object is not mutated. The V3 copy maps canonical fact ids
 * to concept ids and copies mastery fields. It does not recompute status.
 */

import type {
  EvidenceBufferEntry,
  FactEvidence,
  Household,
  LearnerProfileV3,
  RawLog,
  SkillProgress,
} from '../contracts'
import { multiplicationConceptId } from '../contracts'
import type { LearnerProfileV2 } from '../contracts/profile'
import type { PendingReinforcement } from '../contracts/types'

export interface HouseholdMigrationInput {
  household: Household | null
  v2Profile: LearnerProfileV2 | null
  nowMs: number
  learnerId: string
  skillId?: string
}

export interface HouseholdMigrationResult {
  household: Household
  /** True only on the call that wrote the stamp. */
  ran: boolean
}

const EMPTY_HOUSEHOLD: Household = { activeLearnerId: null, learners: {} }

function mapFactId(factId: string): string {
  return multiplicationConceptId(factId)
}

function mapEvidence(evidence: FactEvidence): FactEvidence {
  const factId = mapFactId(evidence.factId)
  return { ...evidence, factId }
}

function mapProgress(progress: SkillProgress): SkillProgress {
  const factEvidence: Record<string, FactEvidence> = {}
  for (const [factId, evidence] of Object.entries(progress.factEvidence)) {
    factEvidence[mapFactId(factId)] = mapEvidence(evidence)
  }
  const evidence: Record<string, EvidenceBufferEntry[]> = {}
  for (const [levelId, entries] of Object.entries(progress.evidence)) {
    evidence[levelId] = entries.map((entry) => ({ ...entry, factId: mapFactId(entry.factId) }))
  }
  return { ...progress, factEvidence, evidence }
}

function mapRawLog(log: RawLog): RawLog {
  return {
    attempts: log.attempts.map((attempt) => ({
      ...attempt,
      factId: mapFactId(attempt.factId),
      instanceKey: attempt.instanceKey ?? mapFactId(attempt.factId),
    })),
    sessions: log.sessions.map((session) => ({
      ...session,
      discardedOnHide: session.discardedOnHide.map((discarded) => ({
        ...discarded,
        factId: mapFactId(discarded.factId),
      })),
    })),
  }
}

function mapPending(items: readonly PendingReinforcement[]): PendingReinforcement[] {
  return items.map((item) => ({ ...item, factId: mapFactId(item.factId) }))
}

export function applyHouseholdMigration(input: HouseholdMigrationInput): HouseholdMigrationResult {
  const household = input.household
  if (household?.migration?.completed) {
    return { household, ran: false }
  }

  if (!input.v2Profile) {
    return { household: household ?? EMPTY_HOUSEHOLD, ran: false }
  }

  const skillId = input.skillId ?? 'multiplication'
  const v2 = structuredClone(input.v2Profile)
  const progress = mapProgress(v2.progress)

  const learner: LearnerProfileV3 = {
    identity: { id: input.learnerId, displayName: v2.learnerName },
    lastActivePath: { skillId, levelId: progress.currentLevelId },
    skills: { [skillId]: progress },
    player: v2.player,
    records: v2.records,
    rawLog: mapRawLog(v2.rawLog),
    sessionLog: v2.sessionLog,
    pendingReinforcements: mapPending(v2.pendingReinforcements),
  }

  const learners = { ...(household?.learners ?? {}) }
  if (!learners[input.learnerId]) learners[input.learnerId] = learner

  return {
    ran: true,
    household: {
      activeLearnerId: household?.activeLearnerId ?? input.learnerId,
      learners,
      migration: {
        source: 'learner-v2',
        completed: true,
        completedAtMs: input.nowMs,
        migratedLearnerId: input.learnerId,
      },
    },
  }
}
