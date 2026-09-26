import { describe, expect, it } from 'vitest'
import type {
  AttemptSource,
  EvidenceBufferEntry,
  FactEvidence,
  FactRecord,
  LearnerProfileV1,
  LevelDef,
  RawAttempt,
  RawLog,
  SessionRecord,
  SkillProgress,
} from '../contracts'
import { RULES, levelIdOf } from '../contracts'
import {
  MASTERED_DISPLAY_VALUE,
  applyAttemptToEvidence,
  countedAttempts,
  countedFlags,
  detectComebacks,
  emptyFactEvidence,
  evaluateAdvancement,
  evaluateMixedLevel,
  evaluateTableLevel,
  factDisplayValue,
  factMarks,
  factStatus,
  isLikelyCorrect,
  levelAllowance,
  levelMarksTotal,
  rebuildEvidence,
} from './advancement'
import { emptyFactRecord } from './mastery'
import { createEmptySkillProgress } from './selection'
import { migrateV1ToV2 } from '../persistence/migration'
import { FIXTURE_T0, buildV1Fixture } from '../persistence/__fixtures__/v1Profile'

// ---- builders ----------------------------------------------------------------------------

const DAY = 86_400_000
/** Local noon on 2026-09-01 (keeps dayKeys stable in any time zone). */
const T0 = new Date(2026, 8, 1, 12, 0, 0).getTime()

interface AttemptOpts {
  latencyMs?: number
  inferred?: boolean
  levelId?: string | null
  source?: AttemptSource
  day?: number
}

let clock = 0
function att(
  factId: string,
  correct: boolean,
  sessionId: string,
  opts: AttemptOpts = {},
): RawAttempt {
  clock += 1000
  return {
    factId,
    a: null,
    b: null,
    correct,
    given: null,
    latencyMs: opts.latencyMs ?? 2000,
    atMs: T0 + (opts.day ?? 0) * DAY + clock,
    sessionId,
    sessionInferred: opts.inferred ?? false,
    levelId: opts.levelId === undefined ? 'L1' : opts.levelId,
    mode: 'practice',
    source: opts.source ?? 'draw',
    isReplay: false,
  }
}

/** "C M | C C" → attempts of one fact, `|` separates sessions. */
function script(factId: string, pattern: string, opts: AttemptOpts = {}): RawAttempt[] {
  const out: RawAttempt[] = []
  pattern.split('|').forEach((chunk, s) => {
    for (const t of chunk.trim().split(/\s+/).filter(Boolean)) {
      out.push(att(factId, t === 'C', `${factId}-s${s + 1}`, { ...opts, day: s }))
    }
  })
  return out
}

function fold(log: readonly RawAttempt[]): Record<string, FactEvidence> {
  const flags = countedFlags(log)
  const ev: Record<string, FactEvidence> = {}
  log.forEach((a, i) => {
    ev[a.factId] = applyAttemptToEvidence(
      ev[a.factId] ?? emptyFactEvidence(a.factId),
      a,
      flags[i]!,
    )
  })
  return ev
}

function evidenceOf(pattern: string, opts: AttemptOpts = {}): FactEvidence {
  return fold(script('7x8', pattern, opts))['7x8']!
}

function statusOf(pattern: string, opts: AttemptOpts = {}) {
  return factStatus(evidenceOf(pattern, opts))
}

// ---- counted attempts ----------------------------------------------------------------------

describe('countedFlags / countedAttempts (D2)', () => {
  it('drops a fact’s later attempts in the session after a miss; carried items in a new session count', () => {
    const log = [
      att('7x8', false, 's1'),
      att('3x4', true, 's1'),
      att('7x8', true, 's1', { source: 'reintroduce' }),
      att('7x8', true, 's1', { source: 'later-check' }),
      att('7x8', true, 's1', { source: 'draw' }),
      att('3x4', false, 's1'),
      att('3x4', true, 's1'),
      att('7x8', true, 's2', { source: 'reintroduce' }),
      att('7x8', true, 's2', { source: 'later-check' }),
    ]
    expect(countedFlags(log)).toEqual([true, true, false, false, false, true, false, true, true])
    expect(countedAttempts(log)).toEqual([log[0], log[1], log[5], log[7], log[8]])
  })

  it('the miss itself counts, and misses in other sessions do not leak', () => {
    const log = [att('2x2', true, 'a'), att('2x2', false, 'a'), att('2x2', false, 'b')]
    expect(countedFlags(log)).toEqual([true, true, true])
  })

  it('non-counted attempts do not move status or clear placementLikely', () => {
    const log = [att('7x8', false, 's1'), att('7x8', true, 's1'), att('7x8', true, 's1')]
    const flags = countedFlags(log)
    let ev = { ...emptyFactEvidence('7x8'), placementLikely: true }
    ev = applyAttemptToEvidence(ev, log[0]!, flags[0]!)
    expect(ev.placementLikely).toBe(false)
    const afterMiss = ev
    ev = applyAttemptToEvidence(ev, log[1]!, flags[1]!)
    ev = applyAttemptToEvidence(ev, log[2]!, flags[2]!)
    expect(ev.countedAttempts).toBe(1)
    expect(ev.window).toEqual(afterMiss.window)
    // Stage-2 fluency still sees the correct latencies (any source).
    expect(ev.recentCorrectLatenciesMs).toHaveLength(2)

    let pl = { ...emptyFactEvidence('7x8'), placementLikely: true }
    pl = applyAttemptToEvidence(pl, att('7x8', true, 'x'), false)
    expect(pl.placementLikely).toBe(true)
  })
})

