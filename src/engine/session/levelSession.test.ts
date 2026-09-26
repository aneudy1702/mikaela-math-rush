import { describe, expect, it } from 'vitest'
import type {
  EvidenceBufferEntry,
  FactEvidence,
  LearnerProfile,
  LevelId,
  PendingReinforcement,
  RawAttempt,
  SessionMode,
  SessionRecord,
  SessionResultSummaryV2,
} from '../contracts'
import { RULES, SESSION_LENGTHS, isCanonicalFactId } from '../contracts'
import { createMultiplicationSkill } from '../content/multiplication'
import { getCurriculum, getLevel, reviewFactIds } from '../curriculum'
import {
  applyAttemptToEvidence,
  countedFlags,
  emptyFactEvidence,
  evaluateLevelCompletion,
  factStatus,
  rebuildEvidence,
} from '../learning/advancement'
import { createEmptyProfile } from '../learning/selection'
import type { LevelPick } from '../orchestrator'
import { seeded } from '../orchestrator/levelSelection.testkit'
import { levelForXp, xpForSession } from '../progression'
import {
  LevelSessionEngine,
  SAVE_EVERY_ANSWERS,
  canStartLevel,
  settleFinishedSession,
  type LevelSessionOptions,
  type SessionQuestionSource,
} from './levelSession'

const DAY = 86_400_000
const T0 = new Date(2026, 0, 5, 12, 0, 0).getTime()
const ALL_IDS = getCurriculum().levels[8]!.tableFactIds

interface Clock {
  t: number
}

interface Shown {
  factId: string
  source: LevelPick['source']
  correct: boolean
  counted: boolean
  latencyMs: number
  a: number | null
  b: number | null
  status: string
}

interface PlayOpts {
  levelId?: LevelId
  mode?: SessionMode
  day: number
  seed: number
  /** Correctness of the i-th answer of this session. */
  answer?: (factId: string, i: number, source: LevelPick['source']) => boolean
  latency?: (factId: string, i: number) => number
  sessionId?: string
  overheadMs?: number
  questionSource?: LevelSessionOptions['questionSource']
  load?: LevelSessionOptions['load']
}


function makeEngine(profile: LearnerProfile, clock: Clock, o: PlayOpts): LevelSessionEngine {
  return new LevelSessionEngine({
    profile,
    skill: createMultiplicationSkill(seeded(o.seed + 11)),
    mode: o.mode ?? 'quick',
    levelId: o.levelId ?? profile.progress.currentLevelId,
    clock: () => clock.t,
    rngs: { main: seeded(o.seed), fluency: seeded(o.seed ^ 0x5bd1e995) },
    sessionId: o.sessionId ?? `sess-${o.day}-${o.seed}`,
    questionSource: o.questionSource,
    load: o.load,
  })
}

/** Play one complete session; returns the new profile, the summary and what was shown. */
function play(profile: LearnerProfile, o: PlayOpts) {
  const clock: Clock = { t: T0 + o.day * DAY }
  const engine = makeEngine(profile, clock, o)
  const shown: Shown[] = []
  let i = 0
  while (!engine.isComplete()) {
    const q = engine.nextQuestion()!
    const correct = o.answer ? o.answer(q.factId, i, q.source) : true
    clock.t += o.latency ? o.latency(q.factId, i) : 2000
    const expected = Number(q.question.correctAnswer)
    const out = engine.answer(q.question.id, correct ? expected : expected + 1)
    shown.push({
      factId: q.factId,
      source: q.source,
      correct,
      counted: out.counted,
      latencyMs: out.attempt.latencyMs,
      a: out.attempt.a,
      b: out.attempt.b,
      status: out.statusAfter,
    })
    clock.t += o.overheadMs ?? 1500
    i++
  }
  const summary = engine.finish()
  return { engine, summary, profile: engine.getProfile(), shown }
}

function kid(p: number, seed: number) {
  const u = seeded(seed)
  return () => u() < p
}

function liveAttempt(factId: string, correct: boolean, sessionId: string, atMs: number): RawAttempt {
  return {
    factId,
    a: null,
    b: null,
    correct,
    given: null,
    latencyMs: 2000,
    atMs,
    sessionId,
    sessionInferred: false,
    levelId: null,
    mode: null,
    source: 'draw',
    isReplay: false,
  }
}

function masteredEvidence(factId: string): FactEvidence {
  let ev = emptyFactEvidence(factId)
  ev = applyAttemptToEvidence(ev, liveAttempt(factId, true, 'prep-1', 1), true)
  ev = applyAttemptToEvidence(ev, liveAttempt(factId, true, 'prep-2', 2), true)
  expect(factStatus(ev)).toBe('mastered')
  return ev
}

function buffer(n: number, sessions: string[], days: string[]): EvidenceBufferEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    factId: ALL_IDS[i % ALL_IDS.length]!,
    correct: true,
    sessionId: sessions[i % sessions.length]!,
    dayKey: days[i % days.length]!,
  }))
}

