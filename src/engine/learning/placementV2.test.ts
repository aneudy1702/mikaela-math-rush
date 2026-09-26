import { describe, expect, it } from 'vitest'
import type {
  LearnerProfile,
  PlacementProbe,
  PlacementResult,
  RawAttempt,
  SessionRecord,
} from '../contracts'
import { RULES, levelIdOf, levelIndexOf } from '../contracts'
import { getCurriculum, getLevel, ownerLevelOf } from '../curriculum'
import { createEmptyProfile } from './selection'
import { emptyFactEvidence } from './advancement'
import {
  applyPlacementResult,
  applyStartLevelInference,
  dropDownOffer,
  inferStartLevel,
  nextProbe,
  placementRawAttempt,
  placementResult,
  recordProbe,
  startPlacement,
  type PlacementState,
} from './placement'

// ---- helpers ------------------------------------------------------------------------------

/** Deterministic LCG in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

interface Run {
  state: PlacementState
  result: PlacementResult
  probes: PlacementProbe[]
}

function runStaircase(
  answer: (probe: PlacementProbe, indexInLevel: number) => boolean,
  rng: () => number = seeded(7),
): Run {
  let state = startPlacement()
  const probes: PlacementProbe[] = []
  for (let guard = 0; guard < 100; guard++) {
    const probe = nextProbe(state, rng)
    if (!probe) break
    const inLevel = probes.filter((p) => p.levelId === probe.levelId).length
    probes.push(probe)
    state = recordProbe(state, probe, answer(probe, inLevel))
  }
  const result = placementResult(state)
  if (!result) throw new Error('staircase did not finish')
  return { state, result, probes }
}

/** Learner who knows exactly the facts owned by levels ≤ `upTo`. */
function knowsUpTo(upTo: number) {
  return (p: PlacementProbe) => levelIndexOf(ownerLevelOf(p.factId)!.id) <= upTo
}

const L = (i: number) => levelIdOf(i)

// ---- staircase ----------------------------------------------------------------------------

