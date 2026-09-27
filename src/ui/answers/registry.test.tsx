import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createAlgebraSkill } from '../../engine/content/algebra/plugin'
import { ALGEBRA_SKILL_ID } from '../../engine/content/algebra/catalog'
import { createDivisionSkill } from '../../engine/content/division/plugin'
import { DIVISION_SKILL_ID } from '../../engine/content/division/concepts'
import { createFractionsSkill } from '../../engine/content/fractions/plugin'
import { FRACTIONS_SKILL_ID } from '../../engine/content/fractions/catalog'
import { createMultiplicationSkill } from '../../engine/content/multiplication/plugin'
import { MULTIPLICATION_SKILL_ID } from '../../engine/content/multiplication/plugin'
import { SharedQuestion } from './SharedQuestion'
import { rendererFor } from './rendererFor'

describe('answer renderer registry', () => {
  it('renders shipped questions from the answer type, not the skill', () => {
    const division = createDivisionSkill(() => 0).generateQuestion({
      skillId: DIVISION_SKILL_ID,
      cognitiveDifficulty: 0.5,
    })
    const algebra = createAlgebraSkill(() => 0).generateQuestion({
      skillId: ALGEBRA_SKILL_ID,
      targetConcepts: ['algebra.one-step.addition'],
      cognitiveDifficulty: 0.5,
    })
    expect(division.answerType).toBe('multiple-choice')
    expect(algebra.answerType).toBe('multiple-choice')
    expect(rendererFor(division.answerType)).toBe(rendererFor(algebra.answerType))

    const divisionHtml = renderToStaticMarkup(<SharedQuestion question={division} />)
    const algebraHtml = renderToStaticMarkup(<SharedQuestion question={algebra} />)
    expect(divisionHtml).toContain('data-answer-type="multiple-choice"')
    expect(algebraHtml).toContain('data-answer-type="multiple-choice"')
    expect(divisionHtml).toContain('mr-answer')
    expect(algebraHtml).toContain('mr-answer')
  })

  it('renders fraction visual choices and keeps numeric entry available', () => {
    const fractions = createFractionsSkill(() => 0)
    const visual = fractions.generateQuestion({
      skillId: FRACTIONS_SKILL_ID,
      targetConcepts: ['fractions.identify.visual'],
      cognitiveDifficulty: 0.5,
    })
    const compare = fractions.generateQuestion({
      skillId: FRACTIONS_SKILL_ID,
      targetConcepts: ['fractions.compare.same-denominator'],
      cognitiveDifficulty: 0.5,
    })
    const parts = fractions.generateQuestion({
      skillId: FRACTIONS_SKILL_ID,
      targetConcepts: ['fractions.parts.numerator-denominator'],
      cognitiveDifficulty: 0.5,
    })
    const multiplication = createMultiplicationSkill(() => 0).generateQuestion({
      skillId: MULTIPLICATION_SKILL_ID,
      targetConcepts: ['7x8'],
      cognitiveDifficulty: 0.5,
    })

    expect(visual.answerType).toBe('visual-selection')
    expect(compare.answerType).toBe('fraction')
    expect(parts.answerType).toBe('numeric')
    expect(multiplication.answerType).toBe('numeric')
    expect(rendererFor(parts.answerType)).toBe(rendererFor(multiplication.answerType))

    const visualHtml = renderToStaticMarkup(<SharedQuestion question={visual} />)
    expect(visualHtml).toContain('data-answer-type="visual-selection"')
    expect(visualHtml).toContain('tiles')
    expect(visualHtml).toContain('equal parts')

    const compareHtml = renderToStaticMarkup(<SharedQuestion question={compare} />)
    expect(compareHtml).toContain('data-answer-type="fraction"')
    expect(compareHtml).toContain('mr-fraction')

    const numericHtml = renderToStaticMarkup(<SharedQuestion question={parts} />)
    expect(numericHtml).toContain('aria-label="Numeric answer"')
    expect(renderToStaticMarkup(<SharedQuestion question={multiplication} />)).toContain(
      'aria-label="Numeric answer"',
    )
  })
})