describe('LevelSessionEngine — start guards', () => {
  it('refuses locked levels and the deferred L10; canStartLevel agrees', () => {
    const profile = createEmptyProfile('K', T0)
    const clock = { t: T0 }
    expect(() => makeEngine(profile, clock, { levelId: 'L3', day: 0, seed: 1 })).toThrow(/not unlocked/)
    const all = { ...profile, progress: { ...profile.progress, unlockedLevelIds: getCurriculum().levels.map((l) => l.id) } }
    expect(() => makeEngine(all, clock, { levelId: 'L10', day: 0, seed: 1 })).toThrow(/deferred/)
    expect(canStartLevel(all, 'L10')).toBe(false)
    expect(canStartLevel(all, 'L9')).toBe(true)
    expect(canStartLevel(profile, 'L2')).toBe(false)
    expect(canStartLevel(profile, 'L1')).toBe(true)
    expect(canStartLevel(profile, 'L99')).toBe(false)
  })

  it('never mutates the caller profile and creates a live play SessionRecord', () => {
    const profile = createEmptyProfile('K', T0)
    const before = structuredClone(profile)
    const { profile: after } = play(profile, { day: 1, seed: 3, sessionId: 'abc' })
    expect(profile).toEqual(before)
    const rec = after.rawLog.sessions.find((s) => s.id === 'abc')!
    expect(rec).toMatchObject({ kind: 'play', inferred: false, mode: 'quick', levelId: 'L1', endReason: 'finished', isReplay: false })
  })
})

describe('LevelSessionEngine — end-to-end (acceptance)', () => {
  it('a 90%-accurate kid playing Quick from a fresh profile completes L1 by the D2 rules, seeing only L1 (+ review) facts', () => {
    let profile = createEmptyProfile('K', T0)
    const answer = kid(0.9, 2024)
    const allowed = new Set([...getLevel('L1').tableFactIds, ...reviewFactIds('L1')])
    let completedAt = 0
    let last: SessionResultSummaryV2 | null = null
    let xpTotal = 0
    for (let s = 1; s <= 20 && !completedAt; s++) {
      const r = play(profile, { day: s, seed: 100 + s, answer: () => answer() })
      profile = r.profile
      last = r.summary
      xpTotal += r.summary.xp.total
      expect(r.summary.xpAfter).toBe(xpTotal)
      for (const x of r.shown) expect(allowed.has(x.factId)).toBe(true)
      // Completion is exactly the D2 rule evaluated on the evidence view.
      const checks = evaluateLevelCompletion(getLevel('L1'), profile.progress, ALL_IDS)
      if (r.summary.advancement.newlyCompleted) {
        expect(checks.pass).toBe(true)
        completedAt = s
      } else {
        // Before completion, current stays L1 and nothing else unlocks.
        expect(profile.progress.unlockedLevelIds).toEqual(['L1'])
      }
    }
    // SIM-REPORT rev-4: static p = 0.90 Quick L1 median 6 / p90 8 sessions.
    expect(completedAt).toBeGreaterThanOrEqual(RULES.minSessionsAtLevel)
    expect(completedAt).toBeLessThanOrEqual(12)
    const checks = last!.advancement.checks
    expect(checks.kind).toBe('table')
    if (checks.kind === 'table') {
      expect([checks.r1.pass, checks.r2.pass, checks.r3.pass, checks.r4.pass, checks.r5.pass]).toEqual([true, true, true, true, true])
      expect(checks.r5.sessions).toBe(completedAt)
    }
    // D4 level-up.
    expect(profile.progress.completedLevelIds).toEqual(['L1'])
    expect(profile.progress.unlockedLevelIds).toEqual(['L1', 'L2'])
    expect(profile.progress.currentLevelId).toBe('L2')
    expect(last!.advancement.unlockedLevelId).toBe('L2')
    expect(last!.events.some((e) => e.type === 'level-completed')).toBe(true)
    expect(last!.xp.levelCompleted).toBe(RULES.xp.levelCompleted)
    expect(last!.badgesEarned.some((b) => b.badgeId === 'level-mastered' && b.levelId === 'L1')).toBe(true)
    // XP lives in player.xp only; the deprecated gameXp is never written by the V2 engine.
    expect(profile.gameXp).toBe(0)
    expect(profile.player.xp).toBe(xpTotal)
    expect(profile.player.level).toBe(levelForXp(profile.player.xp))

    // Next session at L2 sees only L2 table + L1-owned review facts.
    const allowedL2 = new Set([...getLevel('L2').tableFactIds, ...reviewFactIds('L2')])
    for (let s = 0; s < 3; s++) {
      const r = play(profile, { day: 30 + s, seed: 900 + s, answer: () => answer() })
      profile = r.profile
      for (const x of r.shown) expect(allowedL2.has(x.factId)).toBe(true)
    }
  })
})