// ---- status ----------------------------------------------------------------------------------

describe('factStatus (D2)', () => {
  it('no evidence → new', () => {
    expect(factStatus(undefined)).toBe('new')
    expect(factStatus(emptyFactEvidence('2x3'))).toBe('new')
  })

  it('100% accurate at 8 s → mastered', () => {
    expect(statusOf('C C | C C', { latencyMs: 8000 })).toBe('mastered')
    expect(statusOf('C | C', { latencyMs: 8000 })).toBe('mastered') // fast-track
    expect(statusOf('C | C', { latencyMs: 60_000 })).toBe('mastered')
  })

  it('C M C C over 2 sessions → mastered; one slip (C C C M) keeps mastery', () => {
    expect(statusOf('C M | C C')).toBe('mastered')
    expect(statusOf('C C | C M')).toBe('mastered')
    expect(statusOf('C | C | C | M')).toBe('mastered')
  })

  it('two misses in W → learning; ≤ 1 correct in ≥ 3 → struggling', () => {
    expect(statusOf('C | C | M | M')).toBe('learning')
    expect(statusOf('M | M | M')).toBe('struggling')
    expect(statusOf('C | M | M')).toBe('struggling')
    expect(statusOf('M | M')).toBe('learning')
  })

  it('a single typo never → struggling (exhaustive over ≤ 8 counted attempts)', () => {
    for (let len = 1; len <= 8; len++) {
      for (let miss = 0; miss < len; miss++) {
        for (let split = 0; split <= miss; split++) {
          // Keep every attempt counted: the miss is the last attempt of its session.
          const tokens = Array.from({ length: len }, (_, i) => (i === miss ? 'M' : 'C'))
          const pattern = [
            tokens.slice(0, split),
            tokens.slice(split, miss + 1),
            tokens.slice(miss + 1),
          ]
            .map((t) => t.join(' '))
            .join(' | ')
          const ev = evidenceOf(pattern)
          expect(ev.countedAttempts).toBe(len)
          expect(factStatus(ev), pattern).not.toBe('struggling')
        }
      }
    }
  })

  it('correct answers in only one session → never mastered', () => {
    expect(statusOf('C C C C C C C C C C')).toBe('learning')
    expect(statusOf('M | C C C C C C')).toBe('learning')
    expect(statusOf('M | M | C C C C C C C')).toBe('learning')
    expect(evidenceOf('C C C C C C C C C C').everMastered).toBe(false)
  })

  it('V1: an earlier correct session, then 4 clean answers in one session → mastered', () => {
    const ev = evidenceOf('C M | C C C C')
    // W is entirely in session 2; spacing is checked over all counted correct attempts.
    expect(new Set(ev.window.map((w) => w.sessionId)).size).toBe(1)
    expect(factStatus(ev)).toBe('mastered')
  })

  it('fast-track from inferred-only evidence is rejected; rule (b) from inferred evidence is allowed', () => {
    const inferred = { inferred: true, levelId: null }
    expect(statusOf('C | C', inferred)).toBe('learning')
    expect(statusOf('C | C C', inferred)).toBe('mastered')
    // One live correct session enables fast-track.
    const log = [
      att('7x8', true, 'v1-inferred-1', { inferred: true, levelId: null }),
      att('7x8', true, 'live-1'),
    ]
    expect(factStatus(fold(log)['7x8'])).toBe('mastered')
  })

  it('everMastered is set once and never unset', () => {
    const ev = evidenceOf('C | C | M | M')
    expect(factStatus(ev)).toBe('learning')
    expect(ev.everMastered).toBe(true)
  })

  it('isLikelyCorrect: mastered, placementLikely, or ≥ 2 counted with ≥ 75% in W', () => {
    expect(isLikelyCorrect(undefined)).toBe(false)
    expect(isLikelyCorrect({ ...emptyFactEvidence('2x2'), placementLikely: true })).toBe(true)
    expect(isLikelyCorrect(evidenceOf('C'))).toBe(false)
    expect(isLikelyCorrect(evidenceOf('C C'))).toBe(true)
    expect(isLikelyCorrect(evidenceOf('C C C M'))).toBe(true)
    expect(isLikelyCorrect(evidenceOf('C M | C'))).toBe(false)
    expect(isLikelyCorrect(evidenceOf('C | C'))).toBe(true)
  })
})

