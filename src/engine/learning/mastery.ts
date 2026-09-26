/**
 * Mastery formula — single source of truth for coefficients.
 *
 * Mastery combines accuracy + speed + recency, gated by minimum sample size.
 * One correct answer never marks a fact mastered; confidence stays low until
 * 5–8 recent attempts are recorded.
 */

import type { FactAttempt, FactRecord } from '../contracts'

export const MASTERY_CONFIG = {
  /** Recent attempt window used for accuracy/speed. */
  recentWindowSize: 8,
  /** Samples needed before confidence can leave "low". */
  minSamplesForHighConfidence: 5,
  /** Samples for full confidence ceiling. */
  samplesForFullConfidence: 8,
  /** Latency floors (ms). */
  fluentMs: 2000,
  okayMs: 3500,
  slowMs: 5000,
  /** Component weights (must sum ~1). */
  accuracyWeight: 0.45,
  speedWeight: 0.35,
  recencyWeight: 0.2,
  /** Mastery score above which a fact counts as "strong". */
  strongThreshold: 0.75,
  /** Mastery score for "mastered" display (still needs high confidence). */
  masteredThreshold: 0.85,
  /** Recency half-life in ms (~3 days). */
  recencyHalfLifeMs: 3 * 24 * 60 * 60 * 1000,
} as const

export function emptyFactRecord(factId: string): FactRecord {
  return {
    factId,
    attempts: 0,
    correct: 0,
    recentAttempts: [],
    mastery: 0,
    confidence: 0,
    avgLatencyMs: 0,
    lastPracticedAtMs: null,
    reinforcement: 'none',
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function accuracyScore(recent: FactAttempt[]): number {
  if (recent.length === 0) return 0
  const hits = recent.filter((a) => a.correct).length
  return hits / recent.length
}

export function speedScore(recent: FactAttempt[]): number {
  const correct = recent.filter((a) => a.correct)
  if (correct.length === 0) return 0
  const avg =
    correct.reduce((sum, a) => sum + a.latencyMs, 0) / correct.length
  const { fluentMs, okayMs, slowMs } = MASTERY_CONFIG
  if (avg <= fluentMs) return 1
  if (avg <= okayMs) {
    return 0.7 + 0.3 * (1 - (avg - fluentMs) / (okayMs - fluentMs))
  }
  if (avg <= slowMs) {
    return 0.3 + 0.4 * (1 - (avg - okayMs) / (slowMs - okayMs))
  }
  return clamp01(0.3 * (slowMs / avg))
}

export function recencyScore(
  lastPracticedAtMs: number | null,
  nowMs: number,
): number {
  if (lastPracticedAtMs == null) return 0.4
  const age = Math.max(0, nowMs - lastPracticedAtMs)
  const half = MASTERY_CONFIG.recencyHalfLifeMs
  // Exponential decay toward 0.2 floor so old facts aren't zeroed.
  return 0.2 + 0.8 * Math.pow(0.5, age / half)
}

/**
 * Confidence from sample size alone (0–1).
 * Below minSamples → low; reaches 1 at samplesForFullConfidence.
 */
export function confidenceFromSamples(sampleCount: number): number {
  const { minSamplesForHighConfidence, samplesForFullConfidence } =
    MASTERY_CONFIG
  if (sampleCount <= 0) return 0
  if (sampleCount < minSamplesForHighConfidence) {
    return clamp01(
      (sampleCount / minSamplesForHighConfidence) * 0.45,
    )
  }
  if (sampleCount >= samplesForFullConfidence) return 1
  const span = samplesForFullConfidence - minSamplesForHighConfidence
  const t = (sampleCount - minSamplesForHighConfidence) / span
  return clamp01(0.45 + 0.55 * t)
}

export function computeMastery(
  recent: FactAttempt[],
  lastPracticedAtMs: number | null,
  nowMs: number,
): { mastery: number; confidence: number } {
  const conf = confidenceFromSamples(recent.length)
  if (recent.length === 0) {
    return { mastery: 0, confidence: 0 }
  }

  const raw =
    MASTERY_CONFIG.accuracyWeight * accuracyScore(recent) +
    MASTERY_CONFIG.speedWeight * speedScore(recent) +
    MASTERY_CONFIG.recencyWeight * recencyScore(lastPracticedAtMs, nowMs)

  // Scale raw mastery by confidence so one lucky hit cannot look mastered.
  const mastery = clamp01(raw * (0.35 + 0.65 * conf))
  return { mastery, confidence: conf }
}

export function applyAttempt(
  record: FactRecord,
  attempt: FactAttempt,
  nowMs: number = attempt.atMs,
): FactRecord {
  const recent = [...record.recentAttempts, attempt].slice(
    -MASTERY_CONFIG.recentWindowSize,
  )
  const attempts = record.attempts + 1
  const correct = record.correct + (attempt.correct ? 1 : 0)
  const avgLatencyMs =
    attempts === 1
      ? attempt.latencyMs
      : (record.avgLatencyMs * record.attempts + attempt.latencyMs) / attempts

  const { mastery, confidence } = computeMastery(
    recent,
    nowMs,
    nowMs,
  )

  return {
    ...record,
    attempts,
    correct,
    recentAttempts: recent,
    mastery,
    confidence,
    avgLatencyMs,
    lastPracticedAtMs: nowMs,
  }
}

export function isHighConfidence(record: FactRecord): boolean {
  return (
    record.recentAttempts.length >=
      MASTERY_CONFIG.minSamplesForHighConfidence &&
    record.confidence >= 0.45
  )
}

/**
 * @deprecated V1 speed-weighted mastery. V2 status is `factStatus` (learning/advancement.ts,
 * D2: latency never gates mastery). Kept unchanged only for the legacy engine until T5/T7;
 * it must not gate V2 selection, status, completion or marks. Removed in T8.
 */
export function isStrongFact(record: FactRecord): boolean {
  return (
    isHighConfidence(record) &&
    record.mastery >= MASTERY_CONFIG.strongThreshold
  )
}

/**
 * @deprecated V1 speed-weighted mastery. V2 status is `factStatus` (learning/advancement.ts,
 * D2: latency never gates mastery). Kept unchanged only for the legacy engine until T5/T7;
 * it must not gate V2 selection, status, completion or marks. Removed in T8.
 */
export function isMasteredFact(record: FactRecord): boolean {
  return (
    record.confidence >= 0.85 &&
    record.mastery >= MASTERY_CONFIG.masteredThreshold
  )
}

/**
 * Derived table mastery for display (×n). Not canonical.
 * @deprecated V1 speed-weighted display. V2 per-fact progress is `factStatus` /
 * `factDisplayValue` (learning/advancement.ts, D2/D10). Kept unchanged for the legacy
 * screens until T5/T7/T8; it must not gate anything. Removed in T8.
 */
export function derivedTableMastery(
  facts: Record<string, FactRecord>,
  table: number,
): { mastery: number; confidence: number; factCount: number } {
  const matching = Object.values(facts).filter((f) => {
    const [a, b] = f.factId.split('x').map(Number)
    return a === table || b === table
  })
  if (matching.length === 0) {
    return { mastery: 0, confidence: 0, factCount: 0 }
  }
  const mastery =
    matching.reduce((s, f) => s + f.mastery, 0) / matching.length
  const confidence =
    matching.reduce((s, f) => s + f.confidence, 0) / matching.length
  return { mastery, confidence, factCount: matching.length }
}