describe('placement staircase (D5)', () => {
  it('never asks more than 12 questions for any answer sequence (exhaustive)', () => {
    for (const seed of [1, 2, 3]) {
      let leaves = 0
      const explore = (state: PlacementState, rng: () => number) => {
        const probe = nextProbe(state, rng)
        if (!probe) {
          expect(state.finished).toBe(true)
          const r = placementResult(state)!
          expect(r.questionsAsked).toBeLessThanOrEqual(RULES.placementMaxQuestions)
          expect(r.questionsAsked).toBe(state.asked.length)
          leaves++
          return
        }
        expect(probe.questionNumber).toBeLessThanOrEqual(RULES.placementMaxQuestions)
        explore(recordProbe(state, probe, true), rng)
        explore(recordProbe(state, probe, false), rng)
      }
      explore(startPlacement(), seeded(seed))
      expect(leaves).toBeGreaterThan(100)
    }
  })

  it('worst case: a tiebreaker at every probe hits the cap at 12 → start = lowest level not passed', () => {
    // Every probe: hardest missed, second correct, tiebreaker correct → 1/2 then pass.
    const { result, probes } = runStaircase((_p, i) => i !== 0)
    expect(probes).toHaveLength(12)
    expect(probes.filter((p) => p.isTiebreaker)).toHaveLength(4)
    expect(result.hitQuestionCap).toBe(true)
    expect(result.probedLevelIds).toEqual([L(1), L(3), L(5), L(7)])
    expect(result.startLevelId).toBe(L(8))
    expect(result.passedLevelIds).toEqual([1, 2, 3, 4, 5, 6, 7].map(L))
  })

  it('cap during a back-probe: start = lowest level not passed', () => {
    // L1, L3, L5 pass with tiebreakers (9), L7 fails with a tiebreaker (12), back-probe L6 needs #13.
    const { result, probes } = runStaircase((p, i) =>
      p.levelId === L(7) ? i === 1 : i !== 0,
    )
    expect(probes).toHaveLength(12)
    expect(result.hitQuestionCap).toBe(true)
    expect(result.startLevelId).toBe(L(6))
  })

  it('beginner who misses L1 → at most 3 questions, start L1', () => {
    const allWrong = runStaircase(() => false)
    expect(allWrong.result.questionsAsked).toBeLessThanOrEqual(3)
    expect(allWrong.result.startLevelId).toBe(L(1))
    expect(allWrong.result.passedLevelIds).toEqual([])
    // 1/2 then a missed tiebreaker: exactly 3.
    const split = runStaircase((_p, i) => i === 1)
    expect(split.result.questionsAsked).toBe(3)
    expect(split.result.startLevelId).toBe(L(1))
  })

  it('knows L1–L3 → start L4 (L2 jumped and counted passed; L4 back-probed and failed)', () => {
    const { result, probes } = runStaircase(knowsUpTo(3))
    expect(probes.map((p) => p.levelId)).toEqual([L(1), L(1), L(3), L(3), L(5), L(5), L(4), L(4)])
    expect(result.startLevelId).toBe(L(4))
    expect(result.passedLevelIds).toEqual([L(1), L(2), L(3)])
    expect(result.probedLevelIds).toEqual([L(1), L(3), L(5), L(4)])
    expect(result.hitQuestionCap).toBe(false)
  })

  it('knows L1–L2 → L3 fails, back-probe L2 passes → start L3', () => {
    const { result, state } = runStaircase(knowsUpTo(2))
    expect(state.levelOutcomes).toEqual({ L1: 'pass', L3: 'fail', L2: 'pass' })
    expect(result.startLevelId).toBe(L(3))
    expect(result.passedLevelIds).toEqual([L(1), L(2)])
  })

  it('back-probe happens before any stop', () => {
    let state = startPlacement()
    const rng = seeded(3)
    const know = knowsUpTo(4)
    while (!state.levelOutcomes[L(5)]) {
      const p = nextProbe(state, rng)!
      state = recordProbe(state, p, know(p))
    }
    expect(state.levelOutcomes[L(5)]).toBe('fail')
    expect(state.finished).toBe(false)
    expect(placementResult(state)).toBeNull()
    const back = nextProbe(state, rng)!
    expect(back.levelId).toBe(L(4))
    const { result } = runStaircase(know)
    expect(result.startLevelId).toBe(L(5))
  })

  it('L8 pass → start L9; L8 fail after L7 pass → start L8 with no back-probe', () => {
    const all = runStaircase(() => true)
    expect(all.result.startLevelId).toBe(L(9))
    expect(all.result.questionsAsked).toBe(10)
    expect(all.result.passedLevelIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(L))
    const upTo7 = runStaircase(knowsUpTo(7))
    expect(upTo7.result.startLevelId).toBe(L(8))
    expect(upTo7.result.probedLevelIds).toEqual([L(1), L(3), L(5), L(7), L(8)])
  })

  it('probe = hardest gating fact + a random other; tiebreaker is a third distinct gating fact', () => {
    const { probes } = runStaircase((_p, i) => i !== 0, seeded(11))
    expect(probes[0]!.factId).toBe('2x10')
    const byLevel = new Map<string, PlacementProbe[]>()
    for (const p of probes) byLevel.set(p.levelId, [...(byLevel.get(p.levelId) ?? []), p])
    for (const [levelId, ps] of byLevel) {
      const gating = getLevel(levelId).gatingFactIds
      expect(new Set(ps.map((p) => p.factId)).size).toBe(ps.length)
      for (const p of ps) expect(gating).toContain(p.factId)
      expect(ps.map((p) => p.isTiebreaker)).toEqual([false, false, true].slice(0, ps.length))
    }
    expect(probes.map((p) => p.questionNumber)).toEqual(probes.map((_, i) => i + 1))
    expect(runStaircase(() => true).probes.find((p) => p.levelId === L(8))!.factId).toBe('9x9')
  })

  it('is deterministic given the RNG and never mutates its input state', () => {
    const a = runStaircase(knowsUpTo(5), seeded(42))
    const b = runStaircase(knowsUpTo(5), seeded(42))
    expect(a.probes).toEqual(b.probes)
    const s0 = startPlacement()
    const snapshot = JSON.stringify(s0)
    const p = nextProbe(s0, seeded(1))!
    recordProbe(s0, p, true)
    expect(JSON.stringify(s0)).toBe(snapshot)
    expect(() => recordProbe(s0, { ...p, levelId: L(3) }, true)).toThrow()
    expect(() => recordProbe(s0, { ...p, questionNumber: 2 }, true)).toThrow()
  })

  it('probed answers become raw attempts with source placement in a live session', () => {
    const probe = nextProbe(startPlacement(), seeded(1))!
    const raw = placementRawAttempt(
      probe,
      { correct: true, given: 20, latencyMs: 15_000, atMs: 1000 },
      'placement-1',
    )
    expect(raw).toMatchObject({
      factId: '2x10',
      source: 'placement',
      sessionInferred: false,
      sessionId: 'placement-1',
      levelId: L(1),
      correct: true,
    })
  })
})