// ---- marks ---------------------------------------------------------------------------------

describe('evidence marks (D10)', () => {
  it('marks go down when misses enter the window', () => {
    const log = script('7x8', 'C C C | M | M | M')
    const flags = countedFlags(log)
    let ev = emptyFactEvidence('7x8')
    const marks: number[] = []
    log.forEach((a, i) => {
      ev = applyAttemptToEvidence(ev, a, flags[i]!)
      marks.push(factMarks(ev))
    })
    expect(marks).toEqual([1, 2, 3, 3, 2, 0])
    expect(factStatus(ev)).toBe('struggling')
  })

  it('0 for new and struggling; min(3, cW) otherwise', () => {
    expect(factMarks(undefined)).toBe(0)
    expect(factMarks(evidenceOf('M | M | M'))).toBe(0)
    expect(factMarks(evidenceOf('M | C'))).toBe(1)
    expect(factMarks(evidenceOf('C | C | C | C'))).toBe(3)
  })

  it('display 4 when mastered, back to marks when mastery drops', () => {
    expect(MASTERED_DISPLAY_VALUE).toBe(4)
    const fastTrack = evidenceOf('C | C')
    expect(factMarks(fastTrack)).toBe(2)
    expect(factDisplayValue(fastTrack)).toBe(4)

    const log = script('7x8', 'C C C | C | M | M')
    const flags = countedFlags(log)
    let ev = emptyFactEvidence('7x8')
    const display: number[] = []
    log.forEach((a, i) => {
      ev = applyAttemptToEvidence(ev, a, flags[i]!)
      display.push(factDisplayValue(ev))
    })
    expect(display).toEqual([1, 2, 3, 4, 4, 2])
    expect(ev.everMastered).toBe(true)
  })

  it('levelMarksTotal = Σ display value over the table facts', () => {
    const level = tableLevel(2, 3, 1)
    const ev = fold([
      ...script(level.tableFactIds[0]!, 'C | C'), // mastered → 4
      ...script(level.tableFactIds[1]!, 'C C'), // learning → 2
      ...script(level.tableFactIds[2]!, 'M | M | M'), // struggling → 0
    ])
    expect(levelMarksTotal(level, ev)).toBe(6)
  })
})

// ---- table levels ------------------------------------------------------------------------

function tableLevel(index: number, gating: number, extraTable = 0): LevelDef {
  const g = Array.from({ length: gating }, (_, i) => `g${index}_${i}`)
  const t = Array.from({ length: extraTable }, (_, i) => `t${index}_${i}`)
  return {
    id: levelIdOf(index),
    index,
    kind: 'table',
    title: `L${index}`,
    tables: [index],
    tableFactIds: [...g, ...t],
    ownedFactIds: g,
    gatingFactIds: g,
    introFactIds: [],
  }
}

function buffer(correct: number, wrong: number, prefix: EvidenceBufferEntry[] = []): EvidenceBufferEntry[] {
  const out = [...prefix]
  for (let i = 0; i < correct + wrong; i++) {
    out.push({ factId: 'g1_0', correct: i >= wrong, sessionId: 'b', dayKey: '2026-09-01' })
  }
  return out
}

const GOOD_BUFFER = buffer(20, 0)

function levelEvidence(level: LevelDef, masteredCount: number, struggling: string[] = []) {
  const log: RawAttempt[] = []
  level.gatingFactIds.forEach((id, i) => {
    if (struggling.includes(id)) return
    log.push(...script(id, i < masteredCount ? 'C | C' : 'C'))
  })
  for (const id of struggling) log.push(...script(id, 'M | M | M'))
  return fold(log)
}

