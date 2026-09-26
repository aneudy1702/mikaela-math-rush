import type { FactAttempt, LearnerProfile } from '../contracts'
import { CORE_FACTS, getFact } from '../content/multiplication'
import { applyAttempt, emptyFactRecord } from './mastery'

/**
 * Placement samples across the fact space (not a single band)
 * and seeds estimated mastery + confidence into the learner profile.
 */
export interface PlacementItem {
  factId: string
  a: number
  b: number
  product: number
}

/** Spread sample: ~2–3 facts per band across core space. */
export function buildPlacementSequence(
  count = 16,
  rng: () => number = Math.random,
): PlacementItem[] {
  const byBand = new Map<number, typeof CORE_FACTS>()
  for (const f of CORE_FACTS) {
    const list = byBand.get(f.band) ?? []
    list.push(f)
    byBand.set(f.band, list)
  }

  const picks: PlacementItem[] = []
  const bands = [...byBand.keys()].sort((a, b) => a - b)
  let guard = 0
  while (picks.length < count && guard < count * 10) {
    guard++
    const band = bands[picks.length % bands.length]!
    const pool = byBand.get(band) ?? []
    if (pool.length === 0) continue
    const fact = pool[Math.floor(rng() * pool.length)]!
    if (picks.some((p) => p.factId === fact.factId)) continue
    picks.push({
      factId: fact.factId,
      a: fact.a,
      b: fact.b,
      product: fact.product,
    })
  }

  // Fill remaining from unused facts (deterministic scan — safe with fixed RNGs in tests).
  if (picks.length < count) {
    const taken = new Set(picks.map((p) => p.factId))
    for (const fact of CORE_FACTS) {
      if (picks.length >= count) break
      if (taken.has(fact.factId)) continue
      taken.add(fact.factId)
      picks.push({
        factId: fact.factId,
        a: fact.a,
        b: fact.b,
        product: fact.product,
      })
    }
  }

  return picks
}

/**
 * Apply a placement attempt with slightly higher weight on the first samples
 * so the model gets a usable prior without claiming high confidence.
 */
export function seedPlacementAttempt(
  profile: LearnerProfile,
  factId: string,
  correct: boolean,
  latencyMs: number,
  nowMs = Date.now(),
): LearnerProfile {
  const fact = getFact(factId)
  if (!fact) return profile

  if (!profile.facts[factId]) {
    profile.facts[factId] = emptyFactRecord(factId)
  }

  const attempt: FactAttempt = { correct, latencyMs, atMs: nowMs }
  profile.facts[factId] = applyAttempt(profile.facts[factId]!, attempt, nowMs)
  profile.updatedAtMs = nowMs
  return profile
}

export function completePlacement(
  profile: LearnerProfile,
  nowMs = Date.now(),
): LearnerProfile {
  profile.placementComplete = true
  profile.updatedAtMs = nowMs
  return profile
}
