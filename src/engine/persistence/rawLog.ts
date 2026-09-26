/**
 * D11 raw log: compact storage encoding and the attempt cap.
 *
 * Encoding: attempts and sessions are stored as positional tuples with small integer
 * codes, session IDs interned in a table, and attempt timestamps delta-encoded.
 * decode(encode(log)) === log (deep-equal) for any valid log.
 */

import type {
  AttemptSource,
  RawAttempt,
  RawLog,
  SessionEndReason,
  SessionKind,
  SessionMode,
  SessionRecord,
} from '../contracts'
import { RULES } from '../contracts'

export const RAW_LOG_ENCODING_VERSION = 1

const MODES: readonly SessionMode[] = ['quick', 'practice', 'rush']
const SOURCES: readonly AttemptSource[] = [
  'draw',
  'reintroduce',
  'later-check',
  'placement',
]
const KINDS: readonly SessionKind[] = ['play', 'placement']
const END_REASONS: readonly SessionEndReason[] = [
  'finished',
  'abandoned',
  'inferred',
]

/**
 * [factId, a, b, correct, given, latencyMs, atMsDelta, sessionIdx, sessionInferred,
 *  levelId, mode, source, isReplay]
 */
type EncodedAttempt = [
  string,
  number | null,
  number | null,
  0 | 1,
  number | null,
  number,
  number,
  number,
  0 | 1,
  string | null,
  number | null,
  number,
  0 | 1,
]

/**
 * [idIdx, kind, startedAtMs, endedAtMs, mode, levelId, inferred, endReason, isReplay,
 *  pauses [[start, end]], discarded [[factId, shownAtMs, discardedAtMs]]]
 */
type EncodedSession = [
  number,
  number,
  number,
  number | null,
  number | null,
  string | null,
  0 | 1,
  number | null,
  0 | 1,
  [number, number | null][],
  [string, number, number][],
]

export interface EncodedRawLog {
  v: number
  ids: string[]
  s: EncodedSession[]
  a: EncodedAttempt[]
}

function code<T>(table: readonly T[], value: T): number {
  const i = table.indexOf(value)
  if (i < 0) throw new Error(`raw log: cannot encode ${String(value)}`)
  return i
}

function uncode<T>(table: readonly T[], i: unknown): T {
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= table.length) {
    throw new Error(`raw log: bad code ${String(i)}`)
  }
  return table[i]!
}

const bit = (b: boolean): 0 | 1 => (b ? 1 : 0)

export function encodeRawLog(log: RawLog): EncodedRawLog {
  const ids: string[] = []
  const idIndex = new Map<string, number>()
  const intern = (id: string): number => {
    let i = idIndex.get(id)
    if (i === undefined) {
      i = ids.length
      ids.push(id)
      idIndex.set(id, i)
    }
    return i
  }

  const s: EncodedSession[] = log.sessions.map((r) => [
    intern(r.id),
    code(KINDS, r.kind),
    r.startedAtMs,
    r.endedAtMs,
    r.mode == null ? null : code(MODES, r.mode),
    r.levelId,
    bit(r.inferred),
    r.endReason == null ? null : code(END_REASONS, r.endReason),
    bit(r.isReplay),
    r.pauses.map((p) => [p.startedAtMs, p.endedAtMs]),
    r.discardedOnHide.map((d) => [d.factId, d.shownAtMs, d.discardedAtMs]),
  ])

  let prevAt = 0
  const a: EncodedAttempt[] = log.attempts.map((t) => {
    const delta = t.atMs - prevAt
    prevAt = t.atMs
    return [
      t.factId,
      t.a,
      t.b,
      bit(t.correct),
      t.given,
      t.latencyMs,
      delta,
      intern(t.sessionId),
      bit(t.sessionInferred),
      t.levelId,
      t.mode == null ? null : code(MODES, t.mode),
      code(SOURCES, t.source),
      bit(t.isReplay),
    ]
  })

  return { v: RAW_LOG_ENCODING_VERSION, ids, s, a }
}

function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error('raw log: expected number')
  }
  return v
}
function numOrNull(v: unknown): number | null {
  return v === null ? null : num(v)
}
function str(v: unknown): string {
  if (typeof v !== 'string') throw new Error('raw log: expected string')
  return v
}
function strOrNull(v: unknown): string | null {
  return v === null ? null : str(v)
}
function flag(v: unknown): boolean {
  if (v !== 0 && v !== 1) throw new Error('raw log: expected 0/1')
  return v === 1
}
function arr(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error('raw log: expected array')
  return v
}