describe('LevelSessionEngine — raw log, evidence, buffers (D11, D2)', () => {
  it('logs every D11 field, updates evidence per answer and buffers counted draws only', () => {
    let profile = createEmptyProfile('K', T0)
    const answer = kid(0.75, 77)
    for (let s = 1; s <= 3; s++) {
      const clock: Clock = { t: T0 + s * DAY }
      const engine = makeEngine(profile, clock, { day: s, seed: 40 + s, sessionId: `S${s}` })
      let i = 0
      while (!engine.isComplete()) {
        const q = engine.nextQuestion()!
        const shownAt = clock.t
        clock.t += 1000 + 137 * i
        const correct = answer()
        const expected = Number(q.question.correctAnswer)
        const out = engine.answer(q.question.id, correct ? expected : expected + 3)
        const x = out.attempt
        expect(isCanonicalFactId(x.factId)).toBe(true)
        expect(x.factId).toBe(q.factId)
        expect([x.a, x.b]).toEqual([q.question.metadata?.a, q.question.metadata?.b])
        expect(x.given).toBe(correct ? expected : expected + 3)
        expect(x.correct).toBe(correct)
        expect(x.latencyMs).toBe(clock.t - shownAt)
        expect(x.atMs).toBe(clock.t)
        expect(x).toMatchObject({ sessionId: `S${s}`, sessionInferred: false, levelId: 'L1', mode: 'quick', source: q.source, isReplay: false })
        // Evidence as of this answer = pure rebuild of the raw log so far (live == recomputed).
        const live = engine.getProfile()
        const rebuilt = rebuildEvidence(live.rawLog, { ...live.progress, factEvidence: {}, evidence: {} })
        expect(live.progress.factEvidence).toEqual(rebuilt.factEvidence)
        expect(live.progress.evidence).toEqual(rebuilt.evidence)
        expect(out.counted).toBe(countedFlags(live.rawLog.attempts).at(-1))
        clock.t += 1500
        i++
      }
      engine.finish()
      profile = engine.getProfile()
    }
    const attempts = profile.rawLog.attempts
    const flags = countedFlags(attempts)
    const countedDraws = attempts.filter((x, i) => flags[i] && x.source === 'draw')
    expect(profile.progress.evidence['L1']!.length).toBe(countedDraws.length)
    expect(attempts.length).toBe(3 * SESSION_LENGTHS.quick)
    expect(attempts.some((_x, i) => !flags[i])).toBe(true) // the scenario exercises the miss rule
  })

  it('same-session miss rule is applied live; carried-over items count again next session', () => {
    let profile = createEmptyProfile('K', T0)
    const missedOnce = new Set<string>()
    // Miss every fact the first time it is ever shown, then always answer correctly.
    const answer = (f: string) => {
      if (missedOnce.has(f)) return true
      missedOnce.add(f)
      return false
    }
    const r1 = play(profile, { day: 1, seed: 5, answer })
    profile = r1.profile
    const seenCounted = new Map<string, boolean>()
    for (const x of r1.shown) {
      const earlierMiss = seenCounted.has(x.factId)
      expect(x.counted).toBe(!earlierMiss)
      if (!x.correct) seenCounted.set(x.factId, true)
    }
    expect(r1.shown.some((x) => !x.counted && x.source !== 'draw')).toBe(true) // reintroduce after a miss: not counted
    const buf = profile.progress.evidence['L1'] ?? []
    // Only counted draws in the buffer, and every one of them was a first-time miss.
    expect(buf.length).toBe(r1.shown.filter((x) => x.counted && x.source === 'draw').length)
    expect(buf.every((e) => !e.correct)).toBe(true)
    // The carried queue survives into the next session, where those facts count again.
    expect(profile.pendingReinforcements.length).toBeGreaterThan(0)
    const r2 = play(profile, { day: 2, seed: 6, answer })
    expect(r2.shown.filter((x) => missedOnce.has(x.factId) && x.correct).every((x) => x.counted)).toBe(true)
    expect(r2.summary.events.some((e) => e.type === 'fact-comeback')).toBe(true)
  })
})

describe('LevelSessionEngine — records (D3)', () => {
  it('baseline, then new record (strict), ineligible below 90%, idempotent settlement', () => {
    let profile = createEmptyProfile('K', T0)
    const r1 = play(profile, { day: 1, seed: 1, latency: () => 3000 })
    profile = r1.profile
    expect(r1.summary.record).toMatchObject({ eligible: true, isBaseline: true, isNewRecord: false, previousBestMs: null })
    expect(r1.summary.events.some((e) => e.type === 'baseline-set')).toBe(true)
    expect(r1.summary.xp.recordBeaten).toBe(0)
    expect(r1.summary.recordVisible).toBe(false)
    const base = r1.summary.elapsedMs
    expect(base).toBe(SESSION_LENGTHS.quick * (3000 + 1500))

    // Equal time is not a new record (strict less-than).
    const r2 = play(profile, { day: 2, seed: 2, latency: () => 3000 })
    profile = r2.profile
    expect(r2.summary.record).toMatchObject({ eligible: true, isBaseline: false, isNewRecord: false, previousBestMs: base })

    const r3 = play(profile, { day: 3, seed: 3, latency: () => 2000 })
    profile = r3.profile
    expect(r3.summary.record).toMatchObject({ eligible: true, isNewRecord: true, previousBestMs: base })
    expect(r3.summary.xp.recordBeaten).toBe(RULES.xp.recordBeaten)
    expect(profile.player.recordsBeaten).toBe(1)
    expect(profile.player.lastRecordXpDayKey).toBe(profile.sessionLog.at(-1)!.dayKey)

    // Two misses on the first two draws: < 90% of draw answers → ineligible even when faster.
    const r4 = play(profile, { day: 4, seed: 4, latency: () => 500, answer: (_f, i) => i >= 2 })
    profile = r4.profile
    expect(r4.summary.drawCorrect / r4.summary.drawAnswers).toBeLessThan(0.9)
    expect(r4.summary.record).toMatchObject({ eligible: false, isBaseline: false, isNewRecord: false })
    const key = Object.keys(profile.records)
    expect(key).toHaveLength(1)
    expect(profile.records[key[0]!]!).toMatchObject({ baselineMs: base, bestMs: r3.summary.elapsedMs, eligibleRuns: 3, timesBeaten: 1 })

    // Same session applied twice → no double count.
    const snapshot = structuredClone(profile)
    expect(r4.engine.finish()).toBe(r4.summary)
    expect(r4.engine.getProfile()).toEqual(snapshot)
    const again = settleFinishedSession(profile, {
      sessionId: r4.summary.sessionId,
      skillId: 'multiplication',
      level: getLevel('L1'),
      curriculum: getCurriculum(),
      before: profile.progress,
      longestStreak: 10,
      pendingAfter: [],
    })
    expect(again).toBeNull()
    expect(profile).toEqual(snapshot)
  })

  it('records are keyed by level + mode: a practice run sets its own baseline', () => {
    let profile = createEmptyProfile('K', T0)
    profile = play(profile, { day: 1, seed: 1 }).profile
    const r = play(profile, { day: 2, seed: 2, mode: 'practice' })
    expect(r.summary.record.isBaseline).toBe(true)
    expect(Object.keys(r.profile.records).sort()).toEqual(['multiplication|L1|practice|v1', 'multiplication|L1|quick|v1'])
  })
})

