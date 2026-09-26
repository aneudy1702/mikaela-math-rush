import { describe, expect, it } from 'vitest'
import type { LearnerProfile, RawAttempt } from '../contracts'
import { createMultiplicationSkill } from '../content/multiplication'
import { getCurriculum, getLevel } from '../curriculum'
import { rebuildEvidence } from '../learning/advancement'
import { createEmptyProfile } from '../learning/selection'
import { seeded } from '../orchestrator/levelSelection.testkit'
import { PROFILE_STORAGE_KEY, createLocalStorageStore, serializeProfile, type LocalProfileStore } from '../persistence'
import { FakeStorage } from '../persistence/__fixtures__/v1Profile'
import { LevelSessionEngine, settleFinishedSession } from './levelSession'

/** Store round-trips through `createLocalStorageStore` over a fake Storage (verifier gap). */

const DAY = 86_400_000
const T0 = new Date(2026, 0, 5, 12, 0, 0).getTime()

function start(store: LocalProfileStore, profile: LearnerProfile, clock: { t: number }, id: string, seed: number) {
  return new LevelSessionEngine({
    profile,
    skill: createMultiplicationSkill(seeded(seed + 1)),
    mode: 'quick',
    levelId: profile.progress.currentLevelId,
    clock: () => clock.t,
    rngs: { main: seeded(seed), fluency: seeded(seed + 2) },
    sessionId: id,
    load: store.lastLoad(),
  })
}

function answerN(engine: LevelSessionEngine, clock: { t: number }, n: number): void {
  for (let i = 0; i < n && !engine.isComplete(); i++) {
    const q = engine.nextQuestion()!
    clock.t += 2000
    engine.answer(q.question.id, q.question.correctAnswer)
    clock.t += 1000
  }
}

