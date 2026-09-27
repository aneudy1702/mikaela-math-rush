import { describe, expect, it } from 'vitest'
import { HOUSEHOLD_STORAGE_KEY, recordKeyId, type LearnerProfile, type PersonalRecord } from '../contracts'
import { emptyFactEvidence } from '../learning/advancement'
import { createEmptyProfile } from '../learning/selection'
import { recordKey } from '../records/records'
import { PROFILE_STORAGE_KEY, serializeProfile } from './storage'
import { loadHousehold, saveHousehold, upsertLearner } from './householdStore'
import { HOUSEHOLD_QUARANTINE_PREFIX } from './householdStore'

function memory(): Storage & { writes: string[] } {
  const map = new Map<string, string>()
  const writes: string[] = []
  return {
    writes,
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    key(index) {
      return [...map.keys()][index] ?? null
    },
    getItem(key) {
      return map.get(key) ?? null
    },
    setItem(key, value) {
      writes.push(key)
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

function richProfile(): LearnerProfile {
  const profile = createEmptyProfile('Mikaela', 1_700_000_000_000)
  const evidence = emptyFactEvidence('7x8')
  evidence.countedAttempts = 4
  evidence.countedCorrect = 4
  evidence.everMastered = true
  evidence.liveCorrectSession = true
  evidence.correctSessionIds = ['s1', 's2']
  evidence.window = [
    { correct: true, sessionId: 's1', sessionInferred: false, atMs: 1 },
    { correct: true, sessionId: 's2', sessionInferred: false, atMs: 2 },
  ]
  profile.progress.currentLevelId = 'L3'
  profile.progress.unlockedLevelIds = ['L1', 'L2', 'L3']
  profile.progress.completedLevelIds = ['L1', 'L2']
  profile.progress.factEvidence = { '7x8': evidence }
  profile.progress.evidence = {
    L3: [{ factId: '7x8', correct: true, sessionId: 's1', dayKey: '2026-09-01' }],
  }
  profile.player = {
    xp: 120,
    level: 2,
    badges: [{ badgeId: 'first-run', awardedAtMs: 5, sessionId: 's1' }],
    finishedLevelModes: ['L1:quick'],
    recordsBeaten: 1,
    lastRecordXpDayKey: '2026-09-01',
  }
  const key = recordKey('multiplication', 'L1', 'quick', 1)
  const record: PersonalRecord = {
    key,
    baselineMs: 40_000,
    baselineAtMs: 10,
    baselineSessionId: 's1',
    bestMs: 30_000,
    bestAtMs: 20,
    bestSessionId: 's2',
    eligibleRuns: 2,
    timesBeaten: 1,
  }
  profile.records = { [recordKeyId(key)]: record }
  profile.rawLog.attempts.push({
    factId: '7x8',
    a: 7,
    b: 8,
    correct: true,
    given: 56,
    latencyMs: 900,
    atMs: 20,
    sessionId: 's2',
    sessionInferred: false,
    levelId: 'L3',
    mode: 'quick',
    source: 'draw',
    isReplay: false,
  })
  profile.pendingReinforcements = [{ factId: '6x7', kind: 'reintroduce', dueInQuestions: 2 }]
  profile.sessionLog = [
    {
      sessionId: 's2',
      skillId: 'multiplication',
      levelId: 'L3',
      mode: 'quick',
      rulesVersion: 1,
      startedAtMs: 10,
      endedAtMs: 20,
      elapsedMs: 30_000,
      dayKey: '2026-09-01',
      completed: true,
      answered: 10,
      correct: 10,
      drawAnswers: 10,
      drawCorrect: 10,
      longestStreak: 10,
      isReplay: false,
    },
  ]
  return profile
}

describe('household store', () => {
  it('maps a V2 save onto one learner and leaves the V2 blob unchanged', () => {
    const storage = memory()
    const v2 = serializeProfile(richProfile())
    storage.setItem(PROFILE_STORAGE_KEY, v2)
    storage.writes.length = 0

    const loaded = loadHousehold(storage, { nowMs: 50, learnerId: 'mikaela' })
    const learner = loaded.household.learners.mikaela!
    const progress = learner.skills.multiplication!
    const evidence = progress.factEvidence['multiplication.fact.7x8']!

    expect(loaded.migrated).toBe(true)
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(v2)
    expect(storage.writes).not.toContain(PROFILE_STORAGE_KEY)
    expect(progress.currentLevelId).toBe('L3')
    expect(progress.completedLevelIds).toEqual(['L1', 'L2'])
    expect(progress.factEvidence['7x8']).toBeUndefined()
    expect(evidence.everMastered).toBe(true)
    expect(evidence.countedAttempts).toBe(4)
    expect(evidence.window).toHaveLength(2)
    expect(progress.evidence.L3?.[0]?.factId).toBe('multiplication.fact.7x8')
    expect(learner.player.xp).toBe(120)
    expect(learner.player.badges).toEqual([{ badgeId: 'first-run', awardedAtMs: 5, sessionId: 's1' }])
    expect(Object.values(learner.records)[0]?.bestMs).toBe(30_000)
    expect(learner.rawLog.attempts[0]?.factId).toBe('multiplication.fact.7x8')
    expect(learner.pendingReinforcements[0]?.factId).toBe('multiplication.fact.6x7')
    expect(learner.sessionLog).toHaveLength(1)
    expect(learner.identity.grade).toBeUndefined()
  })

  it('does not overwrite newer V3 progress on reload', () => {
    const storage = memory()
    const v2 = serializeProfile(richProfile())
    storage.setItem(PROFILE_STORAGE_KEY, v2)
    const first = loadHousehold(storage, { nowMs: 50, learnerId: 'mikaela' })
    const household = structuredClone(first.household)
    household.learners.mikaela!.player.xp = 999
    const adrian = structuredClone(household.learners.mikaela!)
    adrian.identity = { id: 'adrian', displayName: 'Adrian' }
    adrian.player = { ...adrian.player, xp: 15, badges: [] }
    adrian.records = {}
    adrian.rawLog = { attempts: [], sessions: [] }
    adrian.sessionLog = []
    adrian.pendingReinforcements = []
    const withAdrian = upsertLearner(household, adrian)
    expect(saveHousehold(storage, withAdrian).status).toBe('saved')

    const again = loadHousehold(storage, { nowMs: 90, learnerId: 'mikaela' })
    expect(again.migrated).toBe(false)
    expect(again.household.learners.mikaela?.player.xp).toBe(999)
    expect(again.household.learners.mikaela?.rawLog.attempts[0]?.conceptIds).toBeUndefined()
    expect(again.household.learners.mikaela?.rawLog.attempts[0]?.misconceptionId).toBeUndefined()
    expect(again.household.learners.mikaela?.rawLog.attempts[0]?.factId).toBe('multiplication.fact.7x8')
    expect(again.household.learners.adrian?.player.xp).toBe(15)
    expect(again.household.learners.adrian?.records).toEqual({})
    expect(again.household.learners.mikaela?.player.badges).toHaveLength(1)
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(v2)
  })

  it('does not recreate a deleted migrated learner', () => {
    const storage = memory()
    const v2 = serializeProfile(richProfile())
    storage.setItem(PROFILE_STORAGE_KEY, v2)
    const first = loadHousehold(storage, { nowMs: 50, learnerId: 'mikaela' })
    const deleted = { ...first.household, activeLearnerId: null, learners: {} }
    saveHousehold(storage, deleted)

    const again = loadHousehold(storage, { nowMs: 90, learnerId: 'mikaela' })
    expect(again.migrated).toBe(false)
    expect(again.household.learners).toEqual({})
    expect(again.household.migration).toEqual(first.household.migration)
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(v2)
  })

  it('quarantines an unreadable household and does not touch the V2 blob', () => {
    const storage = memory()
    const v2 = serializeProfile(richProfile())
    storage.setItem(PROFILE_STORAGE_KEY, v2)
    storage.setItem(HOUSEHOLD_STORAGE_KEY, '{bad')
    storage.writes.length = 0

    const loaded = loadHousehold(storage, { nowMs: 77, learnerId: 'mikaela' })
    expect(loaded.notice).toBe('unreadable-household')
    expect(loaded.migrated).toBe(false)
    expect(loaded.household.learners).toEqual({})
    expect(storage.getItem(HOUSEHOLD_STORAGE_KEY)).toBe('{bad')
    expect(storage.getItem(`${HOUSEHOLD_QUARANTINE_PREFIX}77`)).toBe('{bad')
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(v2)
    expect(storage.writes).not.toContain(PROFILE_STORAGE_KEY)
  })

  it('keeps the V2 blob when the household save fails', () => {
    const storage = memory()
    const v2 = serializeProfile(richProfile())
    storage.setItem(PROFILE_STORAGE_KEY, v2)
    storage.setItem = (key) => {
      storage.writes.push(key)
      if (key === HOUSEHOLD_STORAGE_KEY) throw new Error('quota')
    }
    const loaded = loadHousehold(storage, { nowMs: 50, learnerId: 'mikaela' })
    expect(loaded.notice).toBe('save-failed')
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(v2)
    expect(storage.getItem(HOUSEHOLD_STORAGE_KEY)).toBeNull()
  })
})
