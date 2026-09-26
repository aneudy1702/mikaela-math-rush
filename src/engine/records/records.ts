import type {
  LevelId,
  PersonalRecord,
  RawAttempt,
  RecordEvaluation,
  RecordKey,
  SessionLogEntry,
  SessionMode,
  SessionRecord,
} from '../contracts'

/** T2 implements every function in this file (D3). Stubs throw until then. */

/** Build a record key (rulesVersion defaults to RULES.rulesVersion). */
export function recordKey(
  skillId: string,
  levelId: LevelId,
  mode: SessionMode,
  rulesVersion?: number,
): RecordKey {
  void skillId
  void levelId
  void mode
  void rulesVersion
  throw new Error('not implemented: recordKey')
}

/** Context the raw session record does not carry. */
export interface SessionLogContext {
  skillId: string
  longestStreak: number
  /** Defaults to RULES.rulesVersion. */
  rulesVersion?: number
}

/**
 * Summarize one ended v2 session from its raw session record and the raw attempts of
 * that session (every source). Real elapsed time excludes visibility pauses.
 */
export function buildSessionLogEntry(
  session: SessionRecord,
  attempts: readonly RawAttempt[],
  ctx: SessionLogContext,
): SessionLogEntry {
  void session
  void attempts
  void ctx
  throw new Error('not implemented: buildSessionLogEntry')
}

/** Append an entry, keeping the last SPEC_CONSTANTS.sessionLogMax entries (oldest first). */
export function appendSessionLog(
  log: readonly SessionLogEntry[],
  entry: SessionLogEntry,
): SessionLogEntry[] {
  void log
  void entry
  throw new Error('not implemented: appendSessionLog')
}

/**
 * Evaluate a session against the record at its key (`existing` = record at
 * recordKeyId(key), if any). Never compares across level/mode/rulesVersion.
 */
export function evaluateRecord(
  existing: PersonalRecord | undefined,
  entry: SessionLogEntry,
): RecordEvaluation {
  void existing
  void entry
  throw new Error('not implemented: evaluateRecord')
}

/** Apply an evaluation: baseline creates the record, a new record lowers bestMs. Pure. */
export function applyRecordEvaluation(
  existing: PersonalRecord | undefined,
  entry: SessionLogEntry,
  evaluation: RecordEvaluation,
): PersonalRecord | undefined {
  void existing
  void entry
  void evaluation
  throw new Error('not implemented: applyRecordEvaluation')
}