describe('LevelSessionEngine — XP and badges (D6)', () => {
  it('first perfect Quick session: XP and badges exactly per T3', () => {
    const profile = createEmptyProfile('K', T0)
    const r = play(profile, { day: 1, seed: 9 })
    const s = r.summary
    const entry = r.profile.sessionLog.at(-1)!
    expect(s.xp).toEqual(
      xpForSession(entry, {
        levelCompletedBefore: false,
        isProgressLevel: true,
        firstFinishLevelMode: true,
        newlyMasteredFacts: 0,
        levelCompletedNow: false,
        recordBeaten: false,
        recordXpAvailableToday: true,
      }),
    )
    expect(s.xp).toMatchObject({ perCorrect: 10, completionBonus: 10, perfectBonus: 5, total: 25 })
    expect(s.xpBefore).toBe(0)
    expect(s.xpAfter).toBe(25)
    expect(r.profile.player.xp).toBe(25)
    expect(s.playerLevelBefore).toBe(1)
    expect(s.playerLevelAfter).toBe(1)
    expect(s.badgesEarned.map((b) => b.badgeId).sort()).toEqual(['first-run', 'hot-streak', 'perfect-session'])
    expect(r.profile.player.badges).toHaveLength(3)
    expect(r.profile.player.finishedLevelModes).toEqual(['L1:quick'])
    expect(r.profile.dailyStreak).toBe(1)
    expect(s.marks.advanced).toBe(true)
    expect(s.marks.before).toBe(0)
    // Badges never repeat.
    const r2 = play(r.profile, { day: 2, seed: 10 })
    expect(r2.summary.badgesEarned.map((b) => b.badgeId)).not.toContain('first-run')
    expect(r2.profile.dailyStreak).toBe(2)
  })

  it('replay rates on a completed level; isReplay on the session, attempts and summary', () => {
    let profile = createEmptyProfile('K', T0)
    let day = 0
    while (!profile.progress.completedLevelIds.includes('L1')) {
      day++
      profile = play(profile, { day, seed: day }).profile
      expect(day).toBeLessThan(15)
    }
    const r = play(profile, { day: day + 1, seed: 500, levelId: 'L1', answer: (_f, i) => i !== 3 })
    const s = r.summary
    expect(s.isReplay).toBe(true)
    expect(s.recordVisible).toBe(true)
    expect(r.profile.rawLog.attempts.filter((x) => x.sessionId === s.sessionId).every((x) => x.isReplay)).toBe(true)
    expect(r.profile.rawLog.sessions.at(-1)!.isReplay).toBe(true)
    expect(s.xp.perCorrect).toBe(Math.floor(s.correct / RULES.xp.completedLevelCorrectPerXp))
    // L1:quick already finished → replay bonus 10 × 0.2 = 2, no perfect bonus (one miss).
    expect(s.xp.completionBonus).toBe(2)
    expect(s.xp.levelCompleted).toBe(0)
    // Current level is untouched by a replay.
    expect(r.profile.progress.currentLevelId).toBe('L2')
    // A first Practice finish on the completed level pays the full bonus.
    const p = play(r.profile, { day: day + 2, seed: 501, levelId: 'L1', mode: 'practice' })
    expect(p.summary.xp.completionBonus).toBe(RULES.xp.completionBonus.practice)
    expect(p.summary.xp.perfectBonus).toBe(Math.floor(RULES.xp.completionBonus.practice * RULES.xp.perfectBonusFraction))
  })
})

