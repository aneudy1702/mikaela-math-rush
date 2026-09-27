import { describe, expect, it } from 'vitest'
import { buildDivisionLevels } from './levels'
import { DIVISION_CONCEPTS, divisionConceptId, divisionRelationships } from './concepts'
import { createDivisionSkill, resetDivisionQuestionSeq } from './plugin'

describe('division plugin', () => {
  it('keeps 56÷7 and 56÷8 as different concepts linked to the same multiplication fact', () => {
    const bySeven = DIVISION_CONCEPTS.find((concept) => concept.id === divisionConceptId(56, 7))
    const byEight = DIVISION_CONCEPTS.find((concept) => concept.id === divisionConceptId(56, 8))
    expect(bySeven?.quotient).toBe(8)
    expect(byEight?.quotient).toBe(7)
    expect(bySeven?.id).not.toBe(byEight?.id)
    expect(bySeven?.inverseConceptId).toBe('multiplication.fact.7x8')
    expect(byEight?.inverseConceptId).toBe('multiplication.fact.7x8')
    const link = divisionRelationships().find((item) => item.fromId === divisionConceptId(56, 7))
    expect(link).toEqual({
      fromId: 'division.fact.56÷7',
      toId: 'multiplication.fact.7x8',
      kind: 'inverse',
    })
  })

  it('owns divide-by-2 on the first level and divide-by-7 on level 7, with no fact-id gate', () => {
    const levels = buildDivisionLevels()
    expect(levels.map((level) => level.title)).toEqual([
      'Divide by 1 and 2',
      'Divide by 10',
      'Divide by 5',
      'Divide by 3',
      'Divide by 4',
      'Divide by 6',
      'Divide by 7',
      'Divide by 8 and 9',
      'Mixed division within 100',
    ])
    const first = levels[0]!
    expect(first.introConceptIds).toContain(divisionConceptId(7, 1))
    expect(first.gatingConceptIds).toContain(divisionConceptId(14, 2))
    expect(first.introConceptIds).not.toContain(divisionConceptId(14, 2))
    const bySeven = levels[6]!
    expect(bySeven.gatingConceptIds).toContain(divisionConceptId(56, 7))
    expect(bySeven.gatingConceptIds).not.toContain(divisionConceptId(56, 8))
    expect(levels[8]?.conceptIds).toEqual([])
    expect(JSON.stringify(levels)).not.toContain('gatingFactIds')
  })

  it('asks the targeted concept and tags wrong choices', () => {
    resetDivisionQuestionSeq()
    const skill = createDivisionSkill(() => 0)
    const question = skill.generateQuestion({
      skillId: 'division',
      targetConcepts: [divisionConceptId(56, 7)],
      cognitiveDifficulty: 1,
    })
    expect(question.instanceKey).toBe('division.fact.56÷7')
    expect(question.conceptIds).toEqual(['division.fact.56÷7'])
    expect(skill.conceptIdFor?.(question)).toBe('division.fact.56÷7')
    expect(question.prompt).toEqual({ type: 'expression', expression: '56 ÷ 7' })
    expect(question.correctAnswer).toBe(8)
    const wrong = question.choices?.filter((choice) => choice.value !== 8) ?? []
    expect(wrong.length).toBeGreaterThan(0)
    expect(wrong.every((choice) => typeof choice.misconceptionId === 'string')).toBe(true)
    expect(wrong.some((choice) => choice.misconceptionId === 'division.answered-product' && choice.value === 56)).toBe(true)

    const right = skill.evaluateAnswer(question, { value: 8, respondedAtMs: 1, latencyMs: 1 })
    const miss = skill.evaluateAnswer(question, { value: 56, respondedAtMs: 1, latencyMs: 1 })
    expect(right.correct).toBe(true)
    expect(miss.correct).toBe(false)
    expect(miss.expected).toBe(8)
  })
})
