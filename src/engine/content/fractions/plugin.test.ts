import { describe, expect, it } from 'vitest'
import { FRACTION_ITEMS, fractionItemsFor } from './catalog'
import { buildFractionLevels } from './levels'
import { createFractionsSkill, resetFractionQuestionSeq } from './plugin'

function walk(conceptId: string): Set<string> {
  const pool = fractionItemsFor(conceptId, 1)
  const keys = new Set<string>()
  for (let index = 0; index < pool.length; index++) {
    const skill = createFractionsSkill(() => (index + 0.25) / pool.length)
    const question = skill.generateQuestion({
      skillId: 'fractions',
      targetConcepts: [conceptId],
      cognitiveDifficulty: 1,
    })
    keys.add(question.instanceKey)
  }
  return keys
}

describe('fractions plugin', () => {
  it('puts one strategy concept on each level and no fact-id gate', () => {
    const levels = buildFractionLevels()
    expect(levels.map((level) => level.gatingConceptIds[0])).toEqual([
      'fractions.identify.visual',
      'fractions.parts.numerator-denominator',
      'fractions.number-line',
      'fractions.compare.same-denominator',
      'fractions.compare.same-numerator',
      'fractions.equivalent',
      'fractions.compare.mixed',
    ])
    expect(levels.every((level) => level.gatingConceptIds.length === 1)).toBe(true)
    expect(JSON.stringify(levels)).not.toContain('gatingFactIds')
  })

  it('covers same-denominator pairs beyond the easiest one', () => {
    const keys = walk('fractions.compare.same-denominator')
    expect(keys.has('fractions.compare.same-denominator:3/8|5/8')).toBe(true)
    expect(keys.has('fractions.compare.same-denominator:7/12|11/12')).toBe(true)
    expect(keys.size).toBeGreaterThan(2)
  })

  it('uses a different instance for each pair under the same concept', () => {
    const same = FRACTION_ITEMS.filter((item) => item.conceptId === 'fractions.compare.same-denominator')
    const keys = new Set(same.map((item) => item.instanceKey))
    expect(keys.size).toBe(same.length)
    expect(same.every((item) => item.conceptId === 'fractions.compare.same-denominator')).toBe(true)
  })

  it('asks a visual identify question and a fraction comparison with tagged distractors', () => {
    resetFractionQuestionSeq()
    const visual = createFractionsSkill(() => 0).generateQuestion({
      skillId: 'fractions',
      targetConcepts: ['fractions.identify.visual'],
      cognitiveDifficulty: 1,
    })
    expect(visual.answerType).toBe('visual-selection')
    expect(visual.prompt.type).toBe('visual')
    expect(visual.instanceKey).toBe('fractions.identify.visual:3/8')
    expect(visual.choices?.some((choice) => choice.misconceptionId === 'fractions.inverted')).toBe(true)

    const compared = createFractionsSkill(() => 0).generateQuestion({
      skillId: 'fractions',
      targetConcepts: ['fractions.compare.same-denominator'],
      cognitiveDifficulty: 0,
    })
    expect(compared.answerType).toBe('fraction')
    expect(compared.instanceKey).toBe('fractions.compare.same-denominator:3/8|5/8')
    expect(compared.correctAnswer).toEqual({ numerator: 5, denominator: 8 })
    const skill = createFractionsSkill()
    expect(skill.evaluateAnswer(compared, {
      value: { numerator: 5, denominator: 8 },
      respondedAtMs: 1,
      latencyMs: 1,
    }).correct).toBe(true)
    expect(skill.evaluateAnswer(compared, {
      value: { numerator: 3, denominator: 8 },
      respondedAtMs: 1,
      latencyMs: 1,
    }).correct).toBe(false)
    expect(skill.conceptIdFor?.(compared)).toBe('fractions.compare.same-denominator')
  })
})