describe('LevelSessionEngine — only finished play sessions earn', () => {
  const settleInput = (sessionId: string, profile: LearnerProfile) => ({
    sessionId,
    skillId: 'multiplication',
    level: getLevel('L1'),
    curriculum: getCurriculum(),
    before: profile.progress,
    longestStreak: 5,
    pendingAfter: [] as PendingReinforcement[],
  })
  const record = (id: string, patch: Partial<SessionRecord>): SessionRecord => ({
    id,
    kind: 'play',
    startedAtMs: T0,
    endedAtMs: T0 + 60_000,
    mode: 'quick',
    levelId: 'L1',
    inferred: false,
    endReason: 'finished',
    isReplay: false,
    pauses: [],
    discardedOnHide: [],
    ...patch,
  })

  it('placement, inferred and abandoned sessions never earn anything', () => {
    for (const [id, patch] of [
      ['placement-1', { kind: 'placement' }],
      ['v1-inferred-1', { inferred: true, endReason: 'inferred', mode: null, levelId: null }],
      ['abandoned-1', { endReason: 'abandoned' }],
    ] as [string, Partial<SessionRecord>][]) {
      const profile = createEmptyProfile('K', T0)
      profile.rawLog.sessions.push(record(id, patch))
      for (let i = 0; i < 10; i++) {
        profile.rawLog.attempts.push({ ...liveAttempt('2x3', true, id, T0 + i), levelId: 'L1', mode: 'quick', source: patch.kind === 'placement' ? 'placement' : 'draw' })
      }
      const snap = structuredClone(profile)
      expect(settleFinishedSession(profile, settleInput(id, profile))).toBeNull()
      expect(profile).toEqual(snap)
    }
  })

  it('abandon: attempts logged and evidence updated, nothing earned, R5 not counted, queue carried', () => {
    const profile = createEmptyProfile('K', T0)
    const clock: Clock = { t: T0 + DAY }
    const engine = makeEngine(profile, clock, { day: 1, seed: 8, sessionId: 'ab' })
    for (let i = 0; i < 4; i++) {
      const q = engine.nextQuestion()!
      clock.t += 2000
      engine.answer(q.question.id, i === 0 ? -1 : q.question.correctAnswer)
    }
    engine.nextQuestion() // on screen when leaving
    const res = engine.abandon()
    expect(res.answered).toBe(4)
    expect(engine.abandon()).toBe(res)
    expect(() => engine.finish()).toThrow()
    const p = engine.getProfile()
    expect(p.rawLog.attempts.filter((x) => x.sessionId === 'ab')).toHaveLength(4)
    expect(p.rawLog.sessions.find((s) => s.id === 'ab')!.endReason).toBe('abandoned')
    expect(Object.keys(p.progress.factEvidence).length).toBeGreaterThan(0)
    expect(p.sessionLog).toEqual([])
    expect(p.records).toEqual({})
    expect(p.player).toEqual(profile.player)
    expect(p.progress.finishedSessionsByLevel).toEqual({})
    expect(p.dailyStreak).toBe(0)
    expect(p.pendingReinforcements.some((x) => x.kind === 'reintroduce')).toBe(true)
  })

  it('a crash after a mid-session save leaves an open session that the next start closes as abandoned', () => {
    const profile = createEmptyProfile('K', T0)
    const clock: Clock = { t: T0 + DAY }
    const engine = makeEngine(profile, clock, { day: 1, seed: 8, sessionId: 'crash' })
    for (let i = 0; i < SAVE_EVERY_ANSWERS; i++) {
      const q = engine.nextQuestion()!
      clock.t += 1000
      const out = engine.answer(q.question.id, q.question.correctAnswer)
      expect(out.saveRecommended).toBe(false) // Quick = 10 answers: only the session end saves
    }
    const saved = structuredClone(engine.checkpoint())
    expect(saved.rawLog.sessions.find((s) => s.id === 'crash')!.endReason).toBeNull()
    const next = makeEngine(saved, { t: T0 + 2 * DAY }, { day: 2, seed: 9, sessionId: 'after' })
    expect(next.startInfo.closedDanglingSessions).toBe(1)
    const closed = next.getProfile().rawLog.sessions.find((s) => s.id === 'crash')!
    expect(closed.endReason).toBe('abandoned')
    expect(closed.endedAtMs).toBe(Math.max(...saved.rawLog.attempts.map((x) => x.atMs)))
  })

  it('practice: save recommended every SAVE_EVERY_ANSWERS answers', () => {
    const clock: Clock = { t: T0 + DAY }
    const engine = makeEngine(createEmptyProfile('K', T0), clock, { day: 1, seed: 8, mode: 'practice' })
    const saves: number[] = []
    while (!engine.isComplete()) {
      const q = engine.nextQuestion()!
      clock.t += 1000
      if (engine.answer(q.question.id, q.question.correctAnswer).saveRecommended) saves.push(engine.snapshot().answered)
    }
    expect(saves).toEqual([10, 20])
  })
})

