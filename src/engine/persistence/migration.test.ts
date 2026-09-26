import { describe, expect, it } from 'vitest'
import { RULES, isCanonicalFactId } from '../contracts'
import {
  INFERRED_SESSION_PREFIX,
  migrateV1ToV2,
  normalizeLegacyFactKey,
  reconstructInferredSessions,
} from './migration'
import {
  FIXTURE_T0,
  buildV1Fixture,
  countV1Attempts,
  fixtureScript,
} from './__fixtures__/v1Profile'

const NOW = FIXTURE_T0 + 10 * 24 * 3_600_000

describe('v1 → v2 migration', () => {
  it('moves every v1 attempt into the raw log (zero lost attempts)', () => {
    const v1 = buildV1Fixture()
    const v2 = migrateV1ToV2(v1, NOW)
    const total = countV1Attempts(v1)
    expect(total).toBe(126)
    expect(v2.rawLog.attempts).toHaveLength(total)
    expect(v2.migration?.v1Attempts).toBe(total)
    expect(v2.migration?.migratedAttempts).toBe(total)

    // Multiset of (canonical fact, time, correct, latency) is preserved.
    const key = (f: string, at: number, c: boolean, l: number) =>
      `${f}|${at}|${c}|${l}`
    const expected = Object.entries(v1.facts)
      .flatMap(([k, r]) =>
        r.recentAttempts.map((a) =>
          key(normalizeLegacyFactKey(k)!, a.atMs, a.correct, a.latencyMs),
        ),
      )
      .sort()
    const actual = v2.rawLog.attempts
      .map((a) => key(a.factId, a.atMs, a.correct, a.latencyMs))
      .sort()
    expect(actual).toEqual(expected)
  })

  it('marks migrated attempts inferred draws with no level, chronological', () => {
    const v2 = migrateV1ToV2(buildV1Fixture(), NOW)
    for (const a of v2.rawLog.attempts) {
      expect(a.sessionInferred).toBe(true)
      expect(a.source).toBe('draw')
      expect(a.levelId).toBeNull()
      expect(a.mode).toBeNull()
      expect(a.isReplay).toBe(false)
      expect(isCanonicalFactId(a.factId)).toBe(true)
    }
    const times = v2.rawLog.attempts.map((a) => a.atMs)
    expect(times).toEqual([...times].sort((x, y) => x - y))
  })

  it('splits inferred sessions at 30-minute gaps (gap ≥ 30 min → new session)', () => {
    const v2 = migrateV1ToV2(buildV1Fixture(), NOW)
    const { sessions } = v2.rawLog
    expect(sessions).toHaveLength(4)
    expect(v2.migration?.inferredSessions).toBe(4)
    for (const s of sessions) {
      expect(s.inferred).toBe(true)
      expect(s.endReason).toBe('inferred')
      expect(s.id.startsWith(INFERRED_SESSION_PREFIX)).toBe(true)
      expect(s.mode).toBeNull()
      expect(s.levelId).toBeNull()
    }
    const sizes = sessions.map(
      (s) => v2.rawLog.attempts.filter((a) => a.sessionId === s.id).length,
    )
    const script = fixtureScript()
    // Stray/stretch attempts (6) fall inside session C.
    expect(sizes).toEqual([
      script.sessions[0]!.length,
      script.sessions[1]!.length,
      script.sessions[2]!.length + 6,
      script.sessions[3]!.length,
    ])
    // Session bounds match their attempts.
    for (const s of sessions) {
      const at = v2.rawLog.attempts
        .filter((a) => a.sessionId === s.id)
        .map((a) => a.atMs)
      expect(s.startedAtMs).toBe(Math.min(...at))
      expect(s.endedAtMs).toBe(Math.max(...at))
    }
  })

  it('gap rule boundary: exactly the gap starts a new session, 1 ms less does not', () => {
    const g = RULES.inferenceSessionGapMs
    const mk = (atMs: number) => ({
      factId: '2x3',
      attempt: { correct: true, latencyMs: 1000, atMs },
    })
    const { sessions, attempts } = reconstructInferredSessions([
      mk(0),
      mk(g - 1),
      mk(2 * g - 1),
      mk(2 * g + 5),
    ])
    expect(sessions).toHaveLength(2)
    expect(attempts.map((a) => a.sessionId)).toEqual([
      `${INFERRED_SESSION_PREFIX}1`,
      `${INFERRED_SESSION_PREFIX}1`,
      `${INFERRED_SESSION_PREFIX}2`,
      `${INFERRED_SESSION_PREFIX}2`,
    ])
  })

  it('re-canonicalizes and merges stray fact keys (D9)', () => {
    const v1 = buildV1Fixture()
    const v2 = migrateV1ToV2(v1, NOW)
    expect(v2.facts['8x7']).toBeUndefined()
    expect(v2.facts['07x8']).toBeUndefined()
    expect(v2.migration?.mergedFactKeys.sort()).toEqual(['07x8', '8x7'])
    const merged = v2.facts['7x8']!
    expect(merged.factId).toBe('7x8')
    expect(merged.attempts).toBe(
      v1.facts['7x8']!.attempts + v1.facts['8x7']!.attempts + v1.facts['07x8']!.attempts,
    )
    expect(merged.correct).toBe(
      v1.facts['7x8']!.correct + v1.facts['8x7']!.correct + v1.facts['07x8']!.correct,
    )
    expect(
      v2.rawLog.attempts.filter((a) => a.factId === '7x8').length,
    ).toBe(
      v1.facts['7x8']!.recentAttempts.length +
        v1.facts['8x7']!.recentAttempts.length +
        v1.facts['07x8']!.recentAttempts.length,
    )
    for (const k of Object.keys(v2.facts)) expect(isCanonicalFactId(k)).toBe(true)
  })

  it('keeps untouched canonical legacy records identical (legacy runtime behaves the same)', () => {
    const v1 = buildV1Fixture()
    const v2 = migrateV1ToV2(v1, NOW)
    for (const id of ['2x3', '6x7', '9x9', '10x10', '11x12']) {
      expect(v2.facts[id]).toEqual(v1.facts[id])
    }
  })

  it('carries xp/streak/placement, drops mode-only bests, awards nothing', () => {
    const v1 = buildV1Fixture()
    const v2 = migrateV1ToV2(v1, NOW)
    expect(v2.version).toBe(2)
    expect(v2.player.xp).toBe(1234)
    expect(v2.player.level).toBe(7) // 25·7·6 = 1050 ≤ 1234 < 1400
    expect(v2.player.badges).toEqual([])
    expect(v2.gameXp).toBe(1234)
    expect(v2.dailyStreak).toBe(2)
    expect(v2.lastPlayDayKey).toBe('2026-09-02')
    expect(v2.placementComplete).toBe(true)
    expect(v2.bestTimeMsByMode).toEqual({})
    expect(v2.bestStreakByMode).toEqual({})
    expect(v2.records).toEqual({})
    expect(v2.sessionLog).toEqual([])
  })

  it('does not carry v1 mastery/confidence into v2 evidence', () => {
    const v2 = migrateV1ToV2(buildV1Fixture(), NOW)
    expect(v2.progress.factEvidence).toEqual({})
    expect(v2.progress.evidence).toEqual({})
    expect(v2.progress.completedLevelIds).toEqual([])
    expect(v2.progress.unlockedLevelIds).toEqual(['L1'])
    expect(v2.progress.currentLevelId).toBe('L1')
    expect(v2.progress.evidenceStale).toBe(true)
  })

  it('canonicalizes pending reinforcements and drops non-core ones', () => {
    const v2 = migrateV1ToV2(buildV1Fixture(), NOW)
    expect(v2.pendingReinforcements).toEqual([
      { factId: '6x7', kind: 'reintroduce', dueInQuestions: 2 },
      { factId: '7x8', kind: 'later-check', dueInQuestions: 5 },
      { factId: '3x9', kind: 'later-check', dueInQuestions: 0 },
    ])
    expect(v2.migration?.droppedPendingReinforcements).toBe(1)
  })

  it('drops keys that are not facts and tolerates malformed attempts', () => {
    const v1 = buildV1Fixture()
    ;(v1.facts as Record<string, unknown>)['foo'] = {
      recentAttempts: [{ correct: true, latencyMs: 1, atMs: 5 }],
    }
    ;(v1.facts as Record<string, unknown>)['2x13'] = { recentAttempts: [] }
    v1.facts['2x3']!.recentAttempts.push({
      correct: true,
      latencyMs: 1,
      atMs: Number.NaN,
    })
    const v2 = migrateV1ToV2(v1, NOW)
    expect(v2.migration?.droppedFactKeys.sort()).toEqual(['2x13', 'foo'])
    expect(v2.rawLog.attempts).toHaveLength(126)
    expect(v2.migration?.v1Attempts).toBe(128)
  })

  it('normalizeLegacyFactKey', () => {
    expect(normalizeLegacyFactKey('8x7')).toBe('7x8')
    expect(normalizeLegacyFactKey('07x08')).toBe('7x8')
    expect(normalizeLegacyFactKey('8 × 7')).toBe('7x8')
    expect(normalizeLegacyFactKey('12X11')).toBe('11x12')
    expect(normalizeLegacyFactKey('0x5')).toBeNull()
    expect(normalizeLegacyFactKey('13x1')).toBeNull()
    expect(normalizeLegacyFactKey('7x')).toBeNull()
  })
})
