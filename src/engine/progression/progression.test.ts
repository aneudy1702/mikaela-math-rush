import { describe, expect, it } from 'vitest'
import type {
  BadgeAward,
  BadgeId,
  LearnerProfile,
  ProgressionEvent,
  RecordBeatenEvent,
  SessionLogEntry,
  SessionMode,
  SkillProgress,
  XpContext,
} from '../contracts'
import { RULES, SESSION_LENGTHS, SPEC_CONSTANTS } from '../contracts'
import { createEmptyProfile } from '../learning/selection'
import { migrateV1ToV2 } from '../persistence/migration'
import { buildV1Fixture } from '../persistence/__fixtures__/v1Profile'
import {
  evaluateBadges,
  getBadgeDefs,
  isRecordXpAvailableToday,
  levelForXp,
  playerLevelInfo,
  progressLevelId,
  titleForLevel,
  xpForSession,
  xpToReachLevel,
} from './progression'

const MODES: SessionMode[] = ['quick', 'practice', 'rush']

function entry(over: Partial<SessionLogEntry> = {}): SessionLogEntry {
  const mode = over.mode ?? 'quick'
  const n = SESSION_LENGTHS[mode]
  return {
    sessionId: 's-1',
    skillId: 'multiplication',
    levelId: 'L3',
    mode,
    rulesVersion: 1,
    startedAtMs: 1_000,
    endedAtMs: 61_000,
    elapsedMs: 60_000,
    dayKey: '2026-09-26',
    completed: true,
    answered: n,
    correct: n - 1,
    drawAnswers: n,
    drawCorrect: n - 1,
    longestStreak: 3,
    isReplay: false,
    ...over,
  }
}

function perfect(over: Partial<SessionLogEntry> = {}): SessionLogEntry {
  const mode = over.mode ?? 'quick'
  const n = SESSION_LENGTHS[mode]
  return entry({ correct: n, drawCorrect: n, answered: n, drawAnswers: n, ...over })
}

/** Progress-level session, nothing one-time. */
function ctx(over: Partial<XpContext> = {}): XpContext {
  return {
    levelCompletedBefore: false,
    isProgressLevel: true,
    firstFinishLevelMode: false,
    newlyMasteredFacts: 0,
    levelCompletedNow: false,
    recordBeaten: false,
    recordXpAvailableToday: true,
    ...over,
  }
}

const REPLAY: Partial<XpContext> = {
  levelCompletedBefore: true,
  isProgressLevel: false,
}

describe('xpForSession — per-correct XP (D6)', () => {
  it('pays +1 per correct answer on an uncompleted level', () => {
    expect(xpForSession(entry({ correct: 9 }), ctx()).perCorrect).toBe(9)
    // Any uncompleted level, not only the progress level.
    expect(
      xpForSession(entry({ correct: 7 }), ctx({ isProgressLevel: false })).perCorrect,
    ).toBe(7)
  })

  it('pays ⌊correct/5⌋ on a completed level', () => {
    expect(xpForSession(entry({ correct: 9 }), ctx(REPLAY)).perCorrect).toBe(1)
    expect(xpForSession(entry({ correct: 10 }), ctx(REPLAY)).perCorrect).toBe(2)
    expect(
      xpForSession(entry({ mode: 'rush', correct: 99 }), ctx(REPLAY)).perCorrect,
    ).toBe(19)
    expect(xpForSession(entry({ correct: 4 }), ctx(REPLAY)).perCorrect).toBe(0)
  })
})

