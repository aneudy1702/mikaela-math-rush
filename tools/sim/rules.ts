// RULES — mirrors docs/v2/DECISIONS.md §B0 (revision 4, frozen). Every tunable number the sim uses lives here.
// Keys match §B0; constants that §B only states in prose are grouped at the bottom and marked.

export type Mode = 'quick' | 'practice' | 'rush'
export type Status = 'new' | 'learning' | 'mastered' | 'struggling'
export type Source = 'draw' | 'reintroduce' | 'later-check' | 'placement'

export interface Rules {
  windowSize: number
  masteredMinCorrectInWindow: number
  fastTrackMinAttempts: number
  /** Spacing, checked over all counted correct attempts (V1). */
  minDistinctSessionsForMastery: number
  struggleMinAttempts: number
  struggleMaxCorrectInWindow: number
  allowanceFraction: number
  allowanceMin: number
  levelAccuracyMin: number
  levelAccuracyWindow: number
  minSessionsAtLevel: number
  maxStrugglingTableFacts: number
  mixedAccuracyMin: number
  mixedMinAnswers: number
  mixedMinSessions: number
  mixedMinDays: number
  mixedMaxStruggling: number
  /** Per-level evidence buffer length (V4). */
  evidenceBufferMax: number
  statusWeight: Record<Status, number>
  /** Mastered facts only, stage 2 of the pick: median of last ≤ sampleSize correct latencies. */
  fluencySlowness: { fastMaxMs: number; slowOverMs: number; fast: number; mid: number; slow: number; sampleSize: number }
  reviewShare: number
  reviewShareWithCarried: number
  introShareMaxL1: number
  successFloor: number
  carriedHardCap: Record<Mode, number>
  reintroduceDelayRange: [number, number]
  laterCheckDelayRange: [number, number]
  recordMinAccuracy: number
  dropDownOfferAccuracy: number
  dropDownOfferSessions: number
  placementMaxQuestions: number
  inferenceMaxAgeDays: number
  inferenceSessionGapMs: number
  inferenceMinAttemptsPerFact: number
  clearFailAccuracy: number
  clearFailMinAttempts: number
  marksMax: number
  rawLogMaxAttempts: number
  xp: {
    perCorrect: number
    completedLevelCorrectPerXp: number
    completionBonus: Record<Mode, number>
    completedLevelBonusMultiplier: number
    perfectBonusFraction: number
    factMastered: number
    levelCompleted: number
    recordBeaten: number
    recordBeatenMaxPerDay: number
  }
  rulesVersion: number
  // ---- Constants stated in §B prose (D2), not as §B0 rows ----
  /** D2 step 5: "≥ 2 counted attempts with ≥ 75% correct in W". */
  likelyMinCountedAttempts: number
  likelyMinAccuracy: number
  /** D2 step 6: exclude the last 3 facts shown. */
  recentExcludeCount: number
  /** D2 step 5: a due non-likely queue item waits (max 3 questions). */
  floorQueueMaxWait: number
  /** Existing contract SESSION_LENGTHS. */
  sessionLength: Record<Mode, number>
}

export const RULES: Rules = {
  windowSize: 4,
  masteredMinCorrectInWindow: 3,
  fastTrackMinAttempts: 2,
  minDistinctSessionsForMastery: 2,
  struggleMinAttempts: 3,
  struggleMaxCorrectInWindow: 1,
  allowanceFraction: 0.2,
  allowanceMin: 1,
  levelAccuracyMin: 0.85,
  levelAccuracyWindow: 20,
  minSessionsAtLevel: 2,
  maxStrugglingTableFacts: 1,
  mixedAccuracyMin: 0.85,
  mixedMinAnswers: 50,
  mixedMinSessions: 3,
  mixedMinDays: 2,
  mixedMaxStruggling: 2,
  evidenceBufferMax: 300,
  statusWeight: { struggling: 4, learning: 3, new: 2.5, mastered: 1 },
  fluencySlowness: { fastMaxMs: 3000, slowOverMs: 6000, fast: 0.8, mid: 1.0, slow: 1.3, sampleSize: 4 },
  reviewShare: 0.15,
  reviewShareWithCarried: 0.25,
  introShareMaxL1: 0.2,
  successFloor: 0.4,
  carriedHardCap: { quick: 1, practice: 2, rush: 8 },
  reintroduceDelayRange: [3, 8],
  laterCheckDelayRange: [5, 12],
  recordMinAccuracy: 0.9,
  dropDownOfferAccuracy: 0.7,
  dropDownOfferSessions: 2,
  placementMaxQuestions: 12,
  inferenceMaxAgeDays: 30,
  inferenceSessionGapMs: 1_800_000,
  inferenceMinAttemptsPerFact: 3,
  clearFailAccuracy: 0.7,
  clearFailMinAttempts: 10,
  marksMax: 3,
  rawLogMaxAttempts: 20_000,
  xp: {
    perCorrect: 1,
    completedLevelCorrectPerXp: 5,
    completionBonus: { quick: 10, practice: 25, rush: 100 },
    completedLevelBonusMultiplier: 0.2,
    perfectBonusFraction: 0.5,
    factMastered: 5,
    levelCompleted: 100,
    recordBeaten: 25,
    recordBeatenMaxPerDay: 1,
  },
  rulesVersion: 1,
  likelyMinCountedAttempts: 2,
  likelyMinAccuracy: 0.75,
  recentExcludeCount: 3,
  floorQueueMaxWait: 3,
  sessionLength: { quick: 10, practice: 25, rush: 100 },
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function merge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    const b = base[k]
    out[k] = isPlainObject(b) && isPlainObject(v) ? merge(b, v) : Array.isArray(v) ? [...v] : v
  }
  return out
}

export function withOverrides(overrides: DeepPartial<Rules>, base: Rules = RULES): Rules {
  return merge(base as unknown as Record<string, unknown>, overrides as Record<string, unknown>) as unknown as Rules
}
