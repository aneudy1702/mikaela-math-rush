import { describe, expect, it } from 'vitest'
import type {
  AttemptSource,
  PersonalRecord,
  RawAttempt,
  SessionLogEntry,
  SessionRecord,
} from '../contracts'
import { RULES, SPEC_CONSTANTS, recordKeyId } from '../contracts'
import {
  appendSessionLog,
  applyRecordEvaluation,
  buildSessionLogEntry,
  evaluateRecord,
  recordKey,
} from './records'

const T0 = new Date(2026, 8, 20, 10, 0, 0).getTime()

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    kind: 'play',
    startedAtMs: T0,
    endedAtMs: T0 + 60_000,
    mode: 'quick',
    levelId: 'L3',
    inferred: false,
    endReason: 'finished',
    isReplay: false,
    pauses: [],
    discardedOnHide: [],
    ...overrides,
  }
}

function attempt(
  correct: boolean,
  opts: { source?: AttemptSource; sessionId?: string; latencyMs?: number; factId?: string; i?: number } = {},
): RawAttempt {
  const i = opts.i ?? 0
  return {
    factId: opts.factId ?? '3x4',
    a: 3,
    b: 4,
    correct,
    given: correct ? 12 : 11,
    latencyMs: opts.latencyMs ?? 2000,
    atMs: T0 + 1000 * (i + 1),
    sessionId: opts.sessionId ?? 's1',
    sessionInferred: false,
    levelId: 'L3',
    mode: 'quick',
    source: opts.source ?? 'draw',
    isReplay: false,
  }
}

/** n draw attempts with `wrong` misses (misses first). */
function draws(n: number, wrong: number, sessionId = 's1'): RawAttempt[] {
  return Array.from({ length: n }, (_, i) => attempt(i >= wrong, { sessionId, i }))
}

function entry(overrides: Partial<SessionLogEntry> = {}): SessionLogEntry {
  return {
    sessionId: 's1',
    skillId: 'mult',
    levelId: 'L3',
    mode: 'quick',
    rulesVersion: RULES.rulesVersion,
    startedAtMs: T0,
    endedAtMs: T0 + 60_000,
    elapsedMs: 60_000,
    dayKey: '2026-09-20',
    completed: true,
    answered: 10,
    correct: 10,
    drawAnswers: 10,
    drawCorrect: 10,
    longestStreak: 10,
    isReplay: false,
    ...overrides,
  }
}

/** Evaluate + apply, returning the evaluation and the resulting record. */
function run(existing: PersonalRecord | undefined, e: SessionLogEntry) {
  const evaluation = evaluateRecord(existing, e)
  return { evaluation, record: applyRecordEvaluation(existing, e, evaluation) }
}

describe('recordKey', () => {
  it('defaults rulesVersion to RULES.rulesVersion', () => {
    expect(recordKey('mult', 'L3', 'quick')).toEqual({
      skillId: 'mult',
      levelId: 'L3',
      mode: 'quick',
      rulesVersion: RULES.rulesVersion,
    })
    expect(recordKey('mult', 'L3', 'quick', 7).rulesVersion).toBe(7)
  })

  it('produces distinct ids for every key component', () => {
    const base = recordKeyId(recordKey('mult', 'L3', 'quick', 1))
    expect(recordKeyId(recordKey('add', 'L3', 'quick', 1))).not.toBe(base)
    expect(recordKeyId(recordKey('mult', 'L4', 'quick', 1))).not.toBe(base)
    expect(recordKeyId(recordKey('mult', 'L3', 'practice', 1))).not.toBe(base)
    expect(recordKeyId(recordKey('mult', 'L3', 'quick', 2))).not.toBe(base)
  })
})

describe('buildSessionLogEntry', () => {
  it('summarizes the session and counts draw answers separately', () => {
    const attempts = [
      attempt(false, { i: 0 }),
      attempt(true, { i: 1, source: 'reintroduce' }),
      attempt(true, { i: 2 }),
      attempt(false, { i: 3, source: 'later-check' }),
      attempt(true, { i: 4, sessionId: 'other' }),
    ]
    const e = buildSessionLogEntry(session({ isReplay: true }), attempts, { skillId: 'mult', longestStreak: 2 })
    expect(e).toMatchObject({
      sessionId: 's1',
      skillId: 'mult',
      levelId: 'L3',
      mode: 'quick',
      rulesVersion: RULES.rulesVersion,
      elapsedMs: 60_000,
      dayKey: '2026-09-20',
      completed: true,
      answered: 4,
      correct: 2,
      drawAnswers: 2,
      drawCorrect: 1,
      longestStreak: 2,
      isReplay: true,
    })
  })

  it('excludes visibility pauses from real elapsed time (open pause runs to end)', () => {
    const s = session({
      pauses: [
        { startedAtMs: T0 + 10_000, endedAtMs: T0 + 25_000 },
        { startedAtMs: T0 + 55_000, endedAtMs: null },
      ],
    })
    expect(buildSessionLogEntry(s, [], { skillId: 'mult', longestStreak: 0 }).elapsedMs).toBe(40_000)
  })

  it('marks abandoned sessions incomplete', () => {
    const e = buildSessionLogEntry(session({ endReason: 'abandoned' }), draws(10, 0), {
      skillId: 'mult',
      longestStreak: 10,
    })
    expect(e.completed).toBe(false)
  })

  it('rejects sessions without level/mode', () => {
    expect(() =>
      buildSessionLogEntry(session({ levelId: null, mode: null, inferred: true }), [], {
        skillId: 'mult',
        longestStreak: 0,
      }),
    ).toThrow()
  })
})

