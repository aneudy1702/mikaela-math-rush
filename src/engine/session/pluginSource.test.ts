import { describe, expect, it } from 'vitest'
import { ALGEBRA_SKILL_ID, createAlgebraSkill } from '../content/algebra'
import type { LearnerProfile, Question } from '../contracts'
import '../curriculum/shipped'
import { factMarks, factStatus } from '../learning/advancement'
import { createEmptyProfile, createEmptySkillProgress } from '../learning/selection'
import { LevelSessionEngine, type SessionQuestionSource } from './levelSession'

const ADDITION = 'algebra.one-step.addition'

function profile(): LearnerProfile {
  const next = createEmptyProfile('Mikaela', 1_000)
  next.progress = createEmptySkillProgress(ALGEBRA_SKILL_ID)
  return next
}

function play(engine: LevelSessionEngine, clock: { t: number }, count: number): Question[] {
  const shown: Question[] = []
  for (let index = 0; index < count; index += 1) {
    const current = engine.nextQuestion()
    if (!current) throw new Error('no question')
    shown.push(current.question)
    clock.t += 500
    engine.answer(current.question.id, current.question.correctAnswer)
  }
  return shown
}

function repeatSource(question: Question): SessionQuestionSource {
  let n = 0
  return {
    seedPending() {
      return 0
    },
    nextQuestion() {
      n += 1
      return {
        question: { ...question, id: `${question.id}-repeat-${n}` },
        pick: { factId: ADDITION, source: 'draw', pool: 'level', likely: false, carried: false },
      }
    },
    recordAnswer() {},
    discardLast() {
      return false
    },
    exportPending() {
      return []
    },
  }
}

describe('one-step addition variety', () => {
  it('walks eight distinct addition instances, then allows a repeat', () => {
    const clock = { t: 1_000 }
    const engine = new LevelSessionEngine({
      profile: profile(),
      skill: createAlgebraSkill(() => 0),
      mode: 'quick',
      levelId: 'L1',
      learnerId: 'learner-variety',
      clock: () => clock.t,
      sessionId: 'addition-variety',
    })
    const shown = play(engine, clock, 9)
    const keys = shown.map((question) => question.instanceKey)
    expect(new Set(keys.slice(0, 8)).size).toBe(8)
    expect(shown.every((question) => question.conceptIds[0] === ADDITION)).toBe(true)
    expect(keys[8]).toBe(keys[0])
    expect(shown[8]?.id).not.toBe(shown[0]?.id)

    const shuffled = {
      ...shown[0]!,
      choices: [...(shown[0]?.choices ?? [])].reverse(),
    }
    expect(shuffled.instanceKey).toBe(shown[0]?.instanceKey)
    expect(shuffled.conceptIds).toEqual([ADDITION])
  })

  it('keeps mastery and XP on the addition concept when instances vary', () => {
    const firstClock = { t: 1_000 }
    const varied = new LevelSessionEngine({
      profile: profile(),
      skill: createAlgebraSkill(() => 0),
      mode: 'quick',
      levelId: 'L1',
      learnerId: 'learner-variety',
      clock: () => firstClock.t,
      sessionId: 'addition-varied-xp',
    })
    const shown = play(varied, firstClock, 1)
    const repeatClock = { t: 1_000 }
    const repeated = new LevelSessionEngine({
      profile: profile(),
      skill: createAlgebraSkill(() => 0),
      mode: 'quick',
      levelId: 'L1',
      learnerId: 'learner-variety',
      clock: () => repeatClock.t,
      sessionId: 'addition-repeated-xp',
      questionSource: () => repeatSource(shown[0]!),
    })
    play(varied, firstClock, 9)
    play(repeated, repeatClock, 10)
    const variedSummary = varied.finish()
    const repeatedSummary = repeated.finish()

    const variedEvidence = varied.getProfile().progress.factEvidence[ADDITION]
    const repeatedEvidence = repeated.getProfile().progress.factEvidence[ADDITION]
    expect(Object.keys(varied.getProfile().progress.factEvidence)).toEqual([ADDITION])
    expect(factMarks(variedEvidence)).toBe(factMarks(repeatedEvidence))
    expect(factStatus(variedEvidence)).toBe(factStatus(repeatedEvidence))
    expect(variedSummary.xp).toEqual(repeatedSummary.xp)
    expect(varied.getProfile().player.xp).toBe(repeated.getProfile().player.xp)
  })
})