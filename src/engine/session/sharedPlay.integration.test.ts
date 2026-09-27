import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { LearnerProfile, MathSkill, PersonalRecord, Question } from '../contracts'
import { RULES, recordKeyId } from '../contracts'
import { ALGEBRA_SKILL_ID, createAlgebraSkill } from '../content/algebra'
import { DIVISION_SKILL_ID, createDivisionSkill } from '../content/division'
import { FRACTIONS_SKILL_ID, createFractionsSkill } from '../content/fractions'
import {
  MULTIPLICATION_SKILL_ID,
  createMultiplicationSkill,
  generateForFact,
} from '../content/multiplication'
import { completionGatingIds, getCurriculum, listRegisteredSkills } from '../curriculum'
import '../curriculum/shipped'
import { evaluateTableLevel } from '../learning/advancement'
import { createEmptyProfile, createEmptySkillProgress } from '../learning/selection'
import { xpForSession } from '../progression'
import { recordKey } from '../records'
import { LevelSessionEngine, type SessionQuestionSource } from './levelSession'
import { createPluginQuestionSource } from './pluginSource'

const DAY = 86_400_000
const T0 = new Date(2026, 0, 5, 12, 0, 0).getTime()
const LEARNER = 'learner-mikaela'

function profileFor(skillId: string): LearnerProfile {
  const profile = createEmptyProfile('Mikaela', T0)
  profile.progress = createEmptySkillProgress(skillId)
  return profile
}

function scripted(questions: readonly Question[], evidenceKey: (question: Question) => string): SessionQuestionSource {
  let index = 0
  let pending: LearnerProfile['pendingReinforcements'] = []
  return {
    seedPending(items) {
      pending = [...items]
      return 0
    },
    nextQuestion() {
      const question = questions[index % questions.length]!
      index += 1
      return {
        question: { ...question, id: `${question.id}-${index}` },
        pick: {
          factId: evidenceKey(question),
          source: 'draw',
          pool: 'level',
          likely: false,
          carried: false,
        },
      }
    },
    recordAnswer() {},
    discardLast() {
      return false
    },
    exportPending() {
      return pending
    },
  }
}

function start(options: {
  skill: MathSkill
  profile?: LearnerProfile
  sessionId: string
  levelId?: string
  questionSource?: (typeof createPluginQuestionSource)
  questions?: readonly Question[]
}) {
  const clock = { t: T0 }
  const skill = options.skill
  const engine = new LevelSessionEngine({
    profile: options.profile ?? profileFor(skill.id),
    skill,
    mode: 'quick',
    levelId: options.levelId ?? 'L1',
    clock: () => clock.t,
    sessionId: options.sessionId,
    learnerId: LEARNER,
    questionSource: options.questions
      ? () => scripted(options.questions!, (question) => skill.conceptIdFor?.(question) ?? question.conceptIds[0]!)
      : (ctx) => createPluginQuestionSource(ctx),
  })
  return { engine, clock }
}

function answerShown(
  engine: LevelSessionEngine,
  clock: { t: number },
  value?: unknown,
) {
  const current = engine.nextQuestion()
  if (!current) throw new Error('no question')
  clock.t += 640
  const outcome = engine.answer(current.question.id, value ?? current.question.correctAnswer)
  return { current, outcome }
}

function finishSession(skill: MathSkill, profile: LearnerProfile, sessionId: string, latencyMs: number, day: number) {
  const clock = { t: T0 + day * DAY }
  const engine = new LevelSessionEngine({
    profile,
    skill,
    mode: 'quick',
    levelId: 'L1',
    clock: () => clock.t,
    sessionId,
    learnerId: LEARNER,
    questionSource: (ctx) => createPluginQuestionSource(ctx),
  })
  while (!engine.isComplete()) {
    const current = engine.nextQuestion()
    if (!current) throw new Error('no question')
    clock.t += latencyMs
    engine.answer(current.question.id, current.question.correctAnswer)
    clock.t += 100
  }
  const summary = engine.finish()
  return { summary, profile: engine.getProfile() }
}

