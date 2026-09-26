import { describe, expect, it } from 'vitest'
import {
  canonicalFactId,
  isCanonicalFactId,
  isCoreFactId,
  parseFactId,
} from './factId'
import { createMultiplicationSkill, generateForFact } from '../content/multiplication'
import { QuestionOrchestrator } from '../orchestrator'
import { createEmptyProfile } from '../learning'

describe('D9 canonical fact ID', () => {
  it('maps all 100 ordered pairs 1–10 to exactly 55 IDs', () => {
    const ids = new Set<string>()
    for (let a = 1; a <= 10; a++) {
      for (let b = 1; b <= 10; b++) ids.add(canonicalFactId(a, b))
    }
    expect(ids.size).toBe(55)
    for (const id of ids) {
      expect(isCanonicalFactId(id)).toBe(true)
      expect(isCoreFactId(id)).toBe(true)
    }
  })

  it('8×7 and 7×8 are one concept', () => {
    expect(canonicalFactId(8, 7)).toBe('7x8')
    expect(canonicalFactId(7, 8)).toBe('7x8')
    expect(canonicalFactId(12, 11)).toBe('11x12')
  })

  it('parseFactId is strict', () => {
    expect(parseFactId('7x8')).toEqual({ a: 7, b: 8 })
    expect(parseFactId('10x12')).toEqual({ a: 10, b: 12 })
    expect(parseFactId('9x9')).toEqual({ a: 9, b: 9 })
    for (const bad of ['07x8', '8x7', '7X8', '7×8', ' 7x8', '7x8 ', '0x5', '13x1', '1x13', 'x8', '7x', '7x8x9', '']) {
      expect(() => parseFactId(bad), bad).toThrow()
      expect(isCanonicalFactId(bad), bad).toBe(false)
    }
  })

  it('round-trips every factor pair 1–12', () => {
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const id = canonicalFactId(a, b)
        const p = parseFactId(id)
        expect(canonicalFactId(p.a, p.b)).toBe(id)
        expect(p.a * p.b).toBe(a * b)
      }
    }
  })

  it('rejects invalid factors', () => {
    expect(() => canonicalFactId(0, 5)).toThrow()
    expect(() => canonicalFactId(13, 2)).toThrow()
    expect(() => canonicalFactId(2.5, 2)).toThrow()
  })

  it('core space is 1–10 only', () => {
    expect(isCoreFactId('10x10')).toBe(true)
    expect(isCoreFactId('2x11')).toBe(false)
    expect(isCoreFactId('8x7')).toBe(false)
  })

  it('answering 8 × 7 updates 7x8', () => {
    // rng 0.9 → plugin presents the "ba" orientation: 8 × 7.
    const question = generateForFact('7x8', () => 0.9)
    expect(question.metadata?.a).toBe(8)
    expect(question.metadata?.b).toBe(7)
    const profile = createEmptyProfile('T', 0)
    const orch = new QuestionOrchestrator({ skill: createMultiplicationSkill() })
    orch.submitAnswer(profile, question, { value: 56, respondedAtMs: 10, latencyMs: 900 }, false)
    expect(profile.facts['7x8']!.attempts).toBe(1)
    expect(profile.facts['8x7']).toBeUndefined()
  })
})