describe('xpForSession — completion bonus (D6)', () => {
  it('pays Quick 10 · Practice 25 · Rush 100 on an uncompleted level', () => {
    const want = { quick: 10, practice: 25, rush: 100 }
    for (const mode of MODES) {
      expect(xpForSession(entry({ mode }), ctx()).completionBonus).toBe(want[mode])
    }
  })

  it('pays × 0.2 (2 · 5 · 20) on a completed level', () => {
    const want = { quick: 2, practice: 5, rush: 20 }
    for (const mode of MODES) {
      expect(xpForSession(entry({ mode }), ctx(REPLAY)).completionBonus).toBe(
        want[mode],
      )
    }
  })

  it('pays the full bonus for the first finish of a level+mode on a completed level', () => {
    const want = { quick: 10, practice: 25, rush: 100 }
    for (const mode of MODES) {
      expect(
        xpForSession(entry({ mode }), ctx({ ...REPLAY, firstFinishLevelMode: true }))
          .completionBonus,
      ).toBe(want[mode])
    }
  })

  it('pays no bonus for an abandoned session', () => {
    const xp = xpForSession(
      entry({ completed: false, correct: 4, drawCorrect: 4, drawAnswers: 4 }),
      ctx(),
    )
    expect(xp.completionBonus).toBe(0)
    expect(xp.perfectBonus).toBe(0)
    expect(xp.perCorrect).toBe(4)
  })
})

describe('xpForSession — perfect session (D6)', () => {
  it('adds 50% of the bonus paid when every draw answer is correct', () => {
    expect(xpForSession(perfect({ mode: 'quick' }), ctx()).perfectBonus).toBe(5)
    expect(xpForSession(perfect({ mode: 'rush' }), ctx()).perfectBonus).toBe(50)
    // 50% of the reduced replay bonus (Quick 2 → 1, Rush 20 → 10).
    expect(xpForSession(perfect({ mode: 'quick' }), ctx(REPLAY)).perfectBonus).toBe(1)
    expect(xpForSession(perfect({ mode: 'rush' }), ctx(REPLAY)).perfectBonus).toBe(10)
    // Practice: ⌊25·0.5⌋ = 12, ⌊5·0.5⌋ = 2 (XP stays an integer).
    expect(xpForSession(perfect({ mode: 'practice' }), ctx()).perfectBonus).toBe(12)
    expect(xpForSession(perfect({ mode: 'practice' }), ctx(REPLAY)).perfectBonus).toBe(2)
  })

  it('is judged on draw answers only', () => {
    // A missed reintroduce item does not break a perfect draw record.
    const e = entry({ answered: 11, correct: 10, drawAnswers: 10, drawCorrect: 10 })
    expect(xpForSession(e, ctx()).perfectBonus).toBe(5)
    expect(xpForSession(entry(), ctx()).perfectBonus).toBe(0)
    expect(
      xpForSession(entry({ drawAnswers: 0, drawCorrect: 0 }), ctx()).perfectBonus,
    ).toBe(0)
  })
})

describe('xpForSession — one-time events (D6)', () => {
  it('pays +5 per fact whose everMastered became true', () => {
    expect(xpForSession(entry(), ctx({ newlyMasteredFacts: 3 })).factMastered).toBe(15)
    expect(xpForSession(entry(), ctx()).factMastered).toBe(0)
  })

  it('pays +100 when the level is completed by play', () => {
    expect(xpForSession(entry(), ctx({ levelCompletedNow: true })).levelCompleted).toBe(
      100,
    )
  })

  it('never pays level completion again on an already completed level', () => {
    expect(
      xpForSession(entry(), ctx({ ...REPLAY, levelCompletedNow: true })).levelCompleted,
    ).toBe(0)
  })

  it('a placement-skipped level pays normal rates and +100 when later completed by play', () => {
    // Placement unlocks but never completes: the level is uncompleted for XP.
    const xp = xpForSession(
      perfect(),
      ctx({ isProgressLevel: false, levelCompletedNow: true, newlyMasteredFacts: 2 }),
    )
    expect(xp).toEqual({
      perCorrect: 10,
      completionBonus: 10,
      perfectBonus: 5,
      factMastered: 10,
      levelCompleted: 100,
      recordBeaten: 0,
      total: 135,
    })
  })

  it('badges carry no XP (XpBreakdown has no badge line)', () => {
    const xp = xpForSession(entry(), ctx())
    expect(Object.keys(xp).sort()).toEqual(
      [
        'completionBonus',
        'factMastered',
        'levelCompleted',
        'perCorrect',
        'perfectBonus',
        'recordBeaten',
        'total',
      ].sort(),
    )
  })
})