describe('evaluateTableLevel (D2 R1–R5)', () => {
  const EXPECTED: [number, number, number][] = [
    [1, 9, 8],
    [2, 8, 7],
    [3, 7, 6],
    [4, 6, 5],
    [5, 5, 4],
    [6, 4, 3],
    [7, 3, 2],
    [8, 3, 2],
  ]

  it.each(EXPECTED)('R1 L%i: %i gating facts, %i required', (index, n, required) => {
    const level = tableLevel(index, n, 10 - n)
    expect(n - levelAllowance(n)).toBe(required)

    const pass = evaluateTableLevel(level, levelEvidence(level, required), GOOD_BUFFER, 2)
    expect(pass.r1).toEqual({ n, allowance: n - required, mastered: required, required, pass: true })
    expect(pass.pass).toBe(true)

    const fail = evaluateTableLevel(level, levelEvidence(level, required - 1), GOOD_BUFFER, 2)
    expect(fail.r1.pass).toBe(false)
    expect(fail.r2.pass && fail.r3.pass && fail.r4.pass && fail.r5.pass).toBe(true)
    expect(fail.pass).toBe(false)
  })

  it('R2: an unfinished gating fact may be learning or new, never struggling', () => {
    const level = tableLevel(1, 9, 10)
    const newFact = evaluateTableLevel(level, fold(level.gatingFactIds.slice(0, 8).flatMap((id) => script(id, 'C | C'))), GOOD_BUFFER, 2)
    expect(newFact.pass).toBe(true)

    const ev = levelEvidence(level, 8, ['g1_8'])
    const r = evaluateTableLevel(level, ev, GOOD_BUFFER, 2)
    expect(r.r1.pass).toBe(true)
    expect(r.r2).toEqual({ strugglingGatingFactIds: ['g1_8'], pass: false })
    expect(r.r3.pass).toBe(true)
    expect(r.pass).toBe(false)
  })

  it('R3: at most 1 struggling table fact', () => {
    const level = tableLevel(3, 7, 3)
    const base = levelEvidence(level, 7)
    const one = { ...base, ...fold(script('t3_0', 'M | M | M')) }
    expect(evaluateTableLevel(level, one, GOOD_BUFFER, 2).pass).toBe(true)
    const two = { ...one, ...fold(script('t3_1', 'C | M | M')) }
    const r = evaluateTableLevel(level, two, GOOD_BUFFER, 2)
    expect(r.r3).toEqual({ strugglingTableFactIds: ['t3_0', 't3_1'], pass: false })
    expect(r.pass).toBe(false)
  })

  it('R4: ≥ 85% over the last 20 evidence answers; fewer than 20 → fail', () => {
    const level = tableLevel(2, 8, 2)
    const ev = levelEvidence(level, 8)
    const r19 = evaluateTableLevel(level, ev, buffer(19, 0), 2)
    expect(r19.r4).toEqual({ answers: 19, accuracy: null, pass: false })
    expect(r19.pass).toBe(false)
    expect(evaluateTableLevel(level, ev, buffer(17, 3), 2).r4).toEqual({ answers: 20, accuracy: 0.85, pass: true })
    expect(evaluateTableLevel(level, ev, buffer(16, 4), 2).r4.pass).toBe(false)
    // Only the last 20 count: old misses fall out.
    expect(evaluateTableLevel(level, ev, buffer(20, 0, buffer(0, 30)), 2).r4.pass).toBe(true)
  })

  it('R5: at least 2 finished sessions at the level', () => {
    const level = tableLevel(4, 6, 4)
    const ev = levelEvidence(level, 6)
    expect(evaluateTableLevel(level, ev, GOOD_BUFFER, 1).r5).toEqual({ sessions: 1, pass: false })
    expect(evaluateTableLevel(level, ev, GOOD_BUFFER, 1).pass).toBe(false)
    expect(evaluateTableLevel(level, ev, GOOD_BUFFER, 2).pass).toBe(true)
  })
})

// ---- mixed level --------------------------------------------------------------------------

const ALL_FACTS = Array.from({ length: 55 }, (_, i) => `f${i}`)

function mixedSession(sessionId: string, dayKey: string, answers: number, wrong = 0): EvidenceBufferEntry[] {
  return Array.from({ length: answers }, (_, i) => ({
    factId: ALL_FACTS[i % 55]!,
    correct: i >= wrong,
    sessionId,
    dayKey,
  }))
}

