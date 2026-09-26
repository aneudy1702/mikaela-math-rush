export {
  MASTERY_CONFIG,
  accuracyScore,
  applyAttempt,
  computeMastery,
  confidenceFromSamples,
  derivedTableMastery,
  emptyFactRecord,
  isHighConfidence,
  isMasteredFact,
  isStrongFact,
  recencyScore,
  speedScore,
} from './mastery'

export {
  awardGameXp,
  bucketFacts,
  classifyFact,
  createEmptyProfile,
  ensureFact,
  recordBest,
  touchDailyStreak,
  dayKey,
  selectNextFact,
  type SelectionResult,
} from './selection'

export {
  buildPlacementSequence,
  completePlacement,
  seedPlacementAttempt,
  type PlacementItem,
} from './placement'