describe('applyPlacementResult (D5)', () => {
  it('unlocks (never completes) passed levels, sets placementLikely correctly, grants nothing', () => {
    const { result, probes } = runStaircase(knowsUpTo(3))
    const profile = createEmptyProfile('T', 0)
    profile.progress.factEvidence['3x4'] = {
      ...emptyFactEvidence('3x4'),
      countedAttempts: 1,
      countedCorrect: 0,
    }
    const before = JSON.stringify(profile)
    const next = applyPlacementResult(profile, result, 5000)
    expect(JSON.stringify(profile)).toBe(before)

    expect(next.progress.currentLevelId).toBe(L(4))
    expect(next.progress.placementStartLevelId).toBe(L(4))
    expect(next.progress.unlockedLevelIds).toEqual([L(1), L(2), L(3), L(4)])
    expect(next.progress.completedLevelIds).toEqual([])
    expect(next.placementComplete).toBe(true)
    // No XP, badges, records or session log entries.
    expect(next.player).toEqual(profile.player)
    expect(next.records).toEqual({})
    expect(next.sessionLog).toEqual([])
    expect(next.gameXp).toBe(0)

    const likely = Object.values(next.progress.factEvidence)
      .filter((e) => e.placementLikely)
      .map((e) => e.factId)
      .sort()
    const asked = new Set(probes.map((p) => p.factId))
    const expected = new Set<string>()
    for (const i of [1, 2, 3]) {
      for (const f of getLevel(L(i)).gatingFactIds) if (!asked.has(f)) expected.add(f)
    }
    for (const lvl of getCurriculum().levels) for (const f of lvl.introFactIds) expected.add(f)
    expect(likely).toEqual([...expected].sort())
    expect(likely).toHaveLength(9 + 8 + 7 - 4 + 10)
    for (const f of asked) expect(likely).not.toContain(f)
    // Start-level facts and facts with real evidence are not flagged.
    expect(likely).not.toContain('3x4')
    expect(next.progress.factEvidence['3x4']!.placementLikely).toBe(false)
  })

  it('beginner result flags only intro facts and keeps L1', () => {
    const { result } = runStaircase(() => false)
    const next = applyPlacementResult(createEmptyProfile('T', 0), result, 1)
    expect(next.progress.currentLevelId).toBe(L(1))
    expect(next.progress.unlockedLevelIds).toEqual([L(1)])
    const likely = Object.values(next.progress.factEvidence).filter((e) => e.placementLikely)
    expect(likely.map((e) => e.factId).sort()).toEqual([...getLevel(L(1)).introFactIds].sort())
  })
})

// ---- D5b inference ---------------------------------------------------------------------

const DAY = 86_400_000
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime()