/** Decode a stored raw log. Throws on any malformed content (caller treats as corrupt). */
export function decodeRawLog(value: unknown): RawLog {
  if (!value || typeof value !== 'object') throw new Error('raw log: not an object')
  const enc = value as Partial<EncodedRawLog>
  if (enc.v !== RAW_LOG_ENCODING_VERSION) throw new Error('raw log: bad version')
  const ids = arr(enc.ids).map(str)
  const idAt = (i: unknown): string => {
    const n = num(i)
    const id = ids[n]
    if (id === undefined) throw new Error('raw log: bad session index')
    return id
  }

  const sessions: SessionRecord[] = arr(enc.s).map((row) => {
    const r = arr(row)
    return {
      id: idAt(r[0]),
      kind: uncode(KINDS, r[1]),
      startedAtMs: num(r[2]),
      endedAtMs: numOrNull(r[3]),
      mode: r[4] === null ? null : uncode(MODES, r[4]),
      levelId: strOrNull(r[5]),
      inferred: flag(r[6]),
      endReason: r[7] === null ? null : uncode(END_REASONS, r[7]),
      isReplay: flag(r[8]),
      pauses: arr(r[9]).map((p) => {
        const q = arr(p)
        return { startedAtMs: num(q[0]), endedAtMs: numOrNull(q[1]) }
      }),
      discardedOnHide: arr(r[10]).map((d) => {
        const q = arr(d)
        return {
          factId: str(q[0]),
          shownAtMs: num(q[1]),
          discardedAtMs: num(q[2]),
        }
      }),
    }
  })

  let prevAt = 0
  const attempts: RawAttempt[] = arr(enc.a).map((row) => {
    const r = arr(row)
    const atMs = prevAt + num(r[6])
    prevAt = atMs
    return {
      factId: str(r[0]),
      a: numOrNull(r[1]),
      b: numOrNull(r[2]),
      correct: flag(r[3]),
      given: numOrNull(r[4]),
      latencyMs: num(r[5]),
      atMs,
      sessionId: idAt(r[7]),
      sessionInferred: flag(r[8]),
      levelId: strOrNull(r[9]),
      mode: r[10] === null ? null : uncode(MODES, r[10]),
      source: uncode(SOURCES, r[11]),
      isReplay: flag(r[12]),
    }
  })

  return { attempts, sessions }
}

/**
 * Enforce the D11 cap: while the log holds more than `maxAttempts` attempts, evict the
 * oldest whole session (its attempts and its session record). Sessions are ordered by
 * start time (record `startedAtMs`, else first attempt). The newest session with
 * attempts is never evicted, so a single oversized session is kept whole.
 * Only the raw log is touched — never evidence caches, progress, records or player state.
 */
export function capRawLog(
  log: RawLog,
  maxAttempts: number = RULES.rawLogMaxAttempts,
): RawLog {
  if (log.attempts.length <= maxAttempts) return log

  const start = new Map<string, number>()
  const firstSeen = new Map<string, number>()
  const counts = new Map<string, number>()
  log.sessions.forEach((s, i) => {
    start.set(s.id, s.startedAtMs)
    firstSeen.set(s.id, i)
  })
  const hasRecord = new Set(log.sessions.map((s) => s.id))
  log.attempts.forEach((a, i) => {
    counts.set(a.sessionId, (counts.get(a.sessionId) ?? 0) + 1)
    if (!hasRecord.has(a.sessionId)) {
      const known = start.get(a.sessionId)
      start.set(a.sessionId, known === undefined ? a.atMs : Math.min(known, a.atMs))
    }
    if (!firstSeen.has(a.sessionId)) {
      firstSeen.set(a.sessionId, log.sessions.length + i)
    }
  })

  const order = [...start.keys()].sort(
    (x, y) =>
      start.get(x)! - start.get(y)! || firstSeen.get(x)! - firstSeen.get(y)!,
  )

  let remaining = log.attempts.length
  let sessionsWithAttempts = [...counts.values()].filter((c) => c > 0).length
  const evicted = new Set<string>()
  for (const id of order) {
    if (remaining <= maxAttempts) break
    const c = counts.get(id) ?? 0
    if (c > 0 && sessionsWithAttempts <= 1) break
    evicted.add(id)
    remaining -= c
    if (c > 0) sessionsWithAttempts -= 1
  }

  return {
    attempts: log.attempts.filter((a) => !evicted.has(a.sessionId)),
    sessions: log.sessions.filter((s) => !evicted.has(s.id)),
  }
}
