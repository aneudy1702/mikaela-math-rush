import { describe, expect, it } from 'vitest'
import { recommendedSkill } from './recommend'

describe('recommended skill', () => {
  it('uses grade, not the last active path', () => {
    expect(recommendedSkill(undefined).id).toBe('multiplication')
    expect(recommendedSkill(3).id).toBe('division')
    expect(recommendedSkill(4).id).toBe('fractions')
    expect(recommendedSkill(6).id).toBe('algebra-one-step')
  })
})
