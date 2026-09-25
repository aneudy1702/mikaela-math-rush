import { describe, expect, it } from 'vitest'
import { SessionEngine } from './session'
import { createMultiplicationSkill } from '../content/multiplication'
import { createEmptyProfile } from '../learning'

describe('session engine vertical loop', () => {
  it('runs a 10-question quick session with boss flag on 10th', () => {
    const skill = createMultiplicationSkill(() => 0.2)
    const profile = createEmptyProfile()
    const engine = new SessionEngine(profile, skill, 'quick', () => 0.2)
    let snap = engine.start(1000)
    expect(snap.total).toBe(10)
    expect(snap.current).not.toBeNull()

    for (let i = 0; i < 10; i++) {
      const current = engine.snapshot(1000 + i * 500).current
      expect(current).not.toBeNull()
      if (i === 9) {
        expect(current!.isBossPresentation).toBe(true)
      }
      const answer = current!.question.correctAnswer
      snap = engine.submit(answer, 1000 + i * 500 + 400)
    }

    expect(snap.finished).toBe(true)
    const summary = engine.getSummary()
    expect(summary?.correctCount).toBe(10)
    expect(summary?.total).toBe(10)
    expect(engine.getProfile().gameXp).toBeGreaterThan(0)
  })
})
