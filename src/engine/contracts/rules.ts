/**
 * RULES — every tunable number of the V2 learning journey.
 *
 * Mirrors docs/v2/DECISIONS.md §B0 (revision 4, APPROVED, FROZEN). Single source of
 * truth: engine code imports these values and never re-declares them. Changing a value
 * requires a DECISIONS revision (no retuning before T10 unless a contract contradiction).
 */

import type { SessionMode } from './types'

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

export interface RulesShape {
  /** Counted attempts considered for the accuracy part of status (W). */
  windowSize: number
  /** Status rule (b): correct answers in W. */
  masteredMinCorrectInWindow: number
  /** Status rule (a): fast-track minimum counted attempts. */
  fastTrackMinAttempts: number
  /** Spacing, checked over all counted correct attempts (V1). */
  minDistinctSessionsForMastery: number
  struggleMinAttempts: number
  struggleMaxCorrectInWindow: number
  /** a = max(allowanceMin, ⌊allowanceFraction·n⌋). */
  allowanceFraction: number
  allowanceMin: number
  /** R4. */
  levelAccuracyMin: number
  levelAccuracyWindow: number
  /** R5. */
  minSessionsAtLevel: number
  /** R3. */
  maxStrugglingTableFacts: number
  /** L9 (option B + V4). */
  mixedAccuracyMin: number
  mixedMinAnswers: number
  mixedMinSessions: number
  mixedMinDays: number
  mixedMaxStruggling: number
  /** Per-level evidence buffer length. */
  evidenceBufferMax: number
  /** Stage-1 selection weight by status (no latency). */
  statusWeight: {
    struggling: number
    learning: number
    new: number
    mastered: number
  }
  /**
   * Stage-2 selection weight, mastered facts only. Median of the last ≤ sampleSize
   * correct latencies: ≤ fastMaxMs → fast · ≤ slowOverMs → mid · > slowOverMs → slow.
   */
  fluencySlowness: {
    fastMaxMs: number
    slowOverMs: number
    fast: number
    mid: number
    slow: number
    sampleSize: number
  }
  reviewShare: number
  reviewShareWithCarried: number
  introShareMaxL1: number
  successFloor: number
  /** Per session, carried facts (queue included). */
  carriedHardCap: Record<SessionMode, number>
  /** Inclusive question-count ranges. Later-check only after a correct reintroduce. */
  reintroduceDelayRange: [number, number]
  laterCheckDelayRange: [number, number]
  recordMinAccuracy: number
  /** D4 drop-down offer: accuracy < this over the first `dropDownOfferSessions` sessions. */
  dropDownOfferAccuracy: number
  dropDownOfferSessions: number
  placementMaxQuestions: number
  inferenceMaxAgeDays: number
  /** Migration only (D5b step 2). */
  inferenceSessionGapMs: number
  inferenceMinAttemptsPerFact: number
  clearFailAccuracy: number
  clearFailMinAttempts: number
  /** D10 evidence marks per fact. */
  marksMax: number
  /** D11 persisted raw attempt cap. */
  rawLogMaxAttempts: number
  /** D6 XP numbers. */
  xp: {
    /** +1 per correct answer on the progress level (and any uncompleted level). */
    perCorrect: number
    /** On completed levels: +1 per this many correct answers. */
    completedLevelCorrectPerXp: number
    completionBonus: Record<SessionMode, number>
    /** Completed levels pay bonus × this, except the first finish of each level+mode. */
    completedLevelBonusMultiplier: number
    /** Perfect session (100% of draw answers): +this fraction of the bonus paid. */
    perfectBonusFraction: number
    /** One-time: fact everMastered becomes true. */
    factMastered: number
    /** One-time: level completed by play. */
    levelCompleted: number
    /** Record beaten (not baseline) on the progress level only. */
    recordBeaten: number
    /** At most this many record-beaten XP awards per calendar day overall. */
    recordBeatenMaxPerDay: number
    /** XP to reach player level L = levelCurveFactor·L·(L−1). */
    levelCurveFactor: number
  }
  /** Bump when timing/record rules change (part of RecordKey). */
  rulesVersion: number
}

export type Rules = DeepReadonly<RulesShape>

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      deepFreeze(v)
    }
    Object.freeze(value)
  }
  return value
}

export const RULES: Rules = deepFreeze<RulesShape>({
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
  fluencySlowness: {
    fastMaxMs: 3000,
    slowOverMs: 6000,
    fast: 0.8,
    mid: 1.0,
    slow: 1.3,
    sampleSize: 4,
  },
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
    levelCurveFactor: 25,
  },
  rulesVersion: 1,
})

/**
 * Constants that DECISIONS §B states in prose rather than as §B0 rows. Values are
 * quoted from the cited section; they are not tunables and are not part of §B0.
 */
export interface SpecConstantsShape {
  /** D2 step 5: likely-correct = ≥ this many counted attempts … */
  likelyMinCountedAttempts: number
  /** D2 step 5: … with ≥ this share correct in W. */
  likelyMinAccuracy: number
  /** D2 step 5: a due non-likely queue item waits at most this many questions. */
  floorQueueMaxWait: number
  /** D2 step 5: floor is enforced from this question index on (1-based: "from the second question"). */
  floorFromQuestion: number
  /** D2 step 6: exclude the last N facts shown. */
  recentExcludeCount: number
  /** D5: probe order while passing. */
  placementProbeLevelIndexes: readonly number[]
  /** D5: gating facts per probe (hardest + 1 random); tiebreaker on 1/2. */
  placementProbeFacts: number
  placementTiebreakerFacts: number
  /** D5b step 4: "Passes" counted accuracy on gating facts. */
  inferencePassAccuracy: number
  /** D5b step 4: "Clearly fails" when ≥ this many gating facts are struggling. */
  clearFailMinStrugglingGating: number
  /** D6 badges. */
  hotStreakCorrectInRow: number
  onFireCorrectInRow: number
  recordBreakerRecords: number
  dayStreakBadgeDays: number
  /** D6 player titles (min player level → title). */
  playerTitles: readonly { readonly minLevel: number; readonly title: string }[]
  /** PLAN T2: session log capped to the last N entries. */
  sessionLogMax: number
}

export const SPEC_CONSTANTS: DeepReadonly<SpecConstantsShape> =
  deepFreeze<SpecConstantsShape>({
    likelyMinCountedAttempts: 2,
    likelyMinAccuracy: 0.75,
    floorQueueMaxWait: 3,
    floorFromQuestion: 2,
    recentExcludeCount: 3,
    placementProbeLevelIndexes: [1, 3, 5, 7, 8],
    placementProbeFacts: 2,
    placementTiebreakerFacts: 1,
    inferencePassAccuracy: 0.85,
    clearFailMinStrugglingGating: 2,
    hotStreakCorrectInRow: 10,
    onFireCorrectInRow: 25,
    recordBreakerRecords: 5,
    dayStreakBadgeDays: 3,
    playerTitles: [
      { minLevel: 1, title: 'Rookie' },
      { minLevel: 5, title: 'Number Ninja' },
      { minLevel: 10, title: 'Math Racer' },
      { minLevel: 20, title: 'Math Wizard' },
      { minLevel: 30, title: 'Math Legend' },
    ],
    sessionLogMax: 200,
  })
