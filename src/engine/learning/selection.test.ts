import { describe, expect, it } from 'vitest'
import { createEmptyProfile, selectNextFact, applyAttempt } from '../learning'
import { DEFAULT_SELECTION_STRATEGY } from '../contracts'

describe('adaptive selection', () => {
  it('preferentially targets weak / low-confidence facts with Rush weights', () => {
    const profile = createEmptyProfile('Test', 0)
    // Make a few facts strong with high confidence.
    for (const factId of ['2x2', '2x3', '3x3', '2x4', '3x4']) {
      let rec = profile.facts[factId]!
      for (let i = 0; i < 8; i++) {
        rec = applyAttempt(rec, {
          correct: true,
          latencyMs: 800,
          atMs: 1000 + i,
        })
      }
      profile.facts[factId] = rec
    }

    const counts = { review: 0, target: 0, challenge: 0, stretch: 0 }
    let rngState = 0
    const rng = () => {
      rngState += 1
      return (rngState * 0.173) % 1
    }

    for (let i = 0; i < 80; i++) {
      const pick = selectNextFact(profile, {
        strategy: DEFAULT_SELECTION_STRATEGY,
        rng,
        avoidDuplicates: false,
      })
      counts[pick.bucket] += 1
    }

    // Target weight (60) should dominate when many unmastered facts exist.
    expect(counts.target).toBeGreaterThan(counts.review)
    expect(counts.target).toBeGreaterThan(counts.challenge)
  })

  it('avoids recent duplicates when alternatives exist', () => {
    const profile = createEmptyProfile()
    const recent = ['2x2', '2x3', '2x4', '3x3', '3x4']
    const picks = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const { factId } = selectNextFact(profile, {
        recentFactIds: recent,
        avoidDuplicates: true,
        rng: () => (i * 0.37) % 1,
      })
      picks.add(factId)
      expect(recent.includes(factId)).toBe(false)
    }
    expect(picks.size).toBeGreaterThan(1)
  })
})
