import { describe, expect, it } from 'vitest'
import {
  buildPlacementSequence,
  completePlacement,
  createEmptyProfile,
  seedPlacementAttempt,
} from './index'
import { CORE_FACTS } from '../content/multiplication'

describe('placement seeding', () => {
  it('samples across multiple bands, not a single band', () => {
    const items = buildPlacementSequence(16, () => 0.41)
    expect(items.length).toBe(16)
    const bands = new Set(
      items.map((item) => CORE_FACTS.find((f) => f.factId === item.factId)?.band),
    )
    expect(bands.size).toBeGreaterThanOrEqual(4)
  })

  it('writes estimated mastery into the learner profile across facts', () => {
    const profile = createEmptyProfile('Test', 0)
    const items = buildPlacementSequence(12, () => 0.2)
    for (const item of items) {
      seedPlacementAttempt(profile, item.factId, true, 1200, 1000)
    }
    completePlacement(profile, 2000)
    expect(profile.placementComplete).toBe(true)
    const touched = Object.values(profile.facts).filter((f) => f.attempts > 0)
    expect(touched.length).toBeGreaterThanOrEqual(10)
    // Confidence stays modest — placement is seeding, not mastery claims.
    expect(touched.every((f) => f.confidence < 0.5)).toBe(true)
  })
})
