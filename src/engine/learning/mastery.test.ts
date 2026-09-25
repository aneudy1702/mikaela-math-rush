import { describe, expect, it } from 'vitest'
import {
  MASTERY_CONFIG,
  applyAttempt,
  computeMastery,
  confidenceFromSamples,
  emptyFactRecord,
  isMasteredFact,
} from './mastery'

describe('mastery calculation', () => {
  it('keeps confidence low before min sample', () => {
    expect(confidenceFromSamples(1)).toBeLessThan(0.45)
    expect(confidenceFromSamples(4)).toBeLessThan(0.45)
    expect(
      confidenceFromSamples(MASTERY_CONFIG.minSamplesForHighConfidence),
    ).toBeGreaterThanOrEqual(0.45)
    expect(
      confidenceFromSamples(MASTERY_CONFIG.samplesForFullConfidence),
    ).toBe(1)
  })

  it('does not mark mastered after a single correct', () => {
    let record = emptyFactRecord('7x8')
    record = applyAttempt(record, {
      correct: true,
      latencyMs: 800,
      atMs: 1000,
    })
    expect(record.attempts).toBe(1)
    expect(record.confidence).toBeLessThan(0.45)
    expect(isMasteredFact(record)).toBe(false)
  })

  it('raises mastery with accurate fast recent samples', () => {
    const now = 10_000
    const recent = Array.from({ length: 8 }, (_, i) => ({
      correct: true,
      latencyMs: 900,
      atMs: now - (8 - i) * 1000,
    }))
    const { mastery, confidence } = computeMastery(recent, now, now)
    expect(confidence).toBe(1)
    expect(mastery).toBeGreaterThan(0.7)
  })

  it('penalizes slow or inaccurate recent attempts', () => {
    const now = 10_000
    const mixed = [
      { correct: false, latencyMs: 4000, atMs: now - 7000 },
      { correct: false, latencyMs: 5000, atMs: now - 6000 },
      { correct: true, latencyMs: 4500, atMs: now - 5000 },
      { correct: false, latencyMs: 6000, atMs: now - 4000 },
      { correct: true, latencyMs: 5000, atMs: now - 3000 },
      { correct: false, latencyMs: 5500, atMs: now - 2000 },
      { correct: true, latencyMs: 4800, atMs: now - 1000 },
      { correct: false, latencyMs: 5200, atMs: now },
    ]
    const { mastery } = computeMastery(mixed, now, now)
    expect(mastery).toBeLessThan(0.55)
  })
})