describe('evaluateRecord eligibility (D3)', () => {
  it('89.9% is never eligible; 90% is eligible', () => {
    expect(evaluateRecord(undefined, entry({ drawAnswers: 1000, drawCorrect: 899 })).eligible).toBe(false)
    expect(evaluateRecord(undefined, entry({ drawAnswers: 1000, drawCorrect: 900 })).eligible).toBe(true)
    // Every exactly-90% ratio is eligible (guards against floating-point drift).
    for (let n = 10; n <= 500; n += 10) {
      expect(evaluateRecord(undefined, entry({ drawAnswers: n, drawCorrect: (n / 10) * 9 })).eligible, `${n}`).toBe(true)
      expect(evaluateRecord(undefined, entry({ drawAnswers: n, drawCorrect: (n / 10) * 9 - 1 })).eligible, `${n}`).toBe(false)
    }
  })

  it('an incomplete run is never eligible', () => {
    const e = evaluateRecord(undefined, entry({ completed: false }))
    expect(e).toMatchObject({ eligible: false, isBaseline: false, isNewRecord: false })
  })

  it('a run with no draw answers is not eligible', () => {
    expect(evaluateRecord(undefined, entry({ drawAnswers: 0, drawCorrect: 0 })).eligible).toBe(false)
  })

  it('counts repeat draws of an already-missed fact and ignores reinforcement items', () => {
    // 10 draws: fact 7x8 missed once, then drawn again and answered. 9/10 = 90% → eligible.
    const base = draws(10, 1).map((a) => ({ ...a, factId: a.correct ? '3x4' : '7x8' }))
    const repeat = { ...base[9]!, factId: '7x8' }
    const attempts: RawAttempt[] = [...base.slice(0, 9), repeat]
    const ok = buildSessionLogEntry(session(), attempts, { skillId: 'mult', longestStreak: 9 })
    expect(ok.drawAnswers).toBe(10)
    expect(evaluateRecord(undefined, ok).eligible).toBe(true)

    // A second miss on the repeat draw of the same fact counts: 8/10 → not eligible.
    const missedAgain = [...base.slice(0, 9), { ...repeat, correct: false }]
    const bad = buildSessionLogEntry(session(), missedAgain, { skillId: 'mult', longestStreak: 8 })
    expect(bad.drawAnswers).toBe(10)
    expect(bad.drawCorrect).toBe(8)
    expect(evaluateRecord(undefined, bad).eligible).toBe(false)

    // Wrong reinforcement items (reintroduce / later-check) never affect eligibility.
    const withReinforcement = [
      ...attempts,
      attempt(false, { source: 'reintroduce', i: 11 }),
      attempt(false, { source: 'later-check', i: 12 }),
      attempt(false, { source: 'reintroduce', i: 13 }),
    ]
    const r = buildSessionLogEntry(session(), withReinforcement, { skillId: 'mult', longestStreak: 9 })
    expect(r.answered).toBe(13)
    expect(evaluateRecord(undefined, r).eligible).toBe(true)
  })

  it('eligibility is invariant to latency scaling (×0.3, ×3)', () => {
    const variants = [draws(10, 1), draws(10, 2), draws(20, 2), draws(20, 3)]
    for (const attempts of variants) {
      const results = [1, 0.3, 3].map((k) => {
        const scaled = attempts.map((a) => ({ ...a, latencyMs: a.latencyMs * k }))
        return evaluateRecord(undefined, buildSessionLogEntry(session(), scaled, { skillId: 'mult', longestStreak: 0 }))
      })
      expect(results[1]).toEqual(results[0])
      expect(results[2]).toEqual(results[0])
    }
  })
})

