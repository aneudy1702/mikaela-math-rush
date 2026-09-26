import type {
  AdvancementResult,
  EvidenceBufferEntry,
  FactComebackEvent,
  FactEvidence,
  FactStatus,
  LevelDef,
  MixedLevelChecks,
  RawAttempt,
  RawLog,
  SkillProgress,
  TableLevelChecks,
} from '../contracts'

/**
 * T4 implements every function in this file (D2, D10, D11 evidence view).
 * Stubs throw until then. All functions are pure; latency never affects status,
 * counted flags or completion.
 */

/** Counted flag per raw attempt (same order): no earlier miss of the same fact in the same session. */
export function countedFlags(rawLog: readonly RawAttempt[]): boolean[] {
  void rawLog
  throw new Error('not implemented: countedFlags')
}

/** The counted attempts of a raw log, chronological. */
export function countedAttempts(rawLog: readonly RawAttempt[]): RawAttempt[] {
  void rawLog
  throw new Error('not implemented: countedAttempts')
}

/** Evidence for a fact with no attempts (status new). */
export function emptyFactEvidence(factId: string): FactEvidence {
  void factId
  throw new Error('not implemented: emptyFactEvidence')
}

/**
 * Fold one raw attempt into a fact's evidence. `counted` comes from countedFlags.
 * Updates everMastered (never unsets) and clears placementLikely on the first counted attempt.
 */
export function applyAttemptToEvidence(
  evidence: FactEvidence,
  attempt: RawAttempt,
  counted: boolean,
): FactEvidence {
  void evidence
  void attempt
  void counted
  throw new Error('not implemented: applyAttemptToEvidence')
}

/** D2 status (undefined evidence = new). */
export function factStatus(evidence: FactEvidence | undefined): FactStatus {
  void evidence
  throw new Error('not implemented: factStatus')
}

/** D10 evidence marks: 0 if new/struggling, else min(RULES.marksMax, cW). Mastered facts render a distinct state. */
export function factMarks(evidence: FactEvidence | undefined): number {
  void evidence
  throw new Error('not implemented: factMarks')
}

/** D2 step 5 likely-correct (success floor). */
export function isLikelyCorrect(evidence: FactEvidence | undefined): boolean {
  void evidence
  throw new Error('not implemented: isLikelyCorrect')
}

/** a = max(RULES.allowanceMin, ⌊RULES.allowanceFraction · n⌋). */
export function levelAllowance(gatingCount: number): number {
  void gatingCount
  throw new Error('not implemented: levelAllowance')
}

/** D2 R1–R5 for a table level (L1–L8). */
export function evaluateTableLevel(
  level: LevelDef,
  factEvidence: Readonly<Record<string, FactEvidence>>,
  buffer: readonly EvidenceBufferEntry[],
  finishedSessionsAtLevel: number,
): TableLevelChecks {
  void level
  void factEvidence
  void buffer
  void finishedSessionsAtLevel
  throw new Error('not implemented: evaluateTableLevel')
}

/** D2 L9 rule (option B + V4) over the L9 evidence buffer; `factIds` = all 55 core facts. */
export function evaluateMixedLevel(
  buffer: readonly EvidenceBufferEntry[],
  factEvidence: Readonly<Record<string, FactEvidence>>,
  factIds: readonly string[],
): MixedLevelChecks {
  void buffer
  void factEvidence
  void factIds
  throw new Error('not implemented: evaluateMixedLevel')
}

/**
 * Recompute the evidence view (factEvidence, evidence buffers, finishedSessionsByLevel)
 * from the raw log under current RULES. everMastered / placementLikely are carried from
 * `progress` (everMastered is also set by replay). Returns progress with evidenceStale false.
 */
export function rebuildEvidence(
  rawLog: RawLog,
  progress: SkillProgress,
): SkillProgress {
  void rawLog
  void progress
  throw new Error('not implemented: rebuildEvidence')
}

/** Comeback Kid events for one session (D6). */
export function detectComebacks(
  rawLog: readonly RawAttempt[],
  sessionId: string,
): FactComebackEvent[] {
  void rawLog
  void sessionId
  throw new Error('not implemented: detectComebacks')
}

/** D10: Σ marks + 3 × mastered over a level's table facts. */
export function levelMarksTotal(
  level: LevelDef,
  factEvidence: Readonly<Record<string, FactEvidence>>,
): number {
  void level
  void factEvidence
  throw new Error('not implemented: levelMarksTotal')
}

export interface AdvancementInput {
  /** Progress at session start. */
  before: SkillProgress
  /** Progress after folding in the session's attempts (evidence up to date). */
  after: SkillProgress
  level: LevelDef
  /** Next level on the ladder (null at the top). */
  nextLevel: LevelDef | null
  /** All core fact IDs (L9 struggling guard). */
  allFactIds: readonly string[]
  sessionId: string
  atMs: number
}

/** Session-end completion + level-up (D2, D4). Pure: returns the result; caller applies it. */
export function evaluateAdvancement(input: AdvancementInput): AdvancementResult {
  void input
  throw new Error('not implemented: evaluateAdvancement')
}