describe('shared play path', () => {
  it('does not branch the session or renderer on skill id', () => {
    const files = [
      new URL('./levelSession.ts', import.meta.url),
      new URL('./pluginSource.ts', import.meta.url),
      new URL('../../ui/answers/registry.tsx', import.meta.url),
      new URL('../../ui/answers/rendererFor.ts', import.meta.url),
      new URL('../../ui/answers/SharedQuestion.tsx', import.meta.url),
      new URL('../../ui/answers/SharedPlayProof.tsx', import.meta.url),
    ]
    const banned = [
      'skillId === "multiplication"',
      "skillId === 'multiplication'",
      'skillId === "division"',
      "skillId === 'division'",
      'skillId === "fractions"',
      "skillId === 'fractions'",
      'skillId === "algebra"',
      "skillId === 'algebra'",
      'skillId === "algebra-one-step"',
      "skillId === 'algebra-one-step'",
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const phrase of banned) expect(source, file.pathname).not.toContain(phrase)
    }
    for (const folder of ['division', 'fractions', 'algebra']) {
      const plugin = readFileSync(new URL(`../content/${folder}/plugin.ts`, import.meta.url), 'utf8')
      expect(plugin).not.toContain('gatingFactIds')
    }
  })

  it('registers the four shipped skills and completes concept levels through concept ids', () => {
    expect(listRegisteredSkills().map((skill) => skill.id)).toEqual([
      MULTIPLICATION_SKILL_ID,
      DIVISION_SKILL_ID,
      FRACTIONS_SKILL_ID,
      ALGEBRA_SKILL_ID,
    ])
    const fractions = getCurriculum(FRACTIONS_SKILL_ID)
    expect(fractions.levels[0]?.gatingFactIds).toEqual([])
    expect(completionGatingIds(fractions.levels[0]!)).toEqual(fractions.levels[0]!.gatingConceptIds)
    expect(completionGatingIds(fractions.levels[0]!)).toHaveLength(1)
  })

  it('runs multiplication, division, fractions, and algebra through one session path', () => {
    const skills = [
      createMultiplicationSkill(() => 0.2),
      createDivisionSkill(() => 0.2),
      createFractionsSkill(() => 0.2),
      createAlgebraSkill(() => 0.2),
    ]
    for (const skill of skills) {
      const { engine, clock } = start({ skill, sessionId: `shared-${skill.id}` })
      const { current, outcome } = answerShown(engine, clock)
      const attempt = outcome.attempt
      expect(current.question.skillId).toBe(skill.id)
      expect(attempt.learnerId).toBe(LEARNER)
      expect(attempt.skillId).toBe(skill.id)
      expect(attempt.levelId).toBe('L1')
      expect(attempt.conceptIds).toEqual(current.question.conceptIds)
      expect(attempt.conceptIds?.length).toBeGreaterThan(0)
      expect(attempt.instanceKey).toBe(current.question.instanceKey)
      expect(attempt.correct).toBe(true)
      expect(attempt.latencyMs).toBe(640)
      expect(attempt.sessionId).toBe(`shared-${skill.id}`)
      expect(attempt.atMs).toBe(T0 + 640)
      expect(attempt.source).toBe('draw')
      expect(attempt.isReplay).toBe(false)
      expect(outcome.counted).toBe(true)
      if (current.question.choices) {
        const choice = current.question.choices.find((item) => item.value === current.question.correctAnswer)
          ?? current.question.choices.find((item) => JSON.stringify(item.value) === JSON.stringify(current.question.correctAnswer))
        expect(attempt.selectedChoiceId).toBe(choice?.id)
      }
    }

    const clock = { t: T0 }
    const division = new LevelSessionEngine({
      profile: profileFor(DIVISION_SKILL_ID),
      skill: createDivisionSkill(() => 0),
      mode: 'quick',
      levelId: 'L1',
      clock: () => clock.t,
      sessionId: 'division-default-source',
      learnerId: LEARNER,
    })
    expect(division.nextQuestion()?.question.answerType).toBe('multiple-choice')
  })

  it('keeps a repeated multiplication instance non-evidence', () => {
    const skill = createMultiplicationSkill(() => 0)
    const shown = generateForFact('7x8', () => 0)
    const flipped = generateForFact('7x8', () => 1)
    expect(shown.instanceKey).toBe('multiplication.fact.7x8')
    expect(flipped.instanceKey).toBe(shown.instanceKey)
    expect(shown.prompt).not.toEqual(flipped.prompt)

    const { engine, clock } = start({
      skill,
      sessionId: 'mult-instance',
      questions: [shown, flipped],
    })
    const first = answerShown(engine, clock, 1)
    const second = answerShown(engine, clock, 56)
    expect(first.outcome.counted).toBe(true)
    expect(first.outcome.correct).toBe(false)
    expect(second.outcome.counted).toBe(false)
    expect(second.outcome.correct).toBe(true)
    expect(second.outcome.attempt.instanceKey).toBe(first.outcome.attempt.instanceKey)
    expect(engine.getProfile().progress.factEvidence['7x8']?.countedAttempts).toBe(1)
  })

  it('still counts a different fraction instance of the same concept', () => {
    let draw = 0
    const sequence = [0, 0.6]
    const skill = createFractionsSkill(() => sequence[draw++] ?? 0)
    const request = {
      skillId: FRACTIONS_SKILL_ID,
      targetConcepts: ['fractions.compare.same-denominator'],
      cognitiveDifficulty: 0.5,
    }
    const firstQuestion = skill.generateQuestion(request)
    const secondQuestion = skill.generateQuestion(request)
    expect(firstQuestion.conceptIds).toEqual(['fractions.compare.same-denominator'])
    expect(secondQuestion.conceptIds).toEqual(firstQuestion.conceptIds)
    expect(secondQuestion.instanceKey).not.toBe(firstQuestion.instanceKey)
    const wrong = firstQuestion.choices?.find((choice) => choice.misconceptionId)
    expect(wrong).toBeTruthy()

    const { engine, clock } = start({
      skill,
      sessionId: 'fraction-instance',
      questions: [firstQuestion, secondQuestion],
    })
    const missed = answerShown(engine, clock, wrong?.value)
    const next = answerShown(engine, clock)
    expect(missed.outcome.correct).toBe(false)
    expect(missed.outcome.attempt.selectedChoiceId).toBe(wrong?.id)
    expect(missed.outcome.attempt.misconceptionId).toBe(wrong?.misconceptionId)
    expect(next.outcome.counted).toBe(true)
    expect(next.outcome.correct).toBe(true)
    const evidence = engine.getProfile().progress.factEvidence['fractions.compare.same-denominator']
    expect(evidence?.countedAttempts).toBe(2)
    expect(engine.getProfile().progress.factEvidence[firstQuestion.instanceKey]).toBeUndefined()
  })

  it('does not suppress every other one-step equation after one miss', () => {
    let draw = 0
    const sequence = [0, 0.6]
    const skill = createAlgebraSkill(() => sequence[draw++] ?? 0)
    const request = {
      skillId: ALGEBRA_SKILL_ID,
      targetConcepts: ['algebra.one-step.addition'],
      cognitiveDifficulty: 0.5,
    }
    const firstQuestion = skill.generateQuestion(request)
    const secondQuestion = skill.generateQuestion(request)
    expect(secondQuestion.instanceKey).not.toBe(firstQuestion.instanceKey)
    const wrong = firstQuestion.choices?.find((choice) => choice.misconceptionId)

    const { engine, clock } = start({
      skill,
      sessionId: 'algebra-instance',
      questions: [firstQuestion, secondQuestion],
    })
    const missed = answerShown(engine, clock, wrong?.value)
    const next = answerShown(engine, clock)
    expect(missed.outcome.attempt.misconceptionId).toBe(wrong?.misconceptionId)
    expect(next.outcome.counted).toBe(true)
    expect(engine.getProfile().progress.factEvidence['algebra.one-step.addition']?.countedAttempts).toBe(2)
  })

  it('cannot complete a one-concept level with zero mastered concepts', () => {
    const skill = createAlgebraSkill(() => 0.1)
    const profile = profileFor(skill.id)
    const clock = { t: T0 }
    const engine = new LevelSessionEngine({
      profile,
      skill,
      mode: 'quick',
      levelId: 'L1',
      clock: () => clock.t,
      sessionId: 'algebra-empty',
      learnerId: LEARNER,
      questionSource: (ctx) => createPluginQuestionSource(ctx),
    })
    while (!engine.isComplete()) {
      const current = engine.nextQuestion()
      if (!current) throw new Error('no question')
      clock.t += 500
      const wrong = current.question.choices?.find((choice) => choice.misconceptionId)
      engine.answer(current.question.id, wrong?.value ?? 0)
    }
    const summary = engine.finish()
    const played = engine.getProfile()
    expect(summary.advancement.newlyCompleted).toBe(false)
    expect(played.progress.completedLevelIds).not.toContain('L1')
    const level = getCurriculum(ALGEBRA_SKILL_ID).levels[0]!
    const checks = evaluateTableLevel(
      level,
      played.progress.factEvidence,
      played.progress.evidence.L1 ?? [],
      played.progress.finishedSessionsByLevel.L1 ?? 0,
    )
    expect(checks.r1).toMatchObject({ n: 1, allowance: 0, mastered: 0, pass: false })
  })

  it('keeps XP on the skill frontier and records apart from academic state', () => {
    const skill = createDivisionSkill(() => 0.3)
    const seeded = profileFor(skill.id)
    const multiplicationKey = recordKey(MULTIPLICATION_SKILL_ID, 'L1', 'quick')
    const multiplicationRecord: PersonalRecord = {
      key: multiplicationKey,
      baselineMs: 1000,
      baselineAtMs: T0,
      baselineSessionId: 'mult-base',
      bestMs: 1000,
      bestAtMs: T0,
      bestSessionId: 'mult-base',
      eligibleRuns: 1,
      timesBeaten: 0,
    }
    seeded.records[recordKeyId(multiplicationKey)] = multiplicationRecord

    const baseline = finishSession(skill, seeded, 'div-day-1', 2000, 1)
    expect(baseline.summary.record.isBaseline).toBe(true)
    expect(baseline.summary.record.key.skillId).toBe(DIVISION_SKILL_ID)
    expect(baseline.summary.xp.recordBeaten).toBe(0)
    expect(baseline.profile.records[recordKeyId(multiplicationKey)]?.bestMs).toBe(1000)
    const divisionKey = recordKeyId(baseline.summary.record.key)
    expect(divisionKey.startsWith('division|')).toBe(true)
    expect(divisionKey).not.toBe(recordKeyId(multiplicationKey))

    const entry = baseline.profile.sessionLog.at(-1)!
    expect(baseline.summary.xp).toEqual(
      xpForSession(entry, {
        levelCompletedBefore: false,
        isProgressLevel: true,
        firstFinishLevelMode: true,
        newlyMasteredFacts: baseline.summary.factsMasteredThisSession.length,
        levelCompletedNow: baseline.summary.advancement.newlyCompleted,
        recordBeaten: false,
        recordXpAvailableToday: true,
      }),
    )

    const beaten = finishSession(skill, baseline.profile, 'div-day-2', 800, 2)
    expect(beaten.summary.record.isNewRecord).toBe(true)
    expect(beaten.summary.xp.recordBeaten).toBe(RULES.xp.recordBeaten)

    const later = finishSession(skill, beaten.profile, 'div-day-2-later', 200, 2)
    expect(later.summary.record.isNewRecord).toBe(true)
    expect(later.summary.xp.recordBeaten).toBe(0)
    expect(later.profile.records[divisionKey]?.bestMs).toBe(later.summary.elapsedMs)
    expect(later.profile.records[divisionKey]?.timesBeaten).toBe(2)
    expect(later.profile.records[recordKeyId(multiplicationKey)]?.bestMs).toBe(1000)

    const replayProfile = structuredClone(baseline.profile)
    replayProfile.progress.completedLevelIds = ['L1']
    replayProfile.progress.currentLevelId = 'L2'
    replayProfile.progress.unlockedLevelIds = ['L1', 'L2']
    const replay = finishSession(skill, replayProfile, 'div-replay', 800, 4)
    expect(replay.summary.isReplay).toBe(true)
    expect(replay.summary.record.isNewRecord).toBe(true)
    expect(replay.summary.xp.recordBeaten).toBe(0)
    expect(replay.profile.records[divisionKey]?.bestMs).toBe(replay.summary.elapsedMs)
  })
})
