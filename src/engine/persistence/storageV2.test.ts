import { describe, expect, it } from 'vitest'
import type {
  LearnerProfile,
  LearnerProfileV1,
  RawAttempt,
  SessionRecord,
} from '../contracts'
import { isCanonicalFactId, isCoreFactId } from '../contracts'
import { createMultiplicationSkill } from '../content/multiplication'
import { createEmptyProfile } from '../learning'
import { SessionEngine } from '../session'
import { migrateV1ToV2 } from './migration'
import {
  LEGACY_V1_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
  createLocalStorageStore,
  deserializeProfile,
  loadProfileFromStorage,
  serializeProfile,
} from './storage'
import {
  FIXTURE_T0,
  FakeStorage,
  buildV1Fixture,
  countV1Attempts,
} from './__fixtures__/v1Profile'

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function storageWithV1(): { storage: FakeStorage; v1Json: string } {
  const storage = new FakeStorage()
  const v1Json = JSON.stringify(buildV1Fixture())
  storage.setItem(LEGACY_V1_STORAGE_KEY, v1Json)
  return { storage, v1Json }
}

describe('profile v2 storage', () => {
  it('uses the new v2 key and never the v1 key', () => {
    expect(PROFILE_STORAGE_KEY).toBe('mikaela-math-rush:learner-v2')
    expect(LEGACY_V1_STORAGE_KEY).toBe('mikaela-math-rush:learner-v1')
  })

  it('loading order: v2 → v1 migration → fresh', () => {
    const { storage } = storageWithV1()
    expect(loadProfileFromStorage(storage).source).toBe('v1-migrated')

    const saved = createEmptyProfile('Saved', 1)
    storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(saved))
    const loaded = loadProfileFromStorage(storage)
    expect(loaded.source).toBe('v2')
    expect(loaded.profile.learnerName).toBe('Saved')

    expect(loadProfileFromStorage(new FakeStorage()).source).toBe('fresh')
  })

  it('migrates v1 on load, saves to v2, leaves v1 byte-identical', () => {
    const { storage, v1Json } = storageWithV1()
    const store = createLocalStorageStore(storage)
    const profile = store.load()
    expect(profile.version).toBe(2)
    expect(profile.rawLog.attempts).toHaveLength(countV1Attempts(buildV1Fixture()))
    // load() never writes.
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBeNull()

    store.save(profile)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)
    const stored = storage.getItem(PROFILE_STORAGE_KEY)!
    expect(stored).toBeTruthy()

    const reloaded = loadProfileFromStorage(storage)
    expect(reloaded.source).toBe('v2')
    expect(reloaded.profile).toEqual(profile)
  })

  it('clear resets to a fresh v2 profile without touching v1', () => {
    const { storage, v1Json } = storageWithV1()
    const store = createLocalStorageStore(storage)
    store.save(store.load())
    store.clear()
    const p = store.load()
    expect(p.gameXp).toBe(0)
    expect(p.rawLog.attempts).toHaveLength(0)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)
  })

  it.each([
    ['not JSON', '{oops'],
    ['JSON null', 'null'],
    ['wrong version', JSON.stringify({ version: 3, learnerName: 'x', facts: {} })],
    ['no progress/player (facts alone do not validate)', JSON.stringify({ version: 2, learnerName: 'x', facts: {} })],
    [
      'no progress/player, corrupt raw log',
      JSON.stringify({ version: 2, learnerName: 'x', facts: {}, rawLog: { v: 1, ids: [], s: [], a: [[1]] } }),
    ],
  ])('unreadable v2 (%s) falls back to v1 migration, then fresh', (_label, blob) => {
    const { storage, v1Json } = storageWithV1()
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    const withV1 = loadProfileFromStorage(storage)
    expect(withV1.source).toBe('v1-migrated')
    expect(withV1.profile.player.xp).toBe(1234)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)

    const noV1 = new FakeStorage()
    noV1.setItem(PROFILE_STORAGE_KEY, blob)
    const fresh = createLocalStorageStore(noV1).load()
    expect(fresh.version).toBe(2)
    expect(fresh.gameXp).toBe(0)
  })

  it('corrupt v1 with no v2 gives a fresh profile', () => {
    const storage = new FakeStorage()
    storage.setItem(LEGACY_V1_STORAGE_KEY, '{"version":1,')
    expect(loadProfileFromStorage(storage).source).toBe('fresh')
  })

  it('handles missing or throwing localStorage', () => {
    const none = createLocalStorageStore(null)
    expect(none.load().version).toBe(2)
    expect(() => none.save(createEmptyProfile())).not.toThrow()
    expect(() => none.clear()).not.toThrow()

    // Node test env has no global localStorage.
    const dflt = createLocalStorageStore()
    expect(dflt.load().version).toBe(2)

    const throwing = {
      getItem() {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    expect(createLocalStorageStore(throwing).load().version).toBe(2)
  })

  it('applies the raw log cap on save, evicting whole oldest sessions only', () => {
    const profile = createEmptyProfile('Cap', 1)
    const sessions: SessionRecord[] = []
    const attempts: RawAttempt[] = []
    for (let s = 0; s < 202; s++) {
      const id = `live-${s}`
      const start = 1_800_000_000_000 + s * 3_600_000
      sessions.push({
        id,
        kind: 'play',
        startedAtMs: start,
        endedAtMs: start + 100_000,
        mode: 'rush',
        levelId: 'L3',
        inferred: false,
        endReason: 'finished',
        isReplay: false,
        pauses: [],
        discardedOnHide: [],
      })
      for (let i = 0; i < 100; i++) {
        attempts.push({
          factId: '5x6',
          a: 5,
          b: 6,
          correct: i % 7 !== 0,
          given: 30,
          latencyMs: 1500 + i,
          atMs: start + i * 1000,
          sessionId: id,
          sessionInferred: false,
          levelId: 'L3',
          mode: 'rush',
          source: 'draw',
          isReplay: false,
        })
      }
    }
    profile.rawLog = { attempts, sessions }
    profile.player.xp = 777
    profile.progress.finishedSessionsByLevel = { L3: 202 }

    const storage = new FakeStorage()
    createLocalStorageStore(storage).save(profile)
    const loaded = deserializeProfile(storage.getItem(PROFILE_STORAGE_KEY)!)!
    expect(loaded.rawLog.attempts).toHaveLength(20_000)
    expect(loaded.rawLog.sessions[0]!.id).toBe('live-2')
    // Only the raw log is trimmed.
    expect(loaded.player.xp).toBe(777)
    expect(loaded.progress.finishedSessionsByLevel).toEqual({ L3: 202 })
    // Caller's in-memory profile is not mutated.
    expect(profile.rawLog.attempts).toHaveLength(20_200)
  })
})

