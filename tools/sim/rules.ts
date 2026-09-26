// RULES — mirrors docs/v2/DECISIONS.md §B0 (revision 3). Every tunable number the sim uses lives here.
// Keys match §B0 where §B0 names one; constants that §B only states in prose are grouped at the bottom and marked.

export type Mode = 'quick' | 'practice' | 'rush'
export type Status = 'new' | 'learning' | 'mastered' | 'struggling' | 'provisional'
export type Source = 'draw' | 'reintroduce' | 'later-check' | 'confirm' | 'placement'

export interface Rules {
  windowSize: number
  masteredMinCorrectInWindow: number
  fastTrackMinAttempts: number
  minDistinctSessionsForMastery: number
  struggleMinAttempts: number
  struggleMaxCorrectInWindow: number
  provisionalEnabled: boolean
  provisionalMinCorrect: number
  provisionalMinGapQuestions: number
  provisionalMinGapMsInferred: number
  confirmDelayRange: [number, number]
  allowanceFraction: number
  allowanceMin: number
  levelAccuracyMin: number
  /** Sim-only: 0 disables R4 entirely (used by pressure test P2). */
  levelAccuracyWindow: number
  minSessionsAtLevel: number
  maxStrugglingTableFacts: number
  mixedAccuracyMin: number
  mixedWindow: number
  mixedMinSessions: number
  mixedMinDays: number
  mixedMaxStruggling: number
  statusWeight: Record<Status, number>
  /** Non-mastered facts only: median of last `sampleSize` correct latencies. ≤ fastMaxMs → fast, > slowOverMs → slow, else mid. */
  slowness: { fastMaxMs: number; slowOverMs: number; fast: number; mid: number; slow: number; sampleSize: number }
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
  // ---- Constants stated in §B prose (D2/D5), not as §B0 rows ----
  /** D2 step 5: "≥ 2 counted attempts with ≥ 75% correct". */
  likelyMinCountedAttempts: number
  likelyMinAccuracy: number
  /** D2 step 6: exclude the last 3 facts shown. */
  recentExcludeCount: number
  /** D2 step 7: up to two confirms per fact per session. */
  confirmMaxPerFactPerSession: number
  /** D2 step 5: a due queue item that is not likely waits (max 3 questions). */
  floorQueueMaxWait: number
  /** Existing contract SESSION_LENGTHS. */
  sessionLength: Record<Mode, number>
  /** D2 per-level answer buffer size. */
  levelAnswerBuffer: number
  // ---- Sim-only candidate fixes (NOT in DECISIONS; default off; see SIM-REPORT "Candidate fixes") ----
  /** V1: rule (b)'s "≥ 2 distinct sessions" is checked over correct attempts in all of C, not only W. */
  simSpanOverC: boolean
  /** V2: step 7 confirms are scheduled only for facts not yet mastered. */
  simConfirmNonMasteredOnly: boolean
  /** V4: the L9 window is the shortest suffix holding ≥ mixedWindow answers AND ≥ mixedMinSessions sessions (needs a bigger buffer). */
  simMixedWindowExtends: boolean
  /**
   * Slowness scope. 'rev3' = §B0 (non-mastered facts only). Owner option 2 (mastered facts only):
   * 'mastered-naive' = single-stage weighted pick; 'mastered-two-stage' = budget-neutral (stage 1 without slowness,
   * stage 2 re-picks among mastered candidates with slowness weights on a separate RNG stream).
   */
  simSlownessMode: 'rev3' | 'mastered-naive' | 'mastered-two-stage'
  /** L9 definition C (capstone): selection + completion. 'd2' = rev-3 selection at L9. */
  simL9Mode: 'd2' | 'capstone'
  /** Capstone selection: share of pool draws given to carried (not-yet-mastered) facts while any remain. */
  simCapstoneCarriedShare: number
  /** Capstone completion: min first-appearance accuracy / min first appearances / min sessions / min days. */
  simCapstoneRetentionMin: number
  simCapstoneMinFirstAppearances: number
  simCapstoneMinSessions: number
  simCapstoneMinDays: number
}

export const RULES: Rules = {
  windowSize: 4,
  masteredMinCorrectInWindow: 3,
  fastTrackMinAttempts: 2,
  minDistinctSessionsForMastery: 2,
  struggleMinAttempts: 3,
  struggleMaxCorrectInWindow: 1,
  provisionalEnabled: true,
  provisionalMinCorrect: 3,
  provisionalMinGapQuestions: 8,
  provisionalMinGapMsInferred: 60_000,
  confirmDelayRange: [9, 12],
  allowanceFraction: 0.2,
  allowanceMin: 1,
  levelAccuracyMin: 0.85,
  levelAccuracyWindow: 20,
  minSessionsAtLevel: 2,
  maxStrugglingTableFacts: 1,
  mixedAccuracyMin: 0.88,
  mixedWindow: 50,
  mixedMinSessions: 3,
  mixedMinDays: 2,
  mixedMaxStruggling: 2,
  statusWeight: { struggling: 4, learning: 3, new: 2.5, provisional: 2, mastered: 1 },
  slowness: { fastMaxMs: 3000, slowOverMs: 6000, fast: 0.8, mid: 1.0, slow: 1.3, sampleSize: 4 },
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
  confirmMaxPerFactPerSession: 2,
  floorQueueMaxWait: 3,
  sessionLength: { quick: 10, practice: 25, rush: 100 },
  levelAnswerBuffer: 50,
  simSpanOverC: false,
  simConfirmNonMasteredOnly: false,
  simMixedWindowExtends: false,
  simSlownessMode: 'rev3',
  simL9Mode: 'd2',
  simCapstoneCarriedShare: 0.5,
  simCapstoneRetentionMin: 0.85,
  simCapstoneMinFirstAppearances: 20,
  simCapstoneMinSessions: 2,
  simCapstoneMinDays: 2,
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