describe('LevelSessionEngine — visibility (D3)', () => {
  it('hide pauses the clock and discards the on-screen question (restored to the queue); resume draws fresh', () => {
    const profile = createEmptyProfile('K', T0)
    profile.pendingReinforcements = [{ factId: '2x7', kind: 'reintroduce', dueInQuestions: 0 }]
    const clock: Clock = { t: T0 + DAY }
    const engine = makeEngine(profile, clock, { day: 1, seed: 21, sessionId: 'vis' })
    const q1 = engine.nextQuestion()!
    expect(q1).toMatchObject({ factId: '2x7', source: 'reintroduce' })
    clock.t += 1500
    expect(engine.hide()).toEqual({ discarded: true })
    expect(engine.hide()).toEqual({ discarded: false })
    expect(engine.isHidden()).toBe(true)
    expect(engine.nextQuestion()).toBeNull()
    // Checkpoint while hidden: the discarded queue item is back in the carried queue.
    const saved = engine.checkpoint()
    expect(saved.pendingReinforcements).toEqual([{ factId: '2x7', kind: 'reintroduce', dueInQuestions: 0 }])
    expect(saved.rawLog.attempts).toHaveLength(0)
    const rec = saved.rawLog.sessions.find((s) => s.id === 'vis')!
    expect(rec.discardedOnHide).toEqual([{ factId: '2x7', shownAtMs: T0 + DAY, discardedAtMs: T0 + DAY + 1500 }])
    expect(rec.pauses).toEqual([{ startedAtMs: T0 + DAY + 1500, endedAtMs: null }])
    const pausedMs = 10 * 60_000
    clock.t += pausedMs
    // The stale question can no longer be answered.
    expect(() => engine.answer(q1.question.id, 14)).toThrow()
    const q2 = engine.resume()!
    expect(q2).toMatchObject({ factId: '2x7', source: 'reintroduce', index: 0 })
    expect(q2.question.id).not.toBe(q1.question.id)
    expect(() => engine.answer(q1.question.id, 14)).toThrow()
    let active = 1500
    while (!engine.isComplete()) {
      const q = engine.nextQuestion()!
      clock.t += 2000
      active += 2000
      engine.answer(q.question.id, q.question.correctAnswer)
    }
    const s = engine.finish()
    expect(s.elapsedMs).toBe(active)
    expect(s.answered).toBe(10)
    expect(engine.getProfile().rawLog.sessions.find((x) => x.id === 'vis')!.pauses).toEqual([
      { startedAtMs: T0 + DAY + 1500, endedAtMs: T0 + DAY + 1500 + pausedMs },
    ])
  })

  it('wrong answer → reveal until the next question; the clock keeps running (no retype)', () => {
    const clock: Clock = { t: T0 + DAY }
    const engine = makeEngine(createEmptyProfile('K', T0), clock, { day: 1, seed: 4 })
    const q = engine.nextQuestion()!
    clock.t += 2000
    const out = engine.answer(q.question.id, -5)
    expect(out.correct).toBe(false)
    const expr = (q.question.prompt as { expression: string }).expression
    expect(out.reveal).toEqual({ factId: q.factId, text: `${expr} = ${q.question.correctAnswer}`, expected: q.question.correctAnswer, given: -5 })
    expect(engine.snapshot().reveal).toEqual(out.reveal)
    expect(() => engine.answer(q.question.id, q.question.correctAnswer)).toThrow() // no retype
    clock.t += 4000 // reveal on screen
    expect(engine.elapsedMs()).toBe(6000)
    engine.nextQuestion()
    expect(engine.snapshot().reveal).toBeNull()
  })

  it('a miss reveal on screen survives hide/resume (clock paused while hidden)', () => {
    const clock: Clock = { t: T0 + DAY }
    const engine = makeEngine(createEmptyProfile('K', T0), clock, { day: 1, seed: 4 })
    const q = engine.nextQuestion()!
    clock.t += 2000
    const out = engine.answer(q.question.id, -5)
    clock.t += 1000
    expect(engine.hide()).toEqual({ discarded: false })
    clock.t += 60_000
    expect(engine.resume()).toBeNull() // reveal kept, no new draw yet
    expect(engine.snapshot().reveal).toEqual(out.reveal)
    expect(engine.isHidden()).toBe(false)
    clock.t += 500
    expect(engine.elapsedMs()).toBe(3500)
    const next = engine.nextQuestion()!
    expect(next).not.toBeNull()
    expect(engine.snapshot().reveal).toBeNull()
    expect(engine.getProfile().rawLog.sessions.at(-1)!.discardedOnHide).toEqual([])
  })
})

describe('LevelSessionEngine — level-up (D4)', () => {
  function readyToComplete(levelId: LevelId, extra: Partial<LearnerProfile['progress']> = {}): LearnerProfile {
    const profile = createEmptyProfile('K', T0)
    const level = getLevel(levelId)
    const fe: Record<string, FactEvidence> = {}
    for (const f of level.kind === 'table' ? level.tableFactIds : ALL_IDS) fe[f] = masteredEvidence(f)
    profile.progress = {
      ...profile.progress,
      factEvidence: fe,
      evidence: { [levelId]: buffer(60, ['x1', 'x2', 'x3'], ['2026-01-01', '2026-01-02']) },
      finishedSessionsByLevel: { [levelId]: 1 },
      ...extra,
    }
    return profile
  }

  it('completing a lower level keeps a higher current level (placement start)', () => {
    const profile = readyToComplete('L1', { unlockedLevelIds: ['L1', 'L2', 'L3'], currentLevelId: 'L3', placementStartLevelId: 'L3' })
    const r = play(profile, { day: 1, seed: 1, levelId: 'L1' })
    expect(r.summary.advancement.newlyCompleted).toBe(true)
    expect(r.summary.advancement.unlockedLevelId).toBeNull()
    expect(r.profile.progress.currentLevelId).toBe('L3')
    expect(r.profile.progress.completedLevelIds).toEqual(['L1'])
    expect(r.summary.xp.levelCompleted).toBe(RULES.xp.levelCompleted)
  })

  it('L9 completion never unlocks or enters the deferred L10', () => {
    const upTo9 = getCurriculum().levels.slice(0, 9).map((l) => l.id)
    const profile = readyToComplete('L9', {
      unlockedLevelIds: upTo9,
      completedLevelIds: upTo9.slice(0, 8),
      currentLevelId: 'L9',
    })
    const r = play(profile, { day: 1, seed: 1, levelId: 'L9' })
    expect(r.summary.advancement.checks.kind).toBe('mixed')
    expect(r.summary.advancement.newlyCompleted).toBe(true)
    expect(r.summary.advancement.unlockedLevelId).toBeNull()
    expect(r.profile.progress.completedLevelIds).toContain('L9')
    expect(r.profile.progress.unlockedLevelIds).not.toContain('L10')
    expect(r.profile.progress.currentLevelId).toBe('L9')
    expect(r.summary.events.some((e) => e.type === 'level-unlocked')).toBe(false)
  })
})