describe('xpForSession — records (D3, D6)', () => {
  it('pays +25 for a beaten record on the progress level', () => {
    expect(xpForSession(entry(), ctx({ recordBeaten: true })).recordBeaten).toBe(25)
  })

  it('pays nothing for a baseline (recordBeaten is false for baselines)', () => {
    expect(xpForSession(entry(), ctx({ recordBeaten: false })).recordBeaten).toBe(0)
  })

  it('pays nothing for a record beaten off the progress level', () => {
    expect(
      xpForSession(entry(), ctx({ ...REPLAY, recordBeaten: true })).recordBeaten,
    ).toBe(0)
  })

  it('pays at most once per calendar day overall', () => {
    const profile = createEmptyProfile('T', 0)
    const player = profile.player
    expect(isRecordXpAvailableToday(player, '2026-09-26')).toBe(true)
    const first = xpForSession(
      entry(),
      ctx({
        recordBeaten: true,
        recordXpAvailableToday: isRecordXpAvailableToday(player, '2026-09-26'),
      }),
    )
    expect(first.recordBeaten).toBe(25)
    const after = { ...player, lastRecordXpDayKey: '2026-09-26' }
    expect(isRecordXpAvailableToday(after, '2026-09-26')).toBe(false)
    const second = xpForSession(
      entry({ sessionId: 's-2' }),
      ctx({
        recordBeaten: true,
        recordXpAvailableToday: isRecordXpAvailableToday(after, '2026-09-26'),
      }),
    )
    expect(second.recordBeaten).toBe(0)
    expect(isRecordXpAvailableToday(after, '2026-09-27')).toBe(true)
  })
})

describe('xpForSession — totals and excluded sources', () => {
  it('total is the sum of every line', () => {
    const xp = xpForSession(
      perfect({ mode: 'rush' }),
      ctx({ newlyMasteredFacts: 4, levelCompletedNow: true, recordBeaten: true }),
    )
    expect(xp.total).toBe(100 + 100 + 50 + 20 + 100 + 25)
  })

  it('sessions reconstructed by migration earn 0 XP', () => {
    const xp = xpForSession(
      perfect({ sessionId: 'v1-inferred-0' }),
      ctx({ newlyMasteredFacts: 5, levelCompletedNow: true, recordBeaten: true }),
    )
    expect(xp.total).toBe(0)
  })

  it('migration awards no XP: player.xp is the carried v1 gameXp', () => {
    const v2 = migrateV1ToV2(buildV1Fixture(), 1_800_000_000_000)
    expect(v2.player.xp).toBe(buildV1Fixture().gameXp)
    expect(v2.player.badges).toEqual([])
  })
})

