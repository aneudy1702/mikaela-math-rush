import { describe, expect, it } from 'vitest'
import type { Question } from '../../contracts'
import { CORE_FACTS, STRETCH_FACTS } from './facts'
import { CHOICE_COUNT, multiplicationChoices } from './choices'

function questionFor(a: number, b: number, id = `${a}x${b}`): Question {
  return {
    id,
    skillId: 'multiplication',
    difficulty: 0.5,
    prompt: { type: 'expression', expression: `${a} × ${b}` },
    answerType: 'numeric',
    correctAnswer: a * b,
    metadata: { a, b, factId: `${Math.min(a, b)}x${Math.max(a, b)}` },
  }
}

describe('multiplicationChoices', () => {
  it('offers four unique positive choices and always includes the product', () => {
    for (const fact of [...CORE_FACTS, ...STRETCH_FACTS]) {
      const choices = multiplicationChoices(questionFor(fact.a, fact.b, fact.factId))
      expect(choices).toHaveLength(CHOICE_COUNT)
      expect(new Set(choices).size).toBe(CHOICE_COUNT)
      expect(choices.every((value) => Number.isInteger(value) && value >= 1)).toBe(true)
      expect(choices).toContain(fact.product)
    }
  })

  it('keeps the same order for the same question', () => {
    const question = questionFor(7, 8, 'q-7x8')
    expect(multiplicationChoices(question)).toEqual(multiplicationChoices(question))
  })

  it('uses nearby factor mistakes for 7 × 8', () => {
    const choices = multiplicationChoices(questionFor(7, 8, 'q-7x8'))
    const wrong = choices.filter((value) => value !== 56)
    expect(wrong.every((value) => Math.abs(value - 56) <= 16 || value === 15)).toBe(true)
    expect(wrong).not.toContain(0)
  })

  it('never offers zero or a negative for 1 × 1', () => {
    const choices = multiplicationChoices(questionFor(1, 1, 'q-1x1'))
    expect(choices).toContain(1)
    expect(choices.every((value) => value >= 1)).toBe(true)
  })

  it('reads factors from the expression when metadata is missing', () => {
    const question = questionFor(6, 7, 'q-expr')
    delete question.metadata
    const choices = multiplicationChoices(question)
    expect(choices).toContain(42)
    expect(choices).toHaveLength(CHOICE_COUNT)
  })
})