describe('LevelSessionEngine — evidence rebuild policy (D11 erratum)', () => {
  function staleProfile(): LearnerProfile {
    const profile = createEmptyProfile('K', T0)
    const sid = 'v1-inferred-0'
    profile.rawLog.sessions.push({
      id: sid, kind: 'play', startedAtMs: T0 - 5 * DAY, endedAtMs: T0 - 5 * DAY + 60_000, mode: null, levelId: null,
      inferred: true, endReason: 'inferred', isReplay: false, pauses: [], discardedOnHide: [],
    })
    for (const f of ['2x3', '2x4', '2x5']) {
      for (let k = 0; k < 3; k++) {
        profile.rawLog.attempts.push({ ...liveAttempt(f, true, sid, T0 - 5 * DAY + k), sessionInferred: true })
      }
    }
    profile.progress = { ...profile.progress, evidenceStale: true }
    return profile
  }

  it('evidenceStale → rebuilt exactly once, then the caches are authoritative', () => {
    const profile = staleProfile()
    const clock: Clock = { t: T0 + DAY }
    const e1 = makeEngine(profile, clock, { day: 1, seed: 1 })
    expect(e1.startInfo.rebuiltEvidence).toBe(true)
    const p1 = e1.getProfile()
    expect(p1.progress.evidenceStale).toBe(false)
    expect(p1.progress.factEvidence['2x3']!.countedAttempts).toBe(3)
    e1.abandon()
    // Tamper with a cache: a later start must NOT rebuild (it would erase this).
    const tampered = structuredClone(e1.getProfile())
    tampered.progress.factEvidence['9x9'] = { ...emptyFactEvidence('9x9'), countedAttempts: 42 }
    const e2 = makeEngine(tampered, { t: T0 + 2 * DAY }, { day: 2, seed: 2 })
    expect(e2.startInfo.rebuiltEvidence).toBe(false)
    expect(e2.getProfile().progress.factEvidence['9x9']!.countedAttempts).toBe(42)
  })

  it('evidenceStaleWithDamagedLog → rebuilt from the salvaged log, flag cleared, alert surfaced (lead ruling)', () => {
    const profile = staleProfile()
    const load = {
      quarantine: {
        kind: 'raw-log-damaged' as const, detail: 'x', blob: '{}', droppedAttempts: 3, droppedSessions: 0,
        evidenceStaleWithDamagedLog: true,
      },
      notice: 'damaged-history-backed-up' as const,
    }
    const e = makeEngine(profile, { t: T0 + DAY }, { day: 1, seed: 1, load })
    expect(e.startInfo).toMatchObject({ rebuiltEvidence: true, evidenceStaleWithDamagedLog: true })
    expect(e.getProfile().progress.factEvidence['2x3']!.countedAttempts).toBe(3)
    expect(e.getProfile().progress.evidenceStale).toBe(false)
    expect(e.persistenceAlerts()).toEqual([
      { kind: 'evidence-stale-damaged-log' },
      { kind: 'notice', notice: 'damaged-history-backed-up' },
    ])
    // No XP / fact-mastered events from rebuilt mastery: `before` is taken after the rebuild.
    const spaced = staleProfile()
    spaced.rawLog.sessions.push({ ...spaced.rawLog.sessions[0]!, id: 'v1-inferred-1', startedAtMs: T0 - 3 * DAY, endedAtMs: T0 - 3 * DAY + 60_000 })
    spaced.rawLog.attempts.push({ ...liveAttempt('2x3', true, 'v1-inferred-1', T0 - 3 * DAY), sessionInferred: true })
    const r = play(spaced, { day: 1, seed: 1, load, answer: () => false })
    expect(r.engine.startInfo.rebuiltEvidence).toBe(true)
    expect(r.engine.getProfile().progress.factEvidence['2x3']!.everMastered).toBe(true) // mastered by rebuild
    expect(r.summary.advancement.newlyMasteredFactIds).toEqual([])
    expect(r.summary.xp.factMastered).toBe(0)
    e.abandon()
    const later = makeEngine(e.getProfile(), { t: T0 + 2 * DAY }, { day: 2, seed: 2 })
    expect(later.startInfo.rebuiltEvidence).toBe(false)
  })

  it('SaveResult pass-through: failures, trims and notices become alerts; clean saves do not', () => {
    const e = makeEngine(createEmptyProfile('K', T0), { t: T0 }, { day: 0, seed: 1 })
    expect(e.reportSaveResult({ status: 'saved' })).toEqual([])
    expect(e.reportSaveResult({ status: 'failed', reason: 'quota' })).toEqual([{ kind: 'save-failed', reason: 'quota' }])
    expect(e.reportSaveResult({ status: 'saved-trimmed', droppedAttempts: 5, droppedSessions: 1 })).toEqual([
      { kind: 'save-trimmed', droppedAttempts: 5, droppedSessions: 1 },
    ])
    expect(e.reportSaveResult({ status: 'saved', notice: 'damaged-history-not-backed-up' })).toEqual([
      { kind: 'notice', notice: 'damaged-history-not-backed-up' },
    ])
    // One result can produce several alerts: all are returned.
    expect(
      e.reportSaveResult({ status: 'saved-trimmed', droppedAttempts: 2, droppedSessions: 1, notice: 'unreadable-save-not-backed-up' }),
    ).toEqual([
      { kind: 'save-trimmed', droppedAttempts: 2, droppedSessions: 1 },
      { kind: 'notice', notice: 'unreadable-save-not-backed-up' },
    ])
    expect(e.persistenceAlerts()).toHaveLength(5)
  })
})

