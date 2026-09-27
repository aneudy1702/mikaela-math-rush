import { describe, expect, it } from 'vitest'
import { ALGEBRA_SKILL_ID, createAlgebraSkill } from '../content/algebra'
import '../curriculum/shipped'
import { createEmptyProfile, createEmptySkillProgress } from '../learning/selection'
import { LevelSessionEngine } from './levelSession'

describe('plugin question variety', () => {
  it('walks the other addition equations before repeating x + 8 = 13', () => {
    const profile = createEmptyProfile('Mikaela', 1_000)
    profile.progress = createEmptySkillProgress(ALGEBRA_SKILL_ID)
    const engine = new LevelSessionEngine({
      profile,
      skill: createAlgebraSkill(() => 0),
      mode: 'quick',
      levelId: 'L1',
      learnerId: 'learner-variety',
      clock: () => 1_000,
      sessionId: 'algebra-variety',
    })
    const prompts: string[] = []
    for (let index = 0; index < 8; index += 1) {
      const current = engine.nextQuestion()
      if (!current) throw new Error('no question')
      const prompt = current.question.prompt
      prompts.push(prompt.type === 'text' ? prompt.text : '')
      engine.answer(current.question.id, current.question.correctAnswer)
    }
    expect(new Set(prompts).size).toBe(prompts.length)
    expect(prompts.filter((prompt) => prompt === 'x + 8 = 13')).toEqual(['x + 8 = 13'])
    expect(prompts[0]).toBe('x + 4 = 11')
    expect(prompts[1]).not.toBe(prompts[0])
  })
})