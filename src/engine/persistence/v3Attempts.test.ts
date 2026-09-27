import { describe, expect, it } from 'vitest'
import { createAlgebraSkill } from '../content/algebra/plugin'
import { createDivisionSkill } from '../content/division/plugin'
import { createFractionsSkill } from '../content/fractions/plugin'
import { createMultiplicationSkill } from '../content/multiplication/plugin'
import type { LearnerProfileV3, MathSkill, RawAttempt } from '../contracts'
import { HOUSEHOLD_STORAGE_KEY } from '../contracts'
import { createEmptyProfile, createEmptySkillProgress } from '../learning/selection'
import { LevelSessionEngine } from '../session/levelSession'
import '../curriculum/shipped'
import { PROFILE_STORAGE_KEY } from './storage'
import { loadHousehold, saveHousehold, upsertLearner } from './householdStore'
import { decodeRawLog, encodeRawLog, RAW_LOG_ENCODING_VERSION_V3 } from './rawLog'

function memory(): Storage {
  const map = new Map<string, string>()
  return {
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
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

function play(
  skill: MathSkill,
  learnerId: string,
  pick: (choices: { id: string; value: unknown; misconceptionId?: string }[]) => unknown,
): RawAttempt {
  const profile = createEmptyProfile(learnerId, 1_700_000_000_000)
  profile.progress = createEmptySkillProgress(skill.id)
  const engine = new LevelSessionEngine({
    profile,
    skill,
    mode: 'quick',
    levelId: 'L1',
    learnerId,
    sessionId: `session-${skill.id}`,
    clock: () => 1_700_000_000_500,
  })
  engine.nextQuestion()
  const question = engine.snapshot().current?.question
  if (!question) throw new Error(`no question for ${skill.id}`)
  const choices = (question.choices ?? []).map((choice) => ({
    id: choice.id,
    value: choice.value,
    misconceptionId: choice.misconceptionId,
  }))
  engine.answer(question.id, pick(choices))
  const attempt = engine.getProfile().rawLog.attempts.at(-1)
  if (!attempt) throw new Error(`no attempt for ${skill.id}`)
  return attempt
}

function learner(id: string, name: string, attempt: RawAttempt, extra: Partial<LearnerProfileV3> = {}): LearnerProfileV3 {
  const shell = createEmptyProfile(name, 1_700_000_000_000)
  shell.progress = createEmptySkillProgress(attempt.skillId ?? 'multiplication')
  return {
    identity: { id, displayName: name, grade: extra.identity?.grade ?? 4 },
    skills: { [shell.progress.skillId]: shell.progress },
    player: extra.player ?? shell.player,
    records: extra.records ?? {},
    rawLog: { attempts: [attempt], sessions: [] },
    sessionLog: [],
    pendingReinforcements: extra.pendingReinforcements ?? [],
    lastActivePath: extra.lastActivePath ?? { skillId: attempt.skillId ?? 'multiplication', levelId: 'L1' },
  }
}

describe('V3 attempt persistence', () => {
  it('keeps version-1 history readable without inventing V3 fields', () => {
    const profile = createEmptyProfile('Mikaela', 10)
    const attempt: RawAttempt = {
      factId: '7x8',
      a: 7,
      b: 8,
      correct: true,
      given: 56,
      latencyMs: 800,
      atMs: 10,
      sessionId: 's1',
      sessionInferred: false,
      levelId: 'L1',
      mode: 'quick',
      source: 'draw',
      isReplay: false,
    }
    profile.rawLog.attempts.push(attempt)
    const decoded = decodeRawLog(encodeRawLog(profile.rawLog))
    expect(decoded.attempts[0]).toEqual(attempt)
    expect(decoded.attempts[0]?.conceptIds).toBeUndefined()
    expect(decoded.attempts[0]?.instanceKey).toBeUndefined()
    expect(decoded.attempts[0]?.misconceptionId).toBeUndefined()
    expect(decoded.attempts[0]?.learnerId).toBeUndefined()
  })

  it('treats a short version-2 row as missing V3 fields', () => {
    const encoded = encodeRawLog({
      sessions: [],
      attempts: [
        {
          factId: '7x8',
          a: 7,
          b: 8,
          correct: true,
          given: 56,
          latencyMs: 10,
          atMs: 10,
          sessionId: 's1',
          sessionInferred: false,
          levelId: 'L1',
          mode: 'quick',
          source: 'draw',
          isReplay: false,
        },
      ],
    })
    encoded.v = RAW_LOG_ENCODING_VERSION_V3
    const decoded = decodeRawLog(encoded)
    expect(decoded.attempts[0]?.factId).toBe('7x8')
    expect(decoded.attempts[0]?.conceptIds).toBeUndefined()
    expect(decoded.attempts[0]?.learnerId).toBeUndefined()
    expect(decoded.attempts[0]?.misconceptionId).toBeUndefined()
  })

  it('round-trips a played attempt for every shipped skill', () => {
    const samples = [
      play(createMultiplicationSkill(() => 0), 'learner-mikaela', () => 56),
      play(createDivisionSkill(() => 0), 'learner-mikaela', (choices) => choices[0]?.value),
      play(createFractionsSkill(() => 0), 'learner-mikaela', (choices) => choices[0]?.value),
      play(
        createAlgebraSkill(() => 0),
        'learner-mikaela',
        (choices) => choices.find((choice) => choice.misconceptionId)?.value ?? choices[0]?.value,
      ),
    ]
    const storage = memory()
    const v2 = 'v2-backup-bytes'
    storage.setItem(PROFILE_STORAGE_KEY, v2)
    let household: { activeLearnerId: string | null; learners: Record<string, LearnerProfileV3> } = {
      activeLearnerId: 'learner-mikaela',
      learners: {},
    }
    for (const attempt of samples) {
      const existing = household.learners['learner-mikaela']
      const next = learner('learner-mikaela', 'Mikaela', attempt)
      next.rawLog.attempts = [...(existing?.rawLog.attempts ?? []), attempt]
      next.player.xp = 30
      next.pendingReinforcements = [{ factId: 'keep-mikaela', kind: 'reintroduce', dueInQuestions: 2 }]
      household = upsertLearner(household, next)
    }
    expect(saveHousehold(storage, household).status).toBe('saved')
    const loaded = loadHousehold(storage, { nowMs: 90, learnerId: 'learner-mikaela' })
    const attempts = loaded.household.learners['learner-mikaela']?.rawLog.attempts ?? []
    expect(attempts).toHaveLength(4)
    const [multiplication, division, fractions, algebra] = attempts
    expect(multiplication?.conceptIds?.[0]).toMatch(/^multiplication\.fact\./)
    expect(multiplication?.instanceKey).toMatch(/^multiplication\.fact\./)
    expect(multiplication?.learnerId).toBe('learner-mikaela')
    expect(multiplication?.skillId).toBe('multiplication')
    expect(division?.skillId).toBe('division')
    expect(division?.conceptIds?.length).toBeGreaterThan(0)
    expect(division?.selectedChoiceId).toBeTruthy()
    expect(fractions?.skillId).toBe('fractions')
    expect(fractions?.instanceKey).toBeTruthy()
    expect(algebra?.skillId).toBe('algebra-one-step')
    expect(algebra?.misconceptionId).toBeTruthy()
    for (const attempt of attempts) {
      expect(attempt.sessionId).toBeTruthy()
      expect(attempt.levelId).toBe('L1')
      expect(attempt.latencyMs).toBeGreaterThanOrEqual(0)
      expect(attempt.source).toBe('draw')
      expect(attempt.isReplay).toBe(false)
      expect(typeof attempt.atMs).toBe('number')
      expect(typeof attempt.correct).toBe('boolean')
    }
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(v2)
    const stored = storage.getItem(HOUSEHOLD_STORAGE_KEY) ?? ''
    expect(stored).not.toContain('"conceptIds":')
    expect(stored).toContain('"v":2')
  })

  it('keeps one learner’s attempts, records, XP, and practice off the other', () => {
    const mikaelaAttempt = play(createMultiplicationSkill(() => 0), 'learner-mikaela', () => 1)
    const adrianAttempt = play(createDivisionSkill(() => 0), 'learner-adrian', (choices) => choices[0]?.value)
    const storage = memory()
    const mikaela = learner('learner-mikaela', 'Mikaela', mikaelaAttempt, {
      player: { xp: 80, level: 2, badges: [], finishedLevelModes: [], recordsBeaten: 0, lastRecordXpDayKey: null },
      pendingReinforcements: [{ factId: 'mikaela-only', kind: 'later-check', dueInQuestions: 3 }],
      records: {
        mult: {
          key: { skillId: 'multiplication', levelId: 'L1', mode: 'quick', rulesVersion: 1 },
          baselineMs: 1000,
          baselineAtMs: 1,
          baselineSessionId: 's',
          bestMs: 900,
          bestAtMs: 2,
          bestSessionId: 's',
          eligibleRuns: 1,
          timesBeaten: 0,
        },
      },
    })
    const adrian = learner('learner-adrian', 'Adrian', adrianAttempt, {
      player: { xp: 12, level: 1, badges: [], finishedLevelModes: [], recordsBeaten: 0, lastRecordXpDayKey: null },
      pendingReinforcements: [{ factId: 'adrian-only', kind: 'reintroduce', dueInQuestions: 1 }],
      records: {},
      lastActivePath: { skillId: 'division', levelId: 'L1' },
    })
    const household = upsertLearner(
      upsertLearner({ activeLearnerId: 'learner-mikaela', learners: {} }, mikaela),
      adrian,
    )
    saveHousehold(storage, household)
    const loaded = loadHousehold(storage, { nowMs: 90, learnerId: 'learner-mikaela' })
    const keptMikaela = loaded.household.learners['learner-mikaela']!
    const keptAdrian = loaded.household.learners['learner-adrian']!
    expect(keptMikaela.player.xp).toBe(80)
    expect(keptAdrian.player.xp).toBe(12)
    expect(keptMikaela.rawLog.attempts.map((item) => item.learnerId)).toEqual(['learner-mikaela'])
    expect(keptAdrian.rawLog.attempts.map((item) => item.skillId)).toEqual(['division'])
    expect(keptMikaela.pendingReinforcements.map((item) => item.factId)).toEqual(['mikaela-only'])
    expect(keptAdrian.pendingReinforcements.map((item) => item.factId)).toEqual(['adrian-only'])
    expect(Object.keys(keptMikaela.records)).toEqual(['mult'])
    expect(keptAdrian.records).toEqual({})
    expect(keptAdrian.lastActivePath).toEqual({ skillId: 'division', levelId: 'L1' })
    expect(keptMikaela.rawLog.attempts[0]?.conceptIds).toEqual(mikaelaAttempt.conceptIds)
    expect(keptAdrian.rawLog.attempts[0]?.instanceKey).toBe(adrianAttempt.instanceKey)
  })
})