let seq = 0
function attempt(factId: string, correct: boolean, sessionId: string, atMs: number): RawAttempt {
  seq++
  return {
    factId,
    a: null,
    b: null,
    correct,
    given: null,
    latencyMs: 4000,
    atMs: atMs + seq,
    sessionId,
    sessionInferred: true,
    levelId: null,
    mode: null,
    source: 'draw',
    isReplay: false,
  }
}

/** `sessions` inferred sessions (default 2), `perSession` answers per fact each (all `correct`). */
function levelLog(
  levelIndex: number,
  opts: {
    correct?: boolean
    daysAgo?: number
    perSession?: number
    sessions?: number
    facts?: string[]
  } = {},
): RawAttempt[] {
  const { correct = true, daysAgo = 5, perSession = 2, sessions = 2 } = opts
  const facts = opts.facts ?? getLevel(L(levelIndex)).gatingFactIds
  const out: RawAttempt[] = []
  for (let si = 0; si < sessions; si++) {
    const offset = si
    const sid = `v1-inferred-L${levelIndex}-${daysAgo}-${si}`
    const t = NOW - (daysAgo + offset) * DAY
    for (const f of facts) for (let k = 0; k < perSession; k++) out.push(attempt(f, correct, sid, t))
  }
  return out
}

function profileWith(attempts: RawAttempt[]): LearnerProfile {
  const p = createEmptyProfile('Mikaela', 0)
  const sorted = [...attempts].sort((a, b) => a.atMs - b.atMs)
  return { ...p, rawLog: { attempts: sorted, sessions: [] } }
}

