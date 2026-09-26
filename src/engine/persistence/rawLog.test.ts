import { describe, expect, it } from 'vitest'
import type { RawAttempt, RawLog, SessionRecord } from '../contracts'
import { RULES } from '../contracts'
import { capRawLog, decodeRawLog, encodeRawLog } from './rawLog'

function session(id: string, startedAtMs: number, extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    kind: 'play',
    startedAtMs,
    endedAtMs: startedAtMs + 60_000,
    mode: 'quick',
    levelId: 'L1',
    inferred: false,
    endReason: 'finished',
    isReplay: false,
    pauses: [],
    discardedOnHide: [],
    ...extra,
  }
}

function attempt(sessionId: string, atMs: number, extra: Partial<RawAttempt> = {}): RawAttempt {
  return {
    factId: '7x8',
    a: 8,
    b: 7,
    correct: true,
    given: 56,
    latencyMs: 2345,
    atMs,
    sessionId,
    sessionInferred: false,
    levelId: 'L7',
    mode: 'practice',
    source: 'draw',
    isReplay: false,
    ...extra,
  }
}

/** n sessions of `per` attempts each, 1 h apart. */
function logOf(n: number, per: number): RawLog {
  const sessions: SessionRecord[] = []
  const attempts: RawAttempt[] = []
  for (let s = 0; s < n; s++) {
    const id = `s${s}`
    const start = 1_700_000_000_000 + s * 3_600_000
    sessions.push(session(id, start))
    for (let i = 0; i < per; i++) attempts.push(attempt(id, start + i * 1000))
  }
  return { attempts, sessions }
}

describe('raw log encoding (D11)', () => {
  it('round-trips every field', () => {
    const log: RawLog = {
      sessions: [
        session('v1-inferred-1', 10, {
          inferred: true,
          mode: null,
          levelId: null,
          endReason: 'inferred',
        }),
        session('abc', 5_000, {
          kind: 'placement',
          endedAtMs: null,
          endReason: null,
          isReplay: true,
          pauses: [
            { startedAtMs: 5_100, endedAtMs: 5_200 },
            { startedAtMs: 5_300, endedAtMs: null },
          ],
          discardedOnHide: [{ factId: '3x4', shownAtMs: 5_050, discardedAtMs: 5_100 }],
        }),
      ],
      attempts: [
        attempt('v1-inferred-1', 10, {
          a: null,
          b: null,
          given: null,
          sessionInferred: true,
          levelId: null,
          mode: null,
        }),
        attempt('abc', 5_010, { correct: false, given: 54, source: 'placement', isReplay: true }),
        attempt('abc', 5_005, { source: 'reintroduce', mode: 'rush' }),
        attempt('orphan', 6_000, { source: 'later-check', latencyMs: 12.5 }),
      ],
    }
    const encoded = encodeRawLog(log)
    expect(decodeRawLog(JSON.parse(JSON.stringify(encoded)))).toEqual(log)
  })

  it('is much smaller than plain JSON', () => {
    const log = logOf(20, 25)
    const plain = JSON.stringify(log).length
    const compact = JSON.stringify(encodeRawLog(log)).length
    expect(compact).toBeLessThan(plain * 0.4)
  })

  it('rejects malformed input', () => {
    expect(() => decodeRawLog(null)).toThrow()
    expect(() => decodeRawLog({ v: 99, ids: [], s: [], a: [] })).toThrow()
    expect(() => decodeRawLog({ v: 1, ids: [], s: [], a: [['7x8']] })).toThrow()
    expect(() =>
      decodeRawLog({ v: 1, ids: ['x'], s: [], a: [['7x8', 7, 8, 1, 56, 10, 5, 3, 0, null, null, 0, 0]] }),
    ).toThrow()
  })
})

describe('raw log cap (D11)', () => {
  it('leaves a log under the cap untouched', () => {
    const log = logOf(3, 10)
    expect(capRawLog(log, 30)).toBe(log)
  })

  it('evicts whole oldest sessions only', () => {
    const log = logOf(10, 25) // 250 attempts
    const capped = capRawLog(log, 110)
    // Must drop 6 whole sessions (100 left): 5 would still leave 125 > 110.
    expect(capped.attempts).toHaveLength(100)
    expect(capped.sessions.map((s) => s.id)).toEqual(['s6', 's7', 's8', 's9'])
    const counts = new Map<string, number>()
    for (const a of capped.attempts) counts.set(a.sessionId, (counts.get(a.sessionId) ?? 0) + 1)
    for (const c of counts.values()) expect(c).toBe(25)
  })

  it('orders by session start, not array position; orphan attempts use their first time', () => {
    const log = logOf(3, 10)
    // Move the oldest session record to the end of the array.
    log.sessions = [log.sessions[1]!, log.sessions[2]!, log.sessions[0]!]
    log.attempts.unshift(attempt('orphan-old', 1, {}))
    const capped = capRawLog(log, 20)
    expect(capped.sessions.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(capped.attempts.every((a) => a.sessionId === 's1' || a.sessionId === 's2')).toBe(true)
  })

  it('never evicts the newest session even if it alone exceeds the cap', () => {
    const log = logOf(2, 30)
    const capped = capRawLog(log, 10)
    expect(capped.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(capped.attempts).toHaveLength(30)
  })

  it('defaults to RULES.rawLogMaxAttempts', () => {
    expect(RULES.rawLogMaxAttempts).toBe(20_000)
    const log = logOf(201, 100) // 20 100 attempts
    const capped = capRawLog(log)
    expect(capped.attempts).toHaveLength(20_000)
    expect(capped.sessions[0]!.id).toBe('s1')
  })
})
