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
    expect(summary?.previousBestTimeMs).toBeNull()
    expect(summary?.deltaVsPreviousBestMs).toBeNull()
    expect(engine.getProfile().gameXp).toBeGreaterThan(0)
    expect(engine.getProfile().dailyStreak).toBe(1)
  })

  it('holds soft miss on the same fact until correct product is typed', () => {
    const skill = createMultiplicationSkill(() => 0)
    const profile = createEmptyProfile()
    const engine = new SessionEngine(profile, skill, 'quick', () => 0)
    engine.start(1000)
    const q = engine.snapshot(1000).current!.question
    const expected = Number(q.correctAnswer)

    let snap = engine.submit(-1, 1500)
    expect(snap.missHold).not.toBeNull()
    expect(snap.timerPaused).toBe(true)
    expect(snap.missHold?.expected).toBe(expected)
    expect(snap.finished).toBe(false)

    // Wrong continue keeps hold.
    snap = engine.submit(expected - 1, 2000)
    expect(snap.missHold).not.toBeNull()

    // Correct continue advances without awarding extra correctCount for the retype.
    snap = engine.submit(expected, 2500)
    expect(snap.missHold).toBeNull()
    expect(snap.timerPaused).toBe(false)
    expect(snap.correctCount).toBe(0)
    expect(snap.current).not.toBeNull()
  })

  it('persists pending reinforcement for the next session', () => {
    const skill = createMultiplicationSkill(() => 0)
    const profile = createEmptyProfile()
    const engine = new SessionEngine(profile, skill, 'quick', () => 0)
    engine.start(1000)
    const q = engine.snapshot(1000).current!.question
    const expected = Number(q.correctAnswer)
    const factId = String(q.metadata?.factId)

    engine.submit(-1, 1100)
    engine.submit(expected, 1200)

    // Burn remaining questions correctly so session finishes with pending queue.
    for (let i = 0; i < 9; i++) {
      const cur = engine.snapshot(2000 + i).current
      if (!cur) break
      let snap = engine.submit(cur.question.correctAnswer, 2000 + i)
      if (snap.missHold) {
        snap = engine.submit(snap.missHold.expected, 2000 + i + 1)
      }
    }

    const pending = engine.getProfile().pendingReinforcements
    expect(pending.some((p) => p.factId === factId)).toBe(true)

    const next = new SessionEngine(engine.getProfile(), skill, 'quick', () => 0)
    next.start(5000)
    expect(next.getProfile().pendingReinforcements).toEqual([])
  })
})
