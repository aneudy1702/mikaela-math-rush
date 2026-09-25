import { describe, expect, it, beforeEach } from 'vitest'
import {
  canonicalFactId,
  createMultiplicationSkill,
  resetQuestionSeq,
  parseFactId,
  CORE_FACTS,
} from './index'
import type { Answer, Question } from '../../contracts'

describe('multiplication plugin', () => {
  beforeEach(() => {
    resetQuestionSeq()
  })

  it('generates expression + numeric questions with stable factId', () => {
    const skill = createMultiplicationSkill(() => 0)
    const q = skill.generateQuestion({
      skillId: 'multiplication',
      targetConcepts: ['7x8'],
      cognitiveDifficulty: 0.5,
    })
    expect(q.prompt.type).toBe('expression')
    expect(q.answerType).toBe('numeric')
    expect(q.correctAnswer).toBe(56)
    expect(q.metadata?.factId).toBe('7x8')
  })

  it('keeps fact IDs canonical across factor order', () => {
    expect(canonicalFactId(8, 7)).toBe('7x8')
    expect(canonicalFactId(7, 8)).toBe('7x8')
    expect(parseFactId('7x8')).toEqual({ a: 7, b: 8 })
  })

  it('evaluates numeric answers correctly', () => {
    const skill = createMultiplicationSkill()
    const question: Question = {
      id: 't1',
      skillId: 'multiplication',
      difficulty: 0.5,
      prompt: { type: 'expression', expression: '6 × 7' },
      answerType: 'numeric',
      correctAnswer: 42,
      metadata: { factId: '6x7', a: 6, b: 7 },
    }
    const ok: Answer = { value: 42, respondedAtMs: 1, latencyMs: 900 }
    const miss: Answer = { value: 40, respondedAtMs: 1, latencyMs: 900 }
    expect(skill.evaluateAnswer(question, ok).correct).toBe(true)
    const bad = skill.evaluateAnswer(question, miss)
    expect(bad.correct).toBe(false)
    expect(bad.feedbackHint).toContain('42')
  })

  it('covers core facts within product 100', () => {
    expect(CORE_FACTS.every((f) => f.product <= 100)).toBe(true)
    expect(CORE_FACTS.some((f) => f.factId === '7x8')).toBe(true)
    expect(CORE_FACTS.some((f) => f.factId === '10x10')).toBe(true)
  })
})
