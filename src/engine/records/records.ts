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
import { RULES, SPEC_CONSTANTS, recordKeyId } from '../contracts'
import { dayKey } from '../learning/selection'

/**
 * D3 — personal records and the per-session log. Every function here is pure: no
 * storage access, no clock reads. Record eligibility reads raw session answers
 * (all `draw` answers of the session), never the filtered evidence view (D11).
 */

/** Build a record key (rulesVersion defaults to RULES.rulesVersion). */
export function recordKey(
  skillId: string,
  levelId: LevelId,
  mode: SessionMode,
  rulesVersion?: number,
): RecordKey {
  return {
    skillId,
    levelId,
    mode,
    rulesVersion: rulesVersion ?? RULES.rulesVersion,
  }
}

/** Context the raw session record does not carry. */
export interface SessionLogContext {
  skillId: string
  longestStreak: number
  /** Defaults to RULES.rulesVersion. */
  rulesVersion?: number
}

/** Total paused time inside [startMs, endMs]; an open pause runs until endMs. */
function pausedMs(session: SessionRecord, startMs: number, endMs: number): number {
  let total = 0
  for (const pause of session.pauses) {
    const from = Math.max(pause.startedAtMs, startMs)
    const to = Math.min(pause.endedAtMs ?? endMs, endMs)
    if (to > from) total += to - from
  }
  return total
}

/**
 * Summarize one ended v2 session from its raw session record and the raw attempts of
 * that session (every source). Real elapsed time excludes visibility pauses.
 *
 * Attempts from other sessions are ignored. `completed` is true only for sessions that
 * ended with endReason `finished`. Throws for sessions without a level/mode (migrated
 * inferred sessions), which cannot have a log entry or a record key.
 */
export function buildSessionLogEntry(
  session: SessionRecord,
  attempts: readonly RawAttempt[],
  ctx: SessionLogContext,
): SessionLogEntry {
  if (session.levelId === null || session.mode === null) {
    throw new Error(`buildSessionLogEntry: session ${session.id} has no level/mode`)
  }
  const own = attempts.filter((attempt) => attempt.sessionId === session.id)
  const lastAttemptAtMs = own.reduce((max, attempt) => Math.max(max, attempt.atMs), session.startedAtMs)
  const endedAtMs = session.endedAtMs ?? lastAttemptAtMs
  const wallMs = Math.max(0, endedAtMs - session.startedAtMs)
  const elapsedMs = Math.max(0, wallMs - pausedMs(session, session.startedAtMs, endedAtMs))

  let correct = 0
  let drawAnswers = 0
  let drawCorrect = 0
  for (const attempt of own) {
    if (attempt.correct) correct += 1
    if (attempt.source === 'draw') {
      drawAnswers += 1
      if (attempt.correct) drawCorrect += 1
    }
  }

  return {
    sessionId: session.id,
    skillId: ctx.skillId,
    levelId: session.levelId,
    mode: session.mode,
    rulesVersion: ctx.rulesVersion ?? RULES.rulesVersion,
    startedAtMs: session.startedAtMs,
    endedAtMs,
    elapsedMs,
    dayKey: dayKey(endedAtMs),
    completed: session.endReason === 'finished',
    answered: own.length,
    correct,
    drawAnswers,
    drawCorrect,
    longestStreak: ctx.longestStreak,
    isReplay: session.isReplay,
  }
}

/**
 * Append an entry, keeping the last SPEC_CONSTANTS.sessionLogMax entries (oldest first).
 * Idempotent per session: an existing entry with the same sessionId is replaced.
 */
export function appendSessionLog(
  log: readonly SessionLogEntry[],
  entry: SessionLogEntry,
): SessionLogEntry[] {
  const next = log.filter((existing) => existing.sessionId !== entry.sessionId)
  next.push(entry)
  const max = SPEC_CONSTANTS.sessionLogMax
  return next.length > max ? next.slice(next.length - max) : next
}

/** The record key a log entry belongs to. */
function entryKey(entry: SessionLogEntry): RecordKey {
  return recordKey(entry.skillId, entry.levelId, entry.mode, entry.rulesVersion)
}

/**
 * D3 eligibility: run completed and accuracy ≥ RULES.recordMinAccuracy over all
 * `draw` answers of the session (repeat draws of a missed fact included; reintroduce
 * and later-check items excluded). Latency is never an input.
 */
function isEligible(entry: SessionLogEntry): boolean {
  if (!entry.completed) return false
  if (entry.drawAnswers <= 0) return false
  if (!Number.isFinite(entry.elapsedMs) || entry.elapsedMs < 0) return false
  // Division of two integers rounds to the nearest double, so exactly-90% runs compare
  // equal to the 0.9 literal (a multiplication-based check can be off by one ulp).
  return entry.drawCorrect / entry.drawAnswers >= RULES.recordMinAccuracy
}

/**
 * Evaluate a session against the record at its key (`existing` = record at
 * recordKeyId(key), if any). Never compares across level/mode/rulesVersion: a record
 * whose key differs from the entry's key is ignored (treated as absent).
 */
export function evaluateRecord(
  existing: PersonalRecord | undefined,
  entry: SessionLogEntry,
): RecordEvaluation {
  const key = entryKey(entry)
  const sameKey = existing !== undefined && recordKeyId(existing.key) === recordKeyId(key)
  const current = sameKey ? existing : undefined
  const eligible = isEligible(entry)
  const isBaseline = eligible && current === undefined
  const isNewRecord = eligible && current !== undefined && entry.elapsedMs < current.bestMs
  return {
    key,
    eligible,
    isBaseline,
    isNewRecord,
    previousBestMs: current?.bestMs ?? null,
    elapsedMs: entry.elapsedMs,
  }
}

/** Apply an evaluation: baseline creates the record, a new record lowers bestMs. Pure. */
export function applyRecordEvaluation(
  existing: PersonalRecord | undefined,
  entry: SessionLogEntry,
  evaluation: RecordEvaluation,
): PersonalRecord | undefined {
  const keyId = recordKeyId(evaluation.key)
  if (keyId !== recordKeyId(entryKey(entry))) return existing
  const current = existing !== undefined && recordKeyId(existing.key) === keyId ? existing : undefined
  if (!evaluation.eligible) return existing

  if (current === undefined) {
    return {
      key: { ...evaluation.key },
      baselineMs: entry.elapsedMs,
      baselineAtMs: entry.endedAtMs,
      baselineSessionId: entry.sessionId,
      bestMs: entry.elapsedMs,
      bestAtMs: entry.endedAtMs,
      bestSessionId: entry.sessionId,
      eligibleRuns: 1,
      timesBeaten: 0,
    }
  }

  if (current.bestSessionId === entry.sessionId || current.baselineSessionId === entry.sessionId) {
    // Same session applied twice: no double counting.
    return current
  }

  const beaten = evaluation.isNewRecord && entry.elapsedMs < current.bestMs
  return {
    ...current,
    key: { ...current.key },
    eligibleRuns: current.eligibleRuns + 1,
    ...(beaten
      ? {
          bestMs: entry.elapsedMs,
          bestAtMs: entry.endedAtMs,
          bestSessionId: entry.sessionId,
          timesBeaten: current.timesBeaten + 1,
        }
      : {}),
  }
}