describe('inferStartLevel (D5b)', () => {
  it('recommends s = first level that does not pass (L1–L3 known → L4)', () => {
    const profile = profileWith([...levelLog(1), ...levelLog(2), ...levelLog(3)])
    const inf = inferStartLevel(profile, NOW)
    expect(inf.outcome).toBe('recommend')
    expect(inf.recommendedLevelId).toBe(L(4))
    expect(inf.verdicts.map((v) => v.passes)).toEqual([true, true, true, false, false, false, false, false])
    expect(inf.masteredFactIds).toHaveLength(9 + 8 + 7)
    expect(inf.attemptsConsidered).toBe(profile.rawLog.attempts.length)
  })

  it('recommends L9 when L1–L8 all pass', () => {
    const logs = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => levelLog(i))
    const inf = inferStartLevel(profileWith(logs), NOW)
    expect(inf).toMatchObject({ outcome: 'recommend', recommendedLevelId: L(9) })
  })

  it('insufficient: L1 not evidenced', () => {
    expect(inferStartLevel(profileWith([]), NOW).outcome).toBe('insufficient')
    const inf = inferStartLevel(profileWith([...levelLog(2), ...levelLog(3)]), NOW)
    expect(inf.outcome).toBe('insufficient')
    expect(inf.verdicts[0]!.evidenced).toBe(false)
    expect(inf.recommendedLevelId).toBeNull()
  })

  it('insufficient: s not evidenced while a later level passes', () => {
    const inf = inferStartLevel(profileWith([...levelLog(1), ...levelLog(3)]), NOW)
    expect(inf.verdicts[1]).toMatchObject({ levelId: L(2), evidenced: false, passes: false })
    expect(inf.verdicts[2]!.passes).toBe(true)
    expect(inf.outcome).toBe('insufficient')
  })

  it('contradictory: s clearly fails while a later level passes', () => {
    const logs = [...levelLog(1), ...levelLog(2, { correct: false, perSession: 1, sessions: 3 }), ...levelLog(3)]
    const inf = inferStartLevel(profileWith(logs), NOW)
    expect(inf.verdicts[1]).toMatchObject({ evidenced: true, passes: false, clearlyFails: true })
    expect(inf.outcome).toBe('contradictory')
    expect(inf.recommendedLevelId).toBeNull()
  })

  it('clearly fails by accuracy < 70% over ≥ 10 counted attempts (no struggling facts)', () => {
    const l2 = getLevel(L(2)).gatingFactIds
    const mixed: RawAttempt[] = []
    ;[true, true, false, false].forEach((correct, si) => {
      for (const f of l2) mixed.push(attempt(f, correct, `mix-${si}`, NOW - (10 - si) * DAY))
    })
    const inf = inferStartLevel(profileWith([...levelLog(1), ...mixed, ...levelLog(3)]), NOW)
    expect(inf.verdicts[1]).toMatchObject({ evidenced: true, passes: false, clearlyFails: true })
    expect(inf.outcome).toBe('contradictory')
  })

  it('s clearly failing with no later pass still recommends s', () => {
    const inf = inferStartLevel(profileWith([...levelLog(1), ...levelLog(2, { correct: false, perSession: 1, sessions: 3 })]), NOW)
    expect(inf).toMatchObject({ outcome: 'recommend', recommendedLevelId: L(2) })
  })

  it('30-day cutoff: stale attempts are ignored', () => {
    const stale = inferStartLevel(profileWith(levelLog(1, { daysAgo: 31 })), NOW)
    expect(stale.outcome).toBe('insufficient')
    expect(stale.attemptsConsidered).toBe(0)
    const fresh = inferStartLevel(profileWith(levelLog(1, { daysAgo: 28 })), NOW)
    expect(fresh).toMatchObject({ outcome: 'recommend', recommendedLevelId: L(2) })
  })

  it('3-fact level: evidenced when n − a = 2 of 3 gating facts have ≥ 3 counted attempts', () => {
    const below = [1, 2, 3, 4, 5, 6].flatMap((i) => levelLog(i))
    const [f1, f2] = getLevel(L(7)).gatingFactIds
    // 2 of 3 facts, 3 counted attempts each over three sessions (mastered by rule (b)).
    const two = levelLog(7, { facts: [f1!, f2!], perSession: 1, sessions: 3 })
    expect(two.filter((a) => a.factId === f1)).toHaveLength(3)
    const ok = inferStartLevel(profileWith([...below, ...two]), NOW)
    expect(ok.verdicts[6]).toMatchObject({ levelId: L(7), evidenced: true, passes: true })
    expect(ok).toMatchObject({ outcome: 'recommend', recommendedLevelId: L(8) })

    // Only 1 of 3 facts with ≥ 3 attempts → not evidenced → s = L7.
    const one = [...levelLog(7, { facts: [f1!] }), ...levelLog(7, { facts: [f2!], perSession: 1 })]
    const weak = inferStartLevel(profileWith([...below, ...one]), NOW)
    expect(weak.verdicts[6]).toMatchObject({ evidenced: false, passes: false })
    expect(weak).toMatchObject({ outcome: 'recommend', recommendedLevelId: L(7) })
  })

  it('evidenceStaleWithDamagedLog → insufficient', () => {
    const profile = profileWith([...levelLog(1), ...levelLog(2)])
    expect(inferStartLevel(profile, NOW).outcome).toBe('recommend')
    const inf = inferStartLevel(profile, NOW, {
      quarantine: { evidenceStaleWithDamagedLog: true },
    })
    expect(inf.outcome).toBe('insufficient')
    expect(inf.masteredFactIds).toEqual([])
  })

  it('does not mutate the profile', () => {
    const profile = profileWith([...levelLog(1)])
    const before = JSON.stringify(profile)
    inferStartLevel(profile, NOW)
    expect(JSON.stringify(profile)).toBe(before)
  })
})

