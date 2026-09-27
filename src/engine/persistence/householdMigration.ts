/**
 * V2 → V3 household entry point.
 *
 * The stamp decides whether migration runs. A missing learner does not.
 * Stored fact ids stay canonical (`7x8`) because the running engine still
 * reads evidence that way. Copied attempts gain `instanceKey` so a later
 * fold suppresses the same instances. The V2 profile object is not mutated.
 */

import type { Household, LearnerProfileV3 } from '../contracts'
import { multiplicationConceptId } from '../contracts'
import type { LearnerProfileV2 } from '../contracts/profile'

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
  for (const attempt of v2.rawLog.attempts) {
    if (!attempt.instanceKey) attempt.instanceKey = multiplicationConceptId(attempt.factId)
  }

  const learner: LearnerProfileV3 = {
    identity: { id: input.learnerId, displayName: v2.learnerName },
    lastActivePath: { skillId, levelId: v2.progress.currentLevelId },
    skills: { [skillId]: v2.progress },
    player: v2.player,
    records: v2.records,
    rawLog: v2.rawLog,
    sessionLog: v2.sessionLog,
    pendingReinforcements: v2.pendingReinforcements,
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