describe('evaluateMixedLevel (D2 L9, option B + V4)', () => {
  it('Rush-only player (few long sessions) can finish: the window extends back to 3 sessions', () => {
    const buf = [
      ...mixedSession('r1', '2026-09-01', 70, 5),
      ...mixedSession('r2', '2026-09-02', 70, 5),
      ...mixedSession('r3', '2026-09-03', 70, 5),
    ]
    const r = evaluateMixedLevel(buf, {}, ALL_FACTS)
    expect(r.window).toMatchObject({ answers: 141, sessions: 3, days: 3 })
    expect(r.pass).toBe(true)
  })

  it('error-free Practice player can finish', () => {
    const buf = [
      ...mixedSession('p1', '2026-09-01', 20),
      ...mixedSession('p2', '2026-09-01', 20),
      ...mixedSession('p3', '2026-09-02', 20),
    ]
    const r = evaluateMixedLevel(buf, {}, ALL_FACTS)
    expect(r.window).toEqual({ answers: 50, sessions: 3, days: 2, accuracy: 1 })
    expect(r.pass).toBe(true)
  })

  it('fails without enough answers/sessions, on one day, below 85%, or with > 2 struggling facts', () => {
    expect(evaluateMixedLevel(mixedSession('x', '2026-09-01', 49), {}, ALL_FACTS)).toEqual({
      kind: 'mixed',
      window: null,
      strugglingFactIds: [],
      pass: false,
    })
    // 2 sessions only → no window even with many answers.
    const two = [...mixedSession('a', '2026-09-01', 100), ...mixedSession('b', '2026-09-02', 100)]
    expect(evaluateMixedLevel(two, {}, ALL_FACTS).window).toBeNull()

    const oneDay = [
      ...mixedSession('a', '2026-09-01', 20),
      ...mixedSession('b', '2026-09-01', 20),
      ...mixedSession('c', '2026-09-01', 20),
    ]
    expect(evaluateMixedLevel(oneDay, {}, ALL_FACTS).pass).toBe(false)

    const low = [
      ...mixedSession('a', '2026-09-01', 20, 4),
      ...mixedSession('b', '2026-09-02', 20, 4),
      ...mixedSession('c', '2026-09-02', 20, 4),
    ]
    const lr = evaluateMixedLevel(low, {}, ALL_FACTS)
    expect(lr.window?.accuracy).toBeCloseTo(0.84, 5)
    expect(lr.pass).toBe(false)

    const good = [
      ...mixedSession('a', '2026-09-01', 20),
      ...mixedSession('b', '2026-09-02', 20),
      ...mixedSession('c', '2026-09-02', 20),
    ]
    const two2 = fold([...script('f1', 'M | M | M'), ...script('f2', 'M | M | M')])
    expect(evaluateMixedLevel(good, two2, ALL_FACTS).pass).toBe(true)
    const three = { ...two2, ...fold(script('f3', 'M | M | M')) }
    const r3 = evaluateMixedLevel(good, three, ALL_FACTS)
    expect(r3.strugglingFactIds).toEqual(['f1', 'f2', 'f3'])
    expect(r3.pass).toBe(false)
  })
})

// ---- D12 exact invariant --------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SOURCES: AttemptSource[] = ['draw', 'draw', 'draw', 'reintroduce', 'later-check', 'placement']

function randomRawLog(seed: number): RawLog {
  const rnd = mulberry32(seed)
  const facts = Array.from({ length: 12 }, (_, i) => `g1_${i}`)
  const attempts: RawAttempt[] = []
  const sessions: SessionRecord[] = []
  const nSessions = 4 + Math.floor(rnd() * 8)
  for (let s = 0; s < nSessions; s++) {
    const id = `sess-${s}`
    const inferred = s < 2 && rnd() < 0.5
    const levelId = inferred ? null : rnd() < 0.8 ? 'L1' : 'L9'
    const startedAtMs = T0 + s * DAY
    let at = startedAtMs
    const n = 5 + Math.floor(rnd() * 40)
    for (let q = 0; q < n; q++) {
      at += 3000
      attempts.push({
        factId: facts[Math.floor(rnd() * facts.length)]!,
        a: null,
        b: null,
        correct: rnd() < 0.8,
        given: null,
        latencyMs: 300 + Math.floor(rnd() * 15_000),
        atMs: at,
        sessionId: id,
        sessionInferred: inferred,
        levelId,
        mode: inferred ? null : 'quick',
        source: inferred ? 'draw' : SOURCES[Math.floor(rnd() * SOURCES.length)]!,
        isReplay: false,
      })
    }
    sessions.push({
      id,
      kind: 'play',
      startedAtMs,
      endedAtMs: at,
      mode: inferred ? null : 'quick',
      levelId,
      inferred,
      endReason: inferred ? 'inferred' : 'finished',
      isReplay: false,
      pauses: [],
      discardedOnHide: [],
    })
  }
  return { attempts, sessions }
}

function scaleLatency(log: RawLog, k: number): RawLog {
  return { ...log, attempts: log.attempts.map((a) => ({ ...a, latencyMs: a.latencyMs * k })) }
}