describe('evaluateRecord baseline and records', () => {
  it('first eligible run sets the baseline, not a new record', () => {
    const { evaluation, record } = run(undefined, entry({ elapsedMs: 50_000 }))
    expect(evaluation).toMatchObject({ eligible: true, isBaseline: true, isNewRecord: false, previousBestMs: null })
    expect(record).toMatchObject({
      baselineMs: 50_000,
      bestMs: 50_000,
      baselineSessionId: 's1',
      bestSessionId: 's1',
      eligibleRuns: 1,
      timesBeaten: 0,
    })
  })

  it('an ineligible first run does not create a baseline', () => {
    const { evaluation, record } = run(undefined, entry({ drawCorrect: 8 }))
    expect(evaluation.isBaseline).toBe(false)
    expect(record).toBeUndefined()
  })

  it('second faster run is a new record; an equal time is not', () => {
    const first = run(undefined, entry({ sessionId: 'a', elapsedMs: 50_000 })).record
    const faster = run(first, entry({ sessionId: 'b', elapsedMs: 45_000 }))
    expect(faster.evaluation).toMatchObject({ isBaseline: false, isNewRecord: true, previousBestMs: 50_000 })
    expect(faster.record).toMatchObject({ baselineMs: 50_000, bestMs: 45_000, bestSessionId: 'b', eligibleRuns: 2, timesBeaten: 1 })

    const tie = run(faster.record, entry({ sessionId: 'c', elapsedMs: 45_000 }))
    expect(tie.evaluation).toMatchObject({ eligible: true, isBaseline: false, isNewRecord: false, previousBestMs: 45_000 })
    expect(tie.record).toMatchObject({ bestMs: 45_000, bestSessionId: 'b', eligibleRuns: 3, timesBeaten: 1 })

    const slower = run(tie.record, entry({ sessionId: 'd', elapsedMs: 70_000 }))
    expect(slower.evaluation.isNewRecord).toBe(false)
    expect(slower.record).toMatchObject({ bestMs: 45_000, eligibleRuns: 4 })
  })

  it('an ineligible faster run is never a record and leaves the record unchanged', () => {
    const first = run(undefined, entry({ sessionId: 'a', elapsedMs: 50_000 })).record
    const fastBad = run(first, entry({ sessionId: 'b', elapsedMs: 10_000, drawCorrect: 8 }))
    expect(fastBad.evaluation).toMatchObject({ eligible: false, isNewRecord: false })
    expect(fastBad.record).toBe(first)
    const fastIncomplete = run(first, entry({ sessionId: 'c', elapsedMs: 10_000, completed: false }))
    expect(fastIncomplete.evaluation.isNewRecord).toBe(false)
    expect(fastIncomplete.record).toBe(first)
  })

  it('never compares across skill, level, mode or rulesVersion', () => {
    const record = run(undefined, entry({ sessionId: 'a', elapsedMs: 50_000 })).record!
    const others: Partial<SessionLogEntry>[] = [
      { skillId: 'add' },
      { levelId: 'L4' },
      { mode: 'practice' },
      { rulesVersion: RULES.rulesVersion + 1 },
    ]
    for (const diff of others) {
      const e = entry({ sessionId: 'b', elapsedMs: 10_000, ...diff })
      const { evaluation, record: out } = run(record, e)
      expect(evaluation).toMatchObject({ eligible: true, isBaseline: true, isNewRecord: false, previousBestMs: null })
      expect(recordKeyId(evaluation.key)).not.toBe(recordKeyId(record.key))
      // A fresh record at the entry's own key; the passed (foreign) record is untouched.
      expect(recordKeyId(out!.key)).toBe(recordKeyId(evaluation.key))
      expect(out!.baselineMs).toBe(10_000)
      expect(record.bestMs).toBe(50_000)
    }
  })

  it('applying the same session twice does not double count', () => {
    const first = run(undefined, entry({ sessionId: 'a', elapsedMs: 50_000 })).record
    const again = run(first, entry({ sessionId: 'a', elapsedMs: 50_000 }))
    expect(again.record).toEqual(first)
  })
})

describe('appendSessionLog', () => {
  it('appends oldest-first and caps at SPEC_CONSTANTS.sessionLogMax', () => {
    const max = SPEC_CONSTANTS.sessionLogMax
    let log: SessionLogEntry[] = []
    for (let i = 0; i < max + 5; i++) log = appendSessionLog(log, entry({ sessionId: `s${i}` }))
    expect(log).toHaveLength(max)
    expect(log[0]!.sessionId).toBe('s5')
    expect(log[max - 1]!.sessionId).toBe(`s${max + 4}`)
  })

  it('does not mutate the input and replaces an entry with the same sessionId', () => {
    const log = [entry({ sessionId: 'a' }), entry({ sessionId: 'b' })]
    const out = appendSessionLog(log, entry({ sessionId: 'a', elapsedMs: 1 }))
    expect(log).toHaveLength(2)
    expect(out.map((e) => e.sessionId)).toEqual(['b', 'a'])
    expect(out[1]!.elapsedMs).toBe(1)
  })
})