describe('LevelSessionEngine — D12 exact invariant at session level', () => {
  /** Replays a recorded pick sequence (the only latency channel, stage-2 fluency, is thereby held fixed). */
  function replaySource(picks: { factId: string; source: LevelPick['source'] }[]) {
    let i = 0
    return (ctx: { skill: ReturnType<typeof createMultiplicationSkill> }): SessionQuestionSource => ({
      seedPending: () => 0,
      nextQuestion: () => {
        const p = picks[i++]!
        const question = ctx.skill.generateQuestion({ skillId: 'multiplication', targetConcepts: [p.factId], cognitiveDifficulty: 0.5 })
        return { question, pick: { factId: p.factId, source: p.source, pool: null, likely: false, carried: false } }
      },
      recordAnswer: () => {},
      discardLast: () => false,
      exportPending: () => [],
    })
  }

  it('latency ×0.3 / ×3 leaves status, counted flags, completion, record eligibility and XP identical', () => {
    const answerU = kid(0.85, 99)
    const latU = seeded(123)
    // Reference journey with the real orchestrator (latency ×1).
    let profile = createEmptyProfile('K', T0)
    const sessions: { levelId: LevelId; picks: { factId: string; source: LevelPick['source']; correct: boolean; latency: number }[] }[] = []
    const ref: { status: string[]; counted: boolean[]; summary: SessionResultSummaryV2 }[] = []
    for (let s = 1; s <= 14; s++) {
      const levelId = profile.progress.currentLevelId
      const r = play(profile, {
        day: s,
        seed: 300 + s,
        answer: () => answerU(),
        // Multiples of 10 ms so ×0.3 is an exact integer (no rounding ties between runs).
        latency: () => 1000 + 10 * Math.floor(latU() * 800),
      })
      // Rebuild the recorded sequence from the raw log (authoritative).
      const own = r.profile.rawLog.attempts.filter((x) => x.sessionId === r.summary.sessionId)
      sessions.push({ levelId, picks: own.map((x) => ({ factId: x.factId, source: x.source as LevelPick['source'], correct: x.correct, latency: x.latencyMs })) })
      ref.push({ status: r.shown.map((x) => x.status), counted: r.shown.map((x) => x.counted), summary: r.summary })
      profile = r.profile
    }
    expect(ref.some((x) => x.summary.advancement.newlyCompleted)).toBe(true)

    for (const scale of [1, 0.3, 3]) {
      let p = createEmptyProfile('K', T0)
      sessions.forEach((sess, k) => {
        const r = play(p, {
          day: k + 1,
          seed: 300 + k + 1,
          levelId: sess.levelId,
          questionSource: replaySource(sess.picks),
          answer: (_f, i) => sess.picks[i]!.correct,
          latency: (_f, i) => Math.round(sess.picks[i]!.latency * scale),
        })
        const want = ref[k]!
        expect(r.shown.map((x) => x.status)).toEqual(want.status)
        expect(r.shown.map((x) => x.counted)).toEqual(want.counted)
        expect(r.summary.advancement.checks).toEqual(want.summary.advancement.checks)
        expect(r.summary.advancement.newlyCompleted).toBe(want.summary.advancement.newlyCompleted)
        expect(r.summary.record.eligible).toBe(want.summary.record.eligible)
        expect(r.summary.record.isBaseline).toBe(want.summary.record.isBaseline)
        expect(r.summary.record.isNewRecord).toBe(want.summary.record.isNewRecord)
        expect(r.summary.xp).toEqual(want.summary.xp)
        expect(r.summary.badgesEarned.map((b) => b.badgeId)).toEqual(want.summary.badgesEarned.map((b) => b.badgeId))
        p = r.profile
      })
      expect(p.progress.completedLevelIds).toEqual(profile.progress.completedLevelIds)
      expect(p.player.xp).toBe(profile.player.xp)
    }
  })
})