describe('applyStartLevelInference (D5b)', () => {
  it('only unlocks L1..s, sets current and everMastered silently, awards nothing', () => {
    const profile = profileWith([...levelLog(1), ...levelLog(2), ...levelLog(3)])
    profile.player = { ...profile.player, xp: 42 }
    const inf = inferStartLevel(profile, NOW)
    const next = applyStartLevelInference(profile, inf)
    expect(next.progress.currentLevelId).toBe(L(4))
    expect(next.progress.inferredStartLevelId).toBe(L(4))
    expect(next.progress.unlockedLevelIds).toEqual([L(1), L(2), L(3), L(4)])
    expect(next.progress.completedLevelIds).toEqual([])
    expect(next.player).toEqual(profile.player)
    expect(next.records).toEqual(profile.records)
    expect(next.sessionLog).toEqual(profile.sessionLog)
    expect(next.rawLog).toBe(profile.rawLog)
    for (const f of inf.masteredFactIds) {
      expect(next.progress.factEvidence[f]!.everMastered).toBe(true)
    }
    expect(profile.progress.currentLevelId).toBe(L(1))
    expect(Object.keys(profile.progress.factEvidence)).toHaveLength(0)
  })

  it('is a no-op for insufficient / contradictory', () => {
    const profile = profileWith([])
    const inf = inferStartLevel(profile, NOW)
    expect(applyStartLevelInference(profile, inf)).toBe(profile)
  })
})

// ---- D4 drop-down offer ------------------------------------------------------------------

function session(id: string, levelId: string, startedAtMs: number): SessionRecord {
  return {
    id,
    kind: 'play',
    startedAtMs,
    endedAtMs: startedAtMs + 60_000,
    mode: 'quick',
    levelId,
    inferred: false,
    endReason: 'finished',
    isReplay: false,
    pauses: [],
    discardedOnHide: [],
  }
}

function playedAt(start: string, perSession: [number, number][]): LearnerProfile {
  const p = createEmptyProfile('T', 0)
  const sessions: SessionRecord[] = []
  const attempts: RawAttempt[] = []
  const facts = getLevel(start).tableFactIds
  perSession.forEach(([correct, total], si) => {
    const id = `s${si}`
    sessions.push(session(id, start, NOW + si * DAY))
    for (let k = 0; k < total; k++) {
      attempts.push({
        ...attempt(facts[k % facts.length]!, k < correct, id, NOW + si * DAY),
        sessionInferred: false,
        levelId: start,
        mode: 'quick',
      })
    }
  })
  return {
    ...p,
    rawLog: { attempts, sessions },
    progress: {
      ...p.progress,
      currentLevelId: start,
      unlockedLevelIds: [1, 2, 3, 4].slice(0, levelIndexOf(start)).map(L),
      placementStartLevelId: start,
    },
  }
}

describe('dropDownOffer (D4)', () => {
  it('offers the level below when the first 2 sessions are below 70%', () => {
    const profile = playedAt(L(4), [[6, 10], [7, 10]])
    const before = JSON.stringify(profile)
    const offer = dropDownOffer(profile)
    expect(offer).toMatchObject({ offer: true, fromLevelId: L(4), toLevelId: L(3), sessions: 2 })
    expect(offer.accuracy).toBeCloseTo(0.65)
    // Only an offer: nothing is changed.
    expect(JSON.stringify(profile)).toBe(before)
  })

  it('no offer at ≥ 70%, before 2 sessions, or once the kid has left the start level', () => {
    expect(dropDownOffer(playedAt(L(4), [[7, 10], [7, 10]])).offer).toBe(false)
    expect(dropDownOffer(playedAt(L(4), [[2, 10]])).offer).toBe(false)
    const moved = playedAt(L(4), [[2, 10], [2, 10]])
    moved.progress.currentLevelId = L(3)
    expect(dropDownOffer(moved).offer).toBe(false)
  })

  it('uses only the first 2 sessions', () => {
    expect(dropDownOffer(playedAt(L(4), [[2, 10], [2, 10], [10, 10]])).offer).toBe(true)
  })

  it('never at L1, and never without a placement/inference start', () => {
    expect(dropDownOffer(playedAt(L(1), [[0, 10], [0, 10]])).offer).toBe(false)
    const none = playedAt(L(4), [[0, 10], [0, 10]])
    delete none.progress.placementStartLevelId
    expect(dropDownOffer(none).offer).toBe(false)
    const inferred = playedAt(L(4), [[0, 10], [0, 10]])
    delete inferred.progress.placementStartLevelId
    inferred.progress.inferredStartLevelId = L(4)
    expect(dropDownOffer(inferred).offer).toBe(true)
  })
})