/** Every latency-free decision derived from a raw log. */
function decisions(log: RawLog) {
  const progress = rebuildEvidence(log, createEmptySkillProgress())
  const flags = countedFlags(log.attempts)
  // Incremental status after every attempt.
  const running: Record<string, FactEvidence> = {}
  const stepStatus = log.attempts.map((a, i) => {
    running[a.factId] = applyAttemptToEvidence(running[a.factId] ?? emptyFactEvidence(a.factId), a, flags[i]!)
    return factStatus(running[a.factId])
  })
  const level = tableLevel(1, 9, 3)
  const factIds = Object.keys(progress.factEvidence).sort()
  return {
    flags,
    stepStatus,
    status: factIds.map((id) => factStatus(progress.factEvidence[id])),
    marks: factIds.map((id) => factDisplayValue(progress.factEvidence[id])),
    everMastered: factIds.map((id) => progress.factEvidence[id]!.everMastered),
    buffers: progress.evidence,
    table: evaluateTableLevel(level, progress.factEvidence, progress.evidence['L1'] ?? [], progress.finishedSessionsByLevel['L1'] ?? 0),
    mixed: evaluateMixedLevel(progress.evidence['L9'] ?? [], progress.factEvidence, factIds),
  }
}

describe('D12 exact invariant: latency never changes status, counting or completion', () => {
  it('scaling all latencies ×0.3 and ×3 leaves every decision identical (200 random logs)', () => {
    let sawMastered = false
    let sawStruggling = false
    let sawPass = false
    for (let seed = 1; seed <= 200; seed++) {
      const log = randomRawLog(seed)
      const base = decisions(log)
      expect(decisions(scaleLatency(log, 0.3))).toEqual(base)
      expect(decisions(scaleLatency(log, 3))).toEqual(base)
      sawMastered ||= base.status.includes('mastered')
      sawStruggling ||= base.status.includes('struggling')
      sawPass ||= base.table.r1.pass
    }
    // The generated logs exercise the interesting branches.
    expect(sawMastered && sawStruggling && sawPass).toBe(true)
  })
})

// ---- evidence view (D11) ------------------------------------------------------------------

function v1Record(factId: string, attempts: [number, boolean][]): FactRecord {
  return {
    ...emptyFactRecord(factId),
    attempts: attempts.length,
    correct: attempts.filter(([, c]) => c).length,
    recentAttempts: attempts.map(([atMs, correct]) => ({ correct, latencyMs: 7000, atMs })),
  }
}