describe('LevelSessionEngine × createLocalStorageStore round-trips', () => {
  it('(a) mid-session checkpoint → save → reload: next engine closes it as abandoned; it earns nothing', () => {
    const storage = new FakeStorage()
    const store = createLocalStorageStore(storage, { now: () => T0 })
    const loaded = store.load()
    const clock = { t: T0 + DAY }
    const e1 = start(store, loaded, clock, 'mid', 1)
    answerN(e1, clock, 6)
    expect(store.save(e1.checkpoint()).status).toBe('saved')
    // App killed here. Reload from storage.
    const store2 = createLocalStorageStore(storage, { now: () => T0 + 2 * DAY })
    const reloaded = store2.load()
    expect(reloaded.rawLog.sessions.find((s) => s.id === 'mid')!.endReason).toBeNull()
    expect(reloaded.rawLog.attempts).toHaveLength(6)
    const clock2 = { t: T0 + 2 * DAY }
    const e2 = start(store2, reloaded, clock2, 'next', 2)
    expect(e2.startInfo.closedDanglingSessions).toBe(1)
    answerN(e2, clock2, 10)
    const s = e2.finish()
    expect(store2.save(e2.getProfile()).status).toBe('saved')
    const final = createLocalStorageStore(storage).load()
    expect(final.rawLog.sessions.find((x) => x.id === 'mid')!.endReason).toBe('abandoned')
    expect(final.sessionLog.map((x) => x.sessionId)).toEqual(['next'])
    expect(final.progress.finishedSessionsByLevel).toEqual({ L1: 1 })
    expect(final.player.xp).toBe(s.xpAfter)
    expect(s.xpBefore).toBe(0)
    expect(final.rawLog.attempts.filter((x) => x.sessionId === 'mid')).toHaveLength(6)
  })

  it('(b) finish → save → reload → new session: no re-settle, no double XP', () => {
    const storage = new FakeStorage()
    const store = createLocalStorageStore(storage, { now: () => T0 })
    const clock = { t: T0 + DAY }
    const e1 = start(store, store.load(), clock, 'one', 3)
    answerN(e1, clock, 10)
    const s1 = e1.finish()
    expect(store.save(e1.getProfile()).status).toBe('saved')

    const store2 = createLocalStorageStore(storage)
    const reloaded = store2.load()
    expect(reloaded.player.xp).toBe(s1.xpAfter)
    const snapshot = structuredClone(reloaded)
    expect(
      settleFinishedSession(reloaded, {
        sessionId: 'one',
        skillId: 'multiplication',
        level: getLevel('L1'),
        curriculum: getCurriculum(),
        before: reloaded.progress,
        longestStreak: 10,
        pendingAfter: [],
      }),
    ).toBeNull()
    expect(reloaded).toEqual(snapshot)

    const clock2 = { t: T0 + 2 * DAY }
    const e2 = start(store2, reloaded, clock2, 'two', 4)
    answerN(e2, clock2, 10)
    const s2 = e2.finish()
    expect(s2.xpBefore).toBe(s1.xpAfter)
    store2.save(e2.getProfile())
    const final = createLocalStorageStore(storage).load()
    expect(final.player.xp).toBe(s1.xp.total + s2.xp.total)
    expect(final.sessionLog.map((x) => x.sessionId)).toEqual(['one', 'two'])
    expect(final.player.badges.filter((b) => b.badgeId === 'first-run')).toHaveLength(1)
    expect(final.progress.finishedSessionsByLevel).toEqual({ L1: 2 })
  })

  it('(c) evidenceStale + damaged raw log: salvaged log is rebuilt and the alert is surfaced', () => {
    const profile = createEmptyProfile('K', T0)
    const sid = 'v1-inferred-0'
    profile.rawLog.sessions.push({
      id: sid, kind: 'play', startedAtMs: T0 - 5 * DAY, endedAtMs: T0 - 5 * DAY + 60_000, mode: null, levelId: null,
      inferred: true, endReason: 'inferred', isReplay: false, pauses: [], discardedOnHide: [],
    })
    const facts = ['2x3', '2x4', '2x5', '2x6']
    facts.forEach((f, k) => {
      for (let j = 0; j < 3; j++) {
        const x: RawAttempt = {
          factId: f, a: null, b: null, correct: true, given: null, latencyMs: 2000, atMs: T0 - 5 * DAY + k * 10 + j,
          sessionId: sid, sessionInferred: true, levelId: null, mode: null, source: 'draw', isReplay: false,
        }
        profile.rawLog.attempts.push(x)
      }
    })
    profile.progress = { ...profile.progress, evidenceStale: true }
    const obj = JSON.parse(serializeProfile(profile)) as { rawLog: { a: unknown[][] } }
    obj.rawLog.a[obj.rawLog.a.length - 1]![11] = 42 // damage the last attempt row
    const storage = new FakeStorage()
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(obj))

    const store = createLocalStorageStore(storage, { now: () => T0 })
    const loaded = store.load()
    expect(store.lastLoad()!.quarantine).toMatchObject({ kind: 'raw-log-damaged', evidenceStaleWithDamagedLog: true })
    expect(loaded.progress.evidenceStale).toBe(true)
    expect(loaded.progress.factEvidence).toEqual({})
    const salvaged = loaded.rawLog.attempts.length
    expect(salvaged).toBeGreaterThan(0)
    expect(salvaged).toBeLessThan(facts.length * 3)

    const clock = { t: T0 + DAY }
    const e = start(store, loaded, clock, 'first', 5)
    expect(e.startInfo).toMatchObject({ rebuiltEvidence: true, evidenceStaleWithDamagedLog: true })
    const p = e.getProfile()
    expect(p.progress.evidenceStale).toBe(false)
    const expected = rebuildEvidence(loaded.rawLog, loaded.progress)
    expect(p.progress.factEvidence).toEqual(expected.factEvidence)
    expect(p.progress.factEvidence['2x3']!.countedAttempts).toBe(3)
    expect(e.persistenceAlerts()).toContainEqual({ kind: 'evidence-stale-damaged-log' })
    expect(e.persistenceAlerts().some((a) => a.kind === 'notice')).toBe(true)

    answerN(e, clock, 10)
    e.finish()
    expect(store.save(e.getProfile()).status).toBe('saved')
    const again = createLocalStorageStore(storage).load()
    expect(again.progress.evidenceStale).toBe(false)
    expect(again.progress.factEvidence['2x3']!.countedAttempts).toBeGreaterThanOrEqual(3)
  })
})