describe('D6 farming check: progress level beats replay in every mode', () => {
  // Worked example from D6: completion bonus 10 · 25 · 100 on the progress level vs
  // 2 · 5 · 20 on a completed level; per-correct +1 vs ⌊correct/5⌋.
  const secondsPerQuestion = 4

  function xpPerMinute(e: SessionLogEntry, c: XpContext, secPerQ: number): number {
    const xp = xpForSession(e, c)
    const repeatable = xp.perCorrect + xp.completionBonus + xp.perfectBonus
    return repeatable / ((e.answered * secPerQ) / 60)
  }

  for (const mode of MODES) {
    const n = SESSION_LENGTHS[mode]
    it(`${mode}: 90%-accurate progress play > perfect steady replay, even at 1.5× speed`, () => {
      const progress = xpPerMinute(
        entry({ mode, correct: Math.floor(n * 0.9), drawCorrect: Math.floor(n * 0.9) }),
        ctx(),
        secondsPerQuestion,
      )
      const replay = xpPerMinute(perfect({ mode }), ctx(REPLAY), secondsPerQuestion / 1.5)
      expect(progress).toBeGreaterThan(replay)
    })

    it(`${mode}: progress play > one-time first-finish replay at equal pace`, () => {
      const progress = xpPerMinute(perfect({ mode }), ctx(), secondsPerQuestion)
      const firstFinish = xpPerMinute(
        perfect({ mode }),
        ctx({ ...REPLAY, firstFinishLevelMode: true }),
        secondsPerQuestion,
      )
      expect(progress).toBeGreaterThan(firstFinish)
      const progress90 = xpPerMinute(
        entry({ mode, correct: Math.floor(n * 0.9), drawCorrect: Math.floor(n * 0.9) }),
        ctx(),
        secondsPerQuestion,
      )
      expect(progress90).toBeGreaterThan(firstFinish)
    })
  }

  it('matches the D6 numbers exactly for perfect sessions', () => {
    const rows = MODES.map((mode) => [
      xpForSession(perfect({ mode }), ctx()).total,
      xpForSession(perfect({ mode }), ctx(REPLAY)).total,
    ])
    // quick: 10+10+5 vs 2+2+1 · practice: 25+25+12 vs 5+5+2 · rush: 100+100+50 vs 20+20+10
    expect(rows).toEqual([
      [25, 5],
      [62, 12],
      [250, 50],
    ])
  })
})

describe('player level (D6)', () => {
  it('XP to reach L = 25·L·(L−1)', () => {
    expect(xpToReachLevel(1)).toBe(0)
    expect(xpToReachLevel(2)).toBe(50)
    expect(xpToReachLevel(5)).toBe(500)
    expect(xpToReachLevel(10)).toBe(2_250)
    expect(xpToReachLevel(20)).toBe(9_500)
    expect(xpToReachLevel(30)).toBe(21_750)
    expect(xpToReachLevel(0)).toBe(0)
  })

  it('levelForXp is the largest L whose threshold is reached', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(49)).toBe(1)
    expect(levelForXp(50)).toBe(2)
    expect(levelForXp(499)).toBe(4)
    expect(levelForXp(500)).toBe(5)
    expect(levelForXp(21_750)).toBe(30)
    expect(levelForXp(-10)).toBe(1)
    expect(levelForXp(Number.NaN)).toBe(1)
    for (let l = 1; l <= 200; l++) {
      expect(levelForXp(xpToReachLevel(l))).toBe(l)
      expect(levelForXp(xpToReachLevel(l + 1) - 1)).toBe(l)
    }
  })

  it('agrees with the formula the v1 migration uses', () => {
    for (const gameXp of [0, 1, 49, 50, 51, 499, 500, 2_249, 2_250, 9_500, 123_456]) {
      const v1 = { ...buildV1Fixture(), gameXp }
      const v2 = migrateV1ToV2(v1, 1_800_000_000_000)
      expect(v2.player.level).toBe(levelForXp(gameXp))
    }
  })

  it('titles: 1 Rookie · 5 Number Ninja · 10 Math Racer · 20 Math Wizard · 30 Math Legend', () => {
    expect(titleForLevel(1)).toBe('Rookie')
    expect(titleForLevel(4)).toBe('Rookie')
    expect(titleForLevel(5)).toBe('Number Ninja')
    expect(titleForLevel(10)).toBe('Math Racer')
    expect(titleForLevel(19)).toBe('Math Racer')
    expect(titleForLevel(20)).toBe('Math Wizard')
    expect(titleForLevel(30)).toBe('Math Legend')
    expect(titleForLevel(99)).toBe('Math Legend')
  })

  it('playerLevelInfo reports level, title, into-level and to-next', () => {
    expect(playerLevelInfo(0)).toEqual({
      level: 1,
      title: 'Rookie',
      xpIntoLevel: 0,
      xpToNext: 50,
      levelSpan: 50,
    })
    expect(playerLevelInfo(520)).toEqual({
      level: 5,
      title: 'Number Ninja',
      xpIntoLevel: 20,
      xpToNext: 230,
      levelSpan: 250,
    })
  })
})

