import { describe, expect, it } from 'vitest'
import { QuestionOrchestrator } from '../orchestrator'
import { createMultiplicationSkill } from '../content/multiplication'
import { createEmptyProfile } from '../learning'
import type { Question } from '../contracts'

function fixedRng(values: number[]): () => number {
  let i = 0
  return () => {
    const v = values[i % values.length]!
    i += 1
    return v
  }
}

describe('spaced reinforcement', () => {
  it('schedules reintroduce 3–8 questions after a miss', () => {
    const skill = createMultiplicationSkill(() => 0)
    const orch = new QuestionOrchestrator({
      skill,
      rng: fixedRng([0, 0.5, 0]), // delay picks low end of range
      reintroduceDelayRange: [3, 8],
    })
    const profile = createEmptyProfile()

    const { question } = orch.nextQuestion(profile)
    const factId = String(question.metadata?.factId)

    orch.submitAnswer(
      profile,
      question,
      { value: -1, respondedAtMs: 1, latencyMs: 1000 },
      false,
    )

    const scheduled = orch.getScheduled()
    expect(scheduled.length).toBe(1)
    expect(scheduled[0]!.factId).toBe(factId)
    expect(scheduled[0]!.kind).toBe('reintroduce')
    const delay = scheduled[0]!.dueAtIndex - orch.index
    expect(delay).toBeGreaterThanOrEqual(3)
    expect(delay).toBeLessThanOrEqual(8)
  })

  it('reintroduces the missed fact when due, then schedules later check on success', () => {
    const skill = createMultiplicationSkill(() => 0)
    // Force delay = 3 (lo + floor(0*(hi-lo+1)))
    const orch = new QuestionOrchestrator({
      skill,
      rng: () => 0,
      reintroduceDelayRange: [3, 3],
      laterCheckDelayRange: [5, 5],
    })
    const profile = createEmptyProfile()

    const first = orch.nextQuestion(profile)
    const missedId = String(first.question.metadata?.factId)
    orch.submitAnswer(
      profile,
      first.question,
      { value: -1, respondedAtMs: 1, latencyMs: 500 },
      false,
    )

    // After miss at index 1 with delay 3, dueAtIndex = 4.
    // Three fillers then the due check fires on the next serve.
    orch.nextQuestion(profile)
    orch.nextQuestion(profile)
    orch.nextQuestion(profile)

    const reinforced = orch.nextQuestion(profile)
    expect(reinforced.isReinforcement).toBe(true)
    expect(reinforced.question.metadata?.factId).toBe(missedId)

    orch.submitAnswer(
      profile,
      reinforced.question,
      {
        value: reinforced.question.correctAnswer,
        respondedAtMs: 2,
        latencyMs: 800,
      },
      true,
    )

    const later = orch.getScheduled()
    expect(later.some((e) => e.kind === 'later-check' && e.factId === missedId)).toBe(
      true,
    )
  })

  it('updates mastery on the learner profile', () => {
    const skill = createMultiplicationSkill(() => 0)
    const orch = new QuestionOrchestrator({ skill, rng: () => 0 })
    const profile = createEmptyProfile()
    const { question } = orch.nextQuestion(profile)
    const factId = String(question.metadata?.factId)
    orch.submitAnswer(
      profile,
      question as Question,
      {
        value: question.correctAnswer,
        respondedAtMs: 10,
        latencyMs: 700,
      },
      false,
    )
    expect(profile.facts[factId]!.attempts).toBe(1)
    expect(profile.facts[factId]!.correct).toBe(1)
  })
})