describe('rebuildEvidence (D11)', () => {
  it('rebuilds a migrated v1 raw log to the expected statuses', () => {
    const d = (day: number, min = 0) => T0 + day * DAY + min * 60_000
    const v1: LearnerProfileV1 = {
      version: 1,
      learnerName: 'Mikaela',
      createdAtMs: T0 - DAY,
      updatedAtMs: d(3),
      placementComplete: true,
      facts: {
        // Inferred-only fast-track: rejected.
        '2x3': v1Record('2x3', [[d(0), true], [d(1), true]]),
        // Rule (b) from inferred evidence: allowed.
        '3x4': v1Record('3x4', [[d(0), true], [d(1), true], [d(1, 1), true]]),
        // Stray orientation merges into 7x8: C (day 0) + C C (day 2) → mastered.
        '7x8': v1Record('7x8', [[d(0, 2), true]]),
        '8x7': v1Record('8x7', [[d(2), true], [d(2, 1), true]]),
        // Misses in 3 inferred sessions → struggling.
        '6x7': v1Record('6x7', [[d(0, 3), false], [d(1, 3), false], [d(2, 3), false]]),
        // After a miss, the rest of the inferred session does not count → learning.
        '4x6': v1Record('4x6', [[d(0, 4), false], [d(0, 5), true], [d(0, 6), true], [d(0, 7), true]]),
        // One inferred session only → never mastered.
        '2x9': v1Record('2x9', [[d(1, 10), true], [d(1, 11), true], [d(1, 12), true], [d(1, 13), true]]),
      },
      bestTimeMsByMode: {},
      bestStreakByMode: {},
      dailyStreak: 0,
      lastPlayDayKey: null,
      gameXp: 0,
      pendingReinforcements: [],
    }
    const v2 = migrateV1ToV2(v1, d(4))
    expect(v2.progress.evidenceStale).toBe(true)
    const p = rebuildEvidence(v2.rawLog, v2.progress)
    const status = (id: string) => factStatus(p.factEvidence[id])
    expect(p.evidenceStale).toBe(false)
    expect(status('2x3')).toBe('learning')
    expect(status('3x4')).toBe('mastered')
    expect(status('7x8')).toBe('mastered')
    expect(p.factEvidence['8x7']).toBeUndefined()
    expect(status('6x7')).toBe('struggling')
    expect(status('4x6')).toBe('learning')
    expect(p.factEvidence['4x6']!.countedAttempts).toBe(1)
    expect(status('2x9')).toBe('learning')
    expect(status('9x9')).toBe('new')
    // everMastered set silently; no level buffers or finished sessions from inferred history.
    expect(p.factEvidence['3x4']!.everMastered).toBe(true)
    expect(p.factEvidence['2x3']!.everMastered).toBe(false)
    expect(p.evidence).toEqual({})
    expect(p.finishedSessionsByLevel).toEqual({})
    expect(p.currentLevelId).toBe(v2.progress.currentLevelId)
  })

  it('the realistic v1 fixture rebuilds to the same view as incremental folding', () => {
    const v2 = migrateV1ToV2(buildV1Fixture(), FIXTURE_T0 + 10 * DAY)
    const p = rebuildEvidence(v2.rawLog, v2.progress)
    expect(p.factEvidence).toEqual(fold(v2.rawLog.attempts))
    expect(Object.values(p.factEvidence).some((e) => factStatus(e) !== 'new')).toBe(true)
    // Rebuild is idempotent.
    expect(rebuildEvidence(v2.rawLog, p)).toEqual(p)
  })

  it('buffers hold counted draws per level only (capped); R5 counts finished play sessions', () => {
    const attempts = [
      att('2x2', false, 's1', { levelId: 'L1' }),
      att('2x2', true, 's1', { levelId: 'L1', source: 'reintroduce' }),
      att('2x2', true, 's1', { levelId: 'L1' }), // after a miss: not counted
      att('2x3', true, 's1', { levelId: 'L1', source: 'placement' }),
      att('2x4', true, 's1', { levelId: 'L1' }),
      att('2x5', true, 'm1', { levelId: null }),
    ]
    const sessions: SessionRecord[] = [
      ['s1', 'play', 'finished', 'L1'],
      ['s2', 'play', 'finished', 'L1'],
      ['s3', 'play', 'abandoned', 'L1'],
      ['s4', 'placement', 'finished', 'L1'],
      ['s5', 'play', 'finished', 'L2'],
    ].map(([id, kind, endReason, levelId]) => ({
      id: id!,
      kind: kind as SessionRecord['kind'],
      startedAtMs: T0,
      endedAtMs: T0,
      mode: 'quick',
      levelId: levelId!,
      inferred: false,
      endReason: endReason as SessionRecord['endReason'],
      isReplay: false,
      pauses: [],
      discardedOnHide: [],
    }))
    const p = rebuildEvidence({ attempts, sessions }, createEmptySkillProgress())
    expect(p.evidence['L1']!.map((e) => [e.factId, e.correct])).toEqual([
      ['2x2', false],
      ['2x4', true],
    ])
    expect(p.evidence['L1']![0]!.dayKey).toBe('2026-09-01')
    expect(p.finishedSessionsByLevel).toEqual({ L1: 2, L2: 1 })

    const many = Array.from({ length: RULES.evidenceBufferMax + 25 }, (_, i) =>
      att(`f${i}`, true, `s${i}`, { levelId: 'L9' }),
    )
    const big = rebuildEvidence({ attempts: many, sessions: [] }, createEmptySkillProgress())
    expect(big.evidence['L9']).toHaveLength(RULES.evidenceBufferMax)
    expect(big.evidence['L9']![0]!.factId).toBe('f25')
  })

  it('carries everMastered and placementLikely from the prior progress', () => {
    const prior: SkillProgress = {
      ...createEmptySkillProgress(),
      evidenceStale: true,
      factEvidence: {
        '5x5': { ...emptyFactEvidence('5x5'), everMastered: true },
        '6x6': { ...emptyFactEvidence('6x6'), placementLikely: true },
      },
    }
    const p = rebuildEvidence({ attempts: [att('7x7', true, 's1')], sessions: [] }, prior)
    expect(p.factEvidence['5x5']!.everMastered).toBe(true)
    expect(p.factEvidence['6x6']!.placementLikely).toBe(true)
    expect(p.factEvidence['7x7']!.countedAttempts).toBe(1)
    expect(p.evidenceStale).toBe(false)
  })
})

// ---- comebacks & advancement ----------------------------------------------------------------