describe('progressLevelId', () => {
  function prog(unlocked: string[], completed: string[]): SkillProgress {
    return {
      ...createEmptyProfile('T', 0).progress,
      unlockedLevelIds: unlocked,
      completedLevelIds: completed,
    }
  }

  it('is the lowest unlocked level not yet completed', () => {
    expect(progressLevelId(prog(['L1'], []))).toBe('L1')
    expect(progressLevelId(prog(['L1', 'L2', 'L3'], ['L1', 'L2']))).toBe('L3')
    // Placement unlocks without completing: L1 and L2 are still uncompleted.
    expect(progressLevelId(prog(['L3', 'L1', 'L2'], ['L3']))).toBe('L1')
    // Ladder order, not string order.
    expect(progressLevelId(prog(['L10', 'L9'], []))).toBe('L9')
    expect(progressLevelId(prog(['L1'], ['L1']))).toBeNull()
  })
})

describe('badges (D6)', () => {
  const defs = getBadgeDefs()

  it('catalogue has every D6 badge, only Level Mastered per level', () => {
    const ids: BadgeId[] = [
      'first-run',
      'hot-streak',
      'on-fire',
      'perfect-session',
      'level-mastered',
      'comeback-kid',
      'record-breaker',
      'three-day-streak',
      'speedster',
    ]
    expect(defs.map((d) => d.id).sort()).toEqual([...ids].sort())
    expect(defs.filter((d) => d.perLevel).map((d) => d.id)).toEqual(['level-mastered'])
    for (const d of defs) {
      expect(d.title.length).toBeGreaterThan(0)
      expect(d.description.length).toBeGreaterThan(0)
    }
  })

  function profileWith(
    over: Partial<LearnerProfile> = {},
    badges: BadgeAward[] = [],
    playerOver: Partial<LearnerProfile['player']> = {},
  ): LearnerProfile {
    const p = createEmptyProfile('T', 0)
    return {
      ...p,
      ...over,
      player: { ...p.player, ...playerOver, badges },
    }
  }

  /** Apply awards to a profile (as T7 would) for re-award checks. */
  function withAwards(p: LearnerProfile, awards: BadgeAward[]): LearnerProfile {
    return { ...p, player: { ...p.player, badges: [...p.player.badges, ...awards] } }
  }

  function ids(awards: BadgeAward[]): string[] {
    return awards.map((a) => a.badgeId)
  }

  const base = { atMs: 60_000, sessionId: 's-1' }
  const recordEvent = (over: Partial<RecordBeatenEvent> = {}): RecordBeatenEvent => ({
    ...base,
    type: 'record-beaten',
    key: { skillId: 'multiplication', levelId: 'L3', mode: 'quick', rulesVersion: 1 },
    previousBestMs: 60_000,
    newBestMs: 50_000,
    levelCompleted: false,
    isProgressLevel: true,
    ...over,
  })

  function expectOnce(
    badgeId: BadgeId,
    profile: LearnerProfile,
    e: SessionLogEntry,
    events: ProgressionEvent[],
  ): BadgeAward {
    const first = evaluateBadges(profile, e, events)
    const hit = first.filter((a) => a.badgeId === badgeId)
    expect(hit).toHaveLength(1)
    expect(hit[0].sessionId).toBe(e.sessionId)
    expect(hit[0].awardedAtMs).toBe(e.endedAtMs)
    // Same call again: identical result (pure).
    expect(evaluateBadges(profile, e, events)).toEqual(first)
    // Once owned, never re-awarded.
    const later = evaluateBadges(withAwards(profile, first), e, events)
    expect(ids(later)).not.toContain(badgeId)
    return hit[0]
  }

  it('First Run: finishing any session', () => {
    expectOnce('first-run', profileWith(), entry(), [])
    expect(ids(evaluateBadges(profileWith(), entry({ completed: false }), []))).not.toContain(
      'first-run',
    )
  })

  it('Hot Streak: 10 correct in a row', () => {
    const n = SPEC_CONSTANTS.hotStreakCorrectInRow
    expectOnce('hot-streak', profileWith(), entry({ longestStreak: n }), [])
    expect(ids(evaluateBadges(profileWith(), entry({ longestStreak: n - 1 }), []))).not.toContain(
      'hot-streak',
    )
  })

  it('On Fire: 25 in a row', () => {
    const n = SPEC_CONSTANTS.onFireCorrectInRow
    const e = perfect({ mode: 'practice', longestStreak: n })
    expectOnce('on-fire', profileWith(), e, [])
    expect(
      ids(evaluateBadges(profileWith(), entry({ mode: 'practice', longestStreak: n - 1 }), [])),
    ).not.toContain('on-fire')
  })

  it('Perfect Session: 100% of draw answers in a finished session', () => {
    expectOnce('perfect-session', profileWith(), perfect(), [])
    expect(ids(evaluateBadges(profileWith(), entry(), []))).not.toContain('perfect-session')
    expect(
      ids(evaluateBadges(profileWith(), perfect({ completed: false }), [])),
    ).not.toContain('perfect-session')
  })

  it('Level Mastered ×N: once per level completed by play', () => {
    const l3: ProgressionEvent = { ...base, type: 'level-completed', levelId: 'L3' }
    const a = expectOnce('level-mastered', profileWith(), entry(), [l3])
    expect(a.levelId).toBe('L3')
    // A different level earns another one even when L3's is owned.
    const owned = withAwards(profileWith(), [a])
    const l4: ProgressionEvent = { ...base, type: 'level-completed', levelId: 'L4' }
    const next = evaluateBadges(owned, entry({ levelId: 'L4' }), [l4])
    expect(next.filter((b) => b.badgeId === 'level-mastered').map((b) => b.levelId)).toEqual([
      'L4',
    ])
    // Duplicate events in one call award once.
    expect(
      evaluateBadges(profileWith(), entry(), [l3, l3]).filter(
        (b) => b.badgeId === 'level-mastered',
      ),
    ).toHaveLength(1)
    // Unlock by placement is not completion.
    const unlock: ProgressionEvent = {
      ...base,
      type: 'level-unlocked',
      levelId: 'L5',
      reason: 'placement',
    }
    expect(ids(evaluateBadges(profileWith(), entry(), [unlock]))).not.toContain(
      'level-mastered',
    )
  })

  it('Comeback Kid: fact missed in an earlier session, correct first in this one', () => {
    const ev: ProgressionEvent = {
      ...base,
      type: 'fact-comeback',
      factId: '7x8',
      missedInSessionId: 's-0',
    }
    expectOnce('comeback-kid', profileWith(), entry(), [ev])
    expect(ids(evaluateBadges(profileWith(), entry(), []))).not.toContain('comeback-kid')
  })

  it('Record Breaker: 5 records beaten (baselines excluded)', () => {
    const four = profileWith({}, [], { recordsBeaten: 4 })
    expectOnce('record-breaker', four, entry(), [recordEvent()])
    expect(ids(evaluateBadges(four, entry(), []))).not.toContain('record-breaker')
    const baseline: ProgressionEvent = {
      ...base,
      type: 'baseline-set',
      key: recordEvent().key,
      baselineMs: 50_000,
    }
    expect(ids(evaluateBadges(four, entry(), [baseline]))).not.toContain('record-breaker')
    // Five in one go from zero.
    const five = Array.from({ length: 5 }, () => recordEvent())
    expect(ids(evaluateBadges(profileWith(), entry(), five))).toContain('record-breaker')
  })

  it('3-Day Streak: three calendar days in a row', () => {
    // Before this session: 2-day streak ending yesterday.
    const pre = profileWith({ dailyStreak: 2, lastPlayDayKey: '2026-09-25' })
    expectOnce('three-day-streak', pre, entry({ dayKey: '2026-09-26' }), [])
    // Profile already updated for today works too.
    const post = profileWith({ dailyStreak: 3, lastPlayDayKey: '2026-09-26' })
    expect(ids(evaluateBadges(post, entry({ dayKey: '2026-09-26' }), []))).toContain(
      'three-day-streak',
    )
    // Month boundary.
    const month = profileWith({ dailyStreak: 2, lastPlayDayKey: '2026-09-30' })
    expect(ids(evaluateBadges(month, entry({ dayKey: '2026-10-01' }), []))).toContain(
      'three-day-streak',
    )
    // Broken streak / same day at 2.
    const gap = profileWith({ dailyStreak: 2, lastPlayDayKey: '2026-09-24' })
    expect(ids(evaluateBadges(gap, entry({ dayKey: '2026-09-26' }), []))).not.toContain(
      'three-day-streak',
    )
    const sameDay = profileWith({ dailyStreak: 2, lastPlayDayKey: '2026-09-26' })
    expect(ids(evaluateBadges(sameDay, entry({ dayKey: '2026-09-26' }), []))).not.toContain(
      'three-day-streak',
    )
  })

  it('Speedster: beat own record on a completed level', () => {
    expectOnce('speedster', profileWith(), entry({ isReplay: true }), [
      recordEvent({ levelCompleted: true, isProgressLevel: false }),
    ])
    expect(ids(evaluateBadges(profileWith(), entry(), [recordEvent()]))).not.toContain(
      'speedster',
    )
  })

  it('ignores events from other sessions and migrated sessions', () => {
    const other: ProgressionEvent = { ...base, sessionId: 's-9', type: 'level-completed', levelId: 'L3' }
    expect(ids(evaluateBadges(profileWith(), entry(), [other]))).not.toContain('level-mastered')
    const inferred = entry({ sessionId: 'v1-inferred-3', longestStreak: 30 })
    expect(evaluateBadges(profileWith(), perfect({ sessionId: 'v1-inferred-3' }), [])).toEqual([])
    expect(evaluateBadges(profileWith(), inferred, [])).toEqual([])
  })
})

