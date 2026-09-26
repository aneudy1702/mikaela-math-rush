import type {
  FactAttempt,
  LearnerProfile,
  LevelId,
  PlacementProbe,
  PlacementResult,
  StartLevelInference,
} from '../contracts'
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

// ---- V2 placement staircase (D5) + start-level inference (D5b) — T6 implements -------
// Stubs throw until then. The V1 exports above stay until T8.

/** Staircase state (T6 owns the shape; treat as opaque outside placement). */
export interface PlacementState {
  /** Probes asked so far with their outcome, in order. */
  asked: { probe: PlacementProbe; correct: boolean }[]
  /** Per probed level, once decided. */
  levelOutcomes: Record<LevelId, 'pass' | 'fail'>
  finished: boolean
}

/** Fresh warm-up. */
export function startPlacement(): PlacementState {
  throw new Error('not implemented: startPlacement')
}

/** Next probe to ask, or null when the staircase has finished. */
export function nextProbe(
  state: PlacementState,
  rng?: () => number,
): PlacementProbe | null {
  void state
  void rng
  throw new Error('not implemented: nextProbe')
}

/** Record the answer to a probe. Pure: returns the new state. */
export function recordProbe(
  state: PlacementState,
  probe: PlacementProbe,
  correct: boolean,
): PlacementState {
  void state
  void probe
  void correct
  throw new Error('not implemented: recordProbe')
}

/** Final result once finished (null while still running). */
export function placementResult(
  state: PlacementState,
): PlacementResult | null {
  void state
  throw new Error('not implemented: placementResult')
}

/**
 * Apply a placement result: unlock (never complete) passed levels, set current and
 * placementStartLevelId, set placementLikely flags. No XP, badges or records.
 */
export function applyPlacementResult(
  profile: LearnerProfile,
  result: PlacementResult,
  nowMs?: number,
): LearnerProfile {
  void profile
  void result
  void nowMs
  throw new Error('not implemented: applyPlacementResult')
}

/**
 * D5b start-level inference from raw-log attempts at most inferenceMaxAgeDays old at
 * `nowMs`, recomputed under D2 rules. Never reads v1 mastery scores.
 */
export function inferStartLevel(
  profile: LearnerProfile,
  nowMs?: number,
): StartLevelInference {
  void profile
  void nowMs
  throw new Error('not implemented: inferStartLevel')
}

/**
 * Apply a 'recommend' inference: unlock L1..s, current = s, inferredStartLevelId = s,
 * set everMastered silently. No XP, badges, records or celebrations. Other outcomes: no-op.
 */
export function applyStartLevelInference(
  profile: LearnerProfile,
  inference: StartLevelInference,
): LearnerProfile {
  void profile
  void inference
  throw new Error('not implemented: applyStartLevelInference')
}
