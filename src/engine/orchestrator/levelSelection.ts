import type {
  FactEvidence,
  LevelDef,
  PendingReinforcement,
  SessionMode,
} from '../contracts'

/**
 * T5 implements every function in this file (D2 question selection, P1/P2/P8).
 * Stubs throw until then. The legacy `selectNextFact` stays until T8.
 */

/** D2 step 1 pools for one level. */
export interface LevelPools {
  /** Table facts of the current level (L1 intro facts included, capped at draw time). */
  levelPool: string[]
  /** Facts owned by earlier levels, not in the table. */
  reviewPool: string[]
  /** Review facts with status learning or struggling. */
  carried: string[]
}

/** Per-session running counters the selection rules need (T5 may extend). */
export interface LevelSelectionState {
  questionsSoFar: number
  likelyDrawn: number
  carriedDrawn: number
  introDrawn: number
  /** Most recent fact IDs shown, newest last. */
  recentFactIds: string[]
}

export interface LevelSelectionContext {
  level: LevelDef
  mode: SessionMode
  pools: LevelPools
  factEvidence: Readonly<Record<string, FactEvidence>>
  state: LevelSelectionState
}

/** Two independent RNG streams: stage 2 (fluency) must not disturb stage 1 (D2 step 6). */
export interface SelectionRngs {
  main: () => number
  fluency: () => number
}

export interface LevelSelection {
  factId: string
  pool: 'level' | 'review'
  likely: boolean
  carried: boolean
}

/** D2 step 1: pools for a level given the current evidence. */
export function levelSelectionPools(
  level: LevelDef,
  reviewFactIds: readonly string[],
  factEvidence: Readonly<Record<string, FactEvidence>>,
): LevelPools {
  void level
  void reviewFactIds
  void factEvidence
  throw new Error('not implemented: levelSelectionPools')
}

/** D2 steps 3–6 for a pool draw (queue handling lives in the orchestrator). */
export function selectLevelFact(
  ctx: LevelSelectionContext,
  rngs: SelectionRngs,
): LevelSelection {
  void ctx
  void rngs
  throw new Error('not implemented: selectLevelFact')
}

/** D2 step 6 stage-2 weight for a mastered fact (RULES.fluencySlowness). */
export function fluencySlownessWeight(evidence: FactEvidence | undefined): number {
  void evidence
  throw new Error('not implemented: fluencySlownessWeight')
}

/** D2 step 2 / P8: drop carried queue items for facts outside `scope` (current + earlier levels). */
export function filterPendingToScope(
  pending: readonly PendingReinforcement[],
  scope: ReadonlySet<string>,
): PendingReinforcement[] {
  void pending
  void scope
  throw new Error('not implemented: filterPendingToScope')
}
