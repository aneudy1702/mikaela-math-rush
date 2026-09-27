import { describe, expect, it } from 'vitest'
import { algebraItemsFor } from './catalog'
import { buildAlgebraLevels } from './levels'
import { createAlgebraSkill, resetAlgebraQuestionSeq } from './plugin'

function walk(conceptId: string): Set<string> {
  const pool = algebraItemsFor(conceptId, 1)
  const keys = new Set<string>()
  for (let index = 0; index < pool.length; index++) {
    const skill = createAlgebraSkill(() => (index + 0.25) / pool.length)
    const question = skill.generateQuestion({
      skillId: 'algebra-one-step',
      targetConcepts: [conceptId],
      cognitiveDifficulty: 1,
    })
    keys.add(question.instanceKey)
  }
  return keys
}

describe('algebra one-step plugin', () => {
  it('has one level per operation plus a mix, and no fact-id gate', () => {
    const levels = buildAlgebraLevels()
    expect(levels.map((level) => level.title)).toEqual([
      'One-step addition',
      'One-step multiplication',
      'One-step subtraction',
      'One-step division',
      'Mixed one-step equations',
    ])
    expect(levels[0]?.gatingConceptIds).toEqual(['algebra.one-step.addition'])
    expect(levels[4]?.gatingConceptIds).toEqual([])
    expect(JSON.stringify(levels)).not.toContain('gatingFactIds')
  })

  it('covers x+4=11 and x+17=39 as different instances of addition', () => {
    const keys = walk('algebra.one-step.addition')
    expect(keys.has('algebra.one-step.addition:x+4=11')).toBe(true)
    expect(keys.has('algebra.one-step.addition:x+17=39')).toBe(true)
    expect(keys.size).toBeGreaterThan(2)
    const easy = algebraItemsFor('algebra.one-step.addition', 0).map((item) => item.instanceKey)
    expect(easy).toContain('algebra.one-step.addition:x+4=11')
    expect(easy).not.toContain('algebra.one-step.addition:x+17=39')
  })

  it('solves each operation and tags the inverted-operation mistake', () => {
    resetAlgebraQuestionSeq()
    const skill = createAlgebraSkill(() => 0)
    const addition = skill.generateQuestion({
      skillId: 'algebra-one-step',
      targetConcepts: ['algebra.one-step.addition'],
      cognitiveDifficulty: 0,
    })
    expect(addition.prompt).toEqual({ type: 'text', text: 'x + 4 = 11' })
    expect(addition.correctAnswer).toBe(7)
    expect(addition.choices?.some((choice) => choice.misconceptionId === 'algebra.added-instead-of-subtracted' && choice.value === 15)).toBe(true)
    expect(skill.evaluateAnswer(addition, { value: 7, respondedAtMs: 1, latencyMs: 1 }).correct).toBe(true)
    expect(skill.evaluateAnswer(addition, { value: 15, respondedAtMs: 1, latencyMs: 1 }).correct).toBe(false)

    const product = createAlgebraSkill(() => 0).generateQuestion({
      skillId: 'algebra-one-step',
      targetConcepts: ['algebra.one-step.multiplication'],
      cognitiveDifficulty: 0,
    })
    expect(product.correctAnswer).toBe(6)
    expect(product.choices?.some((choice) => choice.misconceptionId === 'algebra.multiplied-instead-of-divided')).toBe(true)

    const difference = createAlgebraSkill(() => 0).generateQuestion({
      skillId: 'algebra-one-step',
      targetConcepts: ['algebra.one-step.subtraction'],
      cognitiveDifficulty: 0,
    })
    expect(difference.prompt).toEqual({ type: 'text', text: 'x - 7 = 12' })
    expect(difference.correctAnswer).toBe(19)

    const quotient = createAlgebraSkill(() => 0).generateQuestion({
      skillId: 'algebra-one-step',
      targetConcepts: ['algebra.one-step.division'],
      cognitiveDifficulty: 0,
    })
    expect(quotient.prompt).toEqual({ type: 'text', text: 'x / 4 = 6' })
    expect(quotient.correctAnswer).toBe(24)
    expect(quotient.choices?.some((choice) => choice.misconceptionId === 'algebra.divided-instead-of-multiplied')).toBe(true)
    expect(skill.conceptIdFor?.(quotient)).toBe('algebra.one-step.division')

    const divided = createAlgebraSkill(() => 0.2).generateQuestion({
      skillId: 'algebra-one-step',
      targetConcepts: ['algebra.one-step.division'],
      cognitiveDifficulty: 0,
    })
    expect(divided.prompt).toEqual({ type: 'text', text: 'x / 3 = 6' })
    expect(divided.choices?.some((choice) => choice.misconceptionId === 'algebra.divided-instead-of-multiplied' && choice.value === 2)).toBe(true)
  })

  it('keeps choice values unique, including the colliding subtraction and division items', () => {
    for (const conceptId of [
      'algebra.one-step.addition',
      'algebra.one-step.multiplication',
      'algebra.one-step.subtraction',
      'algebra.one-step.division',
    ]) {
      const pool = algebraItemsFor(conceptId, 1)
      for (let index = 0; index < pool.length; index++) {
        const question = createAlgebraSkill(() => (index + 0.25) / pool.length).generateQuestion({
          skillId: 'algebra-one-step',
          targetConcepts: [conceptId],
          cognitiveDifficulty: 1,
        })
        const values = question.choices?.map((choice) => choice.value) ?? []
        expect(new Set(values).size).toBe(values.length)
        if (conceptId === 'algebra.one-step.division') {
          expect(question.choices?.some((choice) => choice.misconceptionId === 'algebra.divided-instead-of-multiplied')).toBe(true)
        }
      }
    }
  })
})