describe('progression never touches academic mastery fields', () => {
  function guarded(): LearnerProfile {
    const p = createEmptyProfile('T', 0)
    const trap = (name: string): never => {
      throw new Error(`progression read academic field: ${name}`)
    }
    const progress = { ...p.progress }
    Object.defineProperty(progress, 'factEvidence', { get: () => trap('factEvidence') })
    Object.defineProperty(progress, 'evidence', { get: () => trap('evidence') })
    const profile = { ...p, progress, player: { ...p.player, recordsBeaten: 4 } }
    Object.defineProperty(profile, 'facts', { get: () => trap('facts') })
    Object.defineProperty(profile, 'rawLog', { get: () => trap('rawLog') })
    return Object.freeze(profile) as LearnerProfile
  }

  it('evaluateBadges / progressLevelId read status and events only, and write nothing', () => {
    const p = guarded()
    const events: ProgressionEvent[] = [
      { atMs: 1, sessionId: 's-1', type: 'fact-mastered', factId: '2x3', levelId: 'L1', firstTime: true },
      { atMs: 1, sessionId: 's-1', type: 'level-completed', levelId: 'L1' },
    ]
    expect(() => evaluateBadges(p, perfect({ longestStreak: 30 }), events)).not.toThrow()
    expect(() => progressLevelId(p.progress)).not.toThrow()
    expect(p.player.badges).toEqual([])
    expect(p.player.xp).toBe(0)
  })

  it('xpForSession uses only its entry and context', () => {
    const e = Object.freeze(perfect())
    const c = Object.freeze(ctx({ newlyMasteredFacts: 1 }))
    expect(xpForSession(e, c).total).toBe(10 + 10 + 5 + RULES.xp.factMastered)
  })
})