describe('detectComebacks (D6 Comeback Kid)', () => {
  it('fires when the first attempt in the session is correct after a miss in an earlier session', () => {
    const log = [
      att('7x8', false, 'a'),
      att('3x4', false, 'a'),
      att('2x2', true, 'a'),
      att('7x8', true, 'b'),
      att('3x4', false, 'b'),
      att('3x4', true, 'b'),
      att('2x2', true, 'b'),
    ]
    const ev = detectComebacks(log, 'b')
    expect(ev).toEqual([
      { type: 'fact-comeback', atMs: log[3]!.atMs, sessionId: 'b', factId: '7x8', missedInSessionId: 'a' },
    ])
    expect(detectComebacks(log, 'a')).toEqual([])
  })
})

describe('evaluateAdvancement (D2 + D4)', () => {
  const L1 = tableLevel(1, 9, 1)
  const L2 = tableLevel(2, 8, 2)

  function progressWith(ev: Record<string, FactEvidence>, overrides: Partial<SkillProgress> = {}): SkillProgress {
    return {
      ...createEmptySkillProgress(),
      factEvidence: ev,
      evidence: { L1: GOOD_BUFFER },
      finishedSessionsByLevel: { L1: 2 },
      ...overrides,
    }
  }

  it('completes the level, unlocks and moves to the next one, with events', () => {
    const before = progressWith(levelEvidence(L1, 7))
    const after = progressWith(levelEvidence(L1, 9))
    const r = evaluateAdvancement({ before, after, level: L1, nextLevel: L2, allFactIds: ALL_FACTS, sessionId: 'sx', atMs: 42 })
    expect(r).toMatchObject({
      levelId: 'L1',
      passed: true,
      wasCompleted: false,
      newlyCompleted: true,
      unlockedLevelId: 'L2',
      currentLevelId: 'L2',
      newlyMasteredFactIds: ['g1_7', 'g1_8'],
    })
    expect(r.checks.kind).toBe('table')
    expect(r.events.map((e) => e.type)).toEqual(['fact-mastered', 'fact-mastered', 'level-completed', 'level-unlocked'])
    expect(r.events[0]).toMatchObject({ factId: 'g1_7', firstTime: true, levelId: 'L1', sessionId: 'sx', atMs: 42 })
  })

  it('replaying a completed level never re-completes; failing keeps everything', () => {
    const ev = levelEvidence(L1, 9)
    const done = progressWith(ev, { completedLevelIds: ['L1'], unlockedLevelIds: ['L1', 'L2'], currentLevelId: 'L2' })
    const r = evaluateAdvancement({ before: done, after: done, level: L1, nextLevel: L2, allFactIds: ALL_FACTS, sessionId: 's', atMs: 1 })
    expect(r).toMatchObject({ passed: true, wasCompleted: true, newlyCompleted: false, unlockedLevelId: null, currentLevelId: 'L2', events: [] })

    const failing = progressWith(levelEvidence(L1, 5))
    const f = evaluateAdvancement({ before: failing, after: failing, level: L1, nextLevel: L2, allFactIds: ALL_FACTS, sessionId: 's', atMs: 1 })
    expect(f).toMatchObject({ passed: false, newlyCompleted: false, currentLevelId: 'L1', unlockedLevelId: null })
  })

  it('completing a lower level never moves current back below a placement start', () => {
    const p = progressWith(levelEvidence(L1, 9), { currentLevelId: 'L5', unlockedLevelIds: ['L1', 'L2', 'L3', 'L4', 'L5'] })
    const r = evaluateAdvancement({ before: p, after: p, level: L1, nextLevel: L2, allFactIds: ALL_FACTS, sessionId: 's', atMs: 1 })
    expect(r).toMatchObject({ newlyCompleted: true, unlockedLevelId: null, currentLevelId: 'L5' })
    expect(r.events.map((e) => e.type)).toEqual(['level-completed'])
  })

  it('mixed and speed levels dispatch to their rules', () => {
    const L9: LevelDef = { ...tableLevel(9, 0), kind: 'mixed', tableFactIds: ALL_FACTS }
    const L10: LevelDef = { ...L9, id: 'L10', index: 10, kind: 'speed' }
    const p = createEmptySkillProgress()
    const m = evaluateAdvancement({ before: p, after: p, level: L9, nextLevel: L10, allFactIds: ALL_FACTS, sessionId: 's', atMs: 1 })
    expect(m.checks.kind).toBe('mixed')
    expect(m.passed).toBe(false)
    const s = evaluateAdvancement({ before: p, after: p, level: L10, nextLevel: null, allFactIds: ALL_FACTS, sessionId: 's', atMs: 1 })
    expect(s.checks).toEqual({ kind: 'none', pass: false })
  })
})