describe('end-to-end: v1 profile → store → SessionEngine → save', () => {
  function answerAll(engine: SessionEngine, start: number, missEvery = 0): number {
    let now = start
    let snap = engine.start(now)
    let n = 0
    while (!snap.finished) {
      now += 1500
      if (snap.missHold) {
        snap = engine.submit(snap.missHold.expected, now)
        continue
      }
      const q = snap.current!.question
      n++
      const wrong = missEvery > 0 && n % missEvery === 0
      snap = engine.submit(wrong ? -1 : Number(q.correctAnswer), now)
    }
    return now
  }

  it('runs a legacy session on a migrated profile and persists it to v2 only', () => {
    const { storage, v1Json } = storageWithV1()
    const store = createLocalStorageStore(storage)
    const skill = createMultiplicationSkill(seeded(7))

    const before = store.load()
    const attemptsBefore = Object.values(before.facts).reduce(
      (s, f) => s + f.attempts,
      0,
    )
    const engine = new SessionEngine(before, skill, 'quick', seeded(11))
    const endAt = answerAll(engine, FIXTURE_T0 + 20 * 86_400_000, 4)
    const summary = engine.getSummary()!
    expect(summary.total).toBe(10)
    expect(summary.softMisses).toBeGreaterThan(0)

    const after = engine.getProfile()
    const attemptsAfter = Object.values(after.facts).reduce(
      (s, f) => s + f.attempts,
      0,
    )
    expect(attemptsAfter).toBe(attemptsBefore + 10)
    expect(after.gameXp).toBeGreaterThan(1234)
    // First session after migration sets a fresh mode best (v1 bests were dropped).
    expect(after.bestTimeMsByMode.quick).toBe(summary.elapsedMs)
    expect(after.lastPlayDayKey).not.toBe('2026-09-02')
    expect(after.updatedAtMs).toBe(endAt)

    store.save(after)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)

    const reloaded = store.load()
    expect(reloaded).toEqual(after)
    // Migrated raw history survives the round trip untouched.
    expect(reloaded.rawLog).toEqual(before.rawLog)
    expect(reloaded.player.xp).toBe(1234)

    // A second session from the reloaded profile works the same way.
    const engine2 = new SessionEngine(reloaded, skill, 'practice', seeded(12))
    answerAll(engine2, endAt + 86_400_000)
    expect(engine2.getSummary()!.correctCount).toBe(25)
    store.save(engine2.getProfile())
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)
  })

  it('legacy engine behaves identically on the migrated profile and the raw v1 data', () => {
    // A v1 profile with only canonical keys and core pending items (nothing for
    // migration to merge or drop): the migrated `facts` must equal the raw v1 `facts`,
    // and the same seeds must give the same question sequence on both.
    const full = buildV1Fixture()
    const v1: LearnerProfileV1 = {
      ...full,
      facts: Object.fromEntries(
        Object.entries(full.facts).filter(([k]) => k !== '8x7' && k !== '07x8'),
      ),
      pendingReinforcements: full.pendingReinforcements.filter(
        (p) => isCanonicalFactId(p.factId) && isCoreFactId(p.factId),
      ),
    }
    const migrated: LearnerProfile = migrateV1ToV2(structuredClone(v1), 0)
    expect(migrated.facts).toEqual(v1.facts)
    expect(migrated.pendingReinforcements).toEqual(v1.pendingReinforcements)

    const reference: LearnerProfile = {
      ...createEmptyProfile(),
      facts: structuredClone(v1.facts),
      pendingReinforcements: structuredClone(v1.pendingReinforcements),
    }
    const run = (p: LearnerProfile) => {
      const e = new SessionEngine(p, createMultiplicationSkill(seeded(3)), 'quick', seeded(4))
      const seen: string[] = []
      let snap = e.start(1)
      let now = 1
      while (!snap.finished) {
        now += 1000
        if (snap.missHold) {
          snap = e.submit(snap.missHold.expected, now)
          continue
        }
        seen.push(String(snap.current!.question.metadata?.factId))
        snap = e.submit(Number(snap.current!.question.correctAnswer), now)
      }
      return seen
    }
    expect(run(migrated)).toEqual(run(reference))
  })
})
