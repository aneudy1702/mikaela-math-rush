import { describe, expect, it } from 'vitest'
import { createEmptyProfile } from '../learning/selection'
import { applyHouseholdMigration } from './householdMigration'
import type { RawAttempt } from '../contracts'

function attempt(factId: string): RawAttempt {
  return {
    factId,
    a: 7,
    b: 8,
    correct: false,
    given: 54,
    latencyMs: 1000,
    atMs: 1,
    sessionId: 's1',
    sessionInferred: false,
    levelId: 'L1',
    mode: 'practice',
    source: 'draw',
    isReplay: false,
  }
}

describe('applyHouseholdMigration', () => {
  it('copies the V2 learner once and leaves the V2 profile untouched', () => {
    const v2 = createEmptyProfile('Mikaela', 10)
    v2.rawLog.attempts.push(attempt('7x8'))
    v2.player.xp = 40
    const before = structuredClone(v2)

    const first = applyHouseholdMigration({
      household: null,
      v2Profile: v2,
      nowMs: 50,
      learnerId: 'mikaela',
    })

    expect(first.ran).toBe(true)
    expect(v2).toEqual(before)
    expect(first.household.migration).toEqual({
      source: 'learner-v2',
      completed: true,
      completedAtMs: 50,
      migratedLearnerId: 'mikaela',
    })
    const learner = first.household.learners.mikaela!
    expect(learner.player.xp).toBe(40)
    expect(learner.skills.multiplication).toEqual(v2.progress)
    expect(learner.rawLog.attempts[0]?.factId).toBe('multiplication.fact.7x8')
    expect(learner.rawLog.attempts[0]?.instanceKey).toBe('multiplication.fact.7x8')
    expect(v2.rawLog.attempts[0]?.instanceKey).toBeUndefined()

    learner.player.xp = 999
    const again = applyHouseholdMigration({
      household: first.household,
      v2Profile: v2,
      nowMs: 80,
      learnerId: 'mikaela',
    })
    expect(again.ran).toBe(false)
    expect(again.household).toBe(first.household)
    expect(again.household.learners.mikaela?.player.xp).toBe(999)
    expect(v2).toEqual(before)
  })

  it('does not recreate a deleted migrated learner from the V2 backup', () => {
    const v2 = createEmptyProfile('Mikaela', 10)
    const first = applyHouseholdMigration({
      household: null,
      v2Profile: v2,
      nowMs: 50,
      learnerId: 'mikaela',
    })
    const deleted = {
      ...first.household,
      activeLearnerId: null,
      learners: {},
    }
    const before = structuredClone(v2)

    const again = applyHouseholdMigration({
      household: deleted,
      v2Profile: v2,
      nowMs: 90,
      learnerId: 'mikaela',
    })

    expect(again.ran).toBe(false)
    expect(again.household.learners).toEqual({})
    expect(again.household.migration).toEqual(first.household.migration)
    expect(v2).toEqual(before)
  })
})
