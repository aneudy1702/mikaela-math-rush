/**
 * T0.1 failure safety (D11): a damaged raw log or a full storage must never roll the
 * learner back or erase newer progress; rejected blobs are backed up before overwrite.
 */
import { describe, expect, it, vi } from 'vitest'
import type {
  LearnerProfile,
  PersonalRecord,
  RawAttempt,
  SessionRecord,
} from '../contracts'
import { RULES } from '../contracts'
import { createEmptyProfile } from '../learning'
import { salvageRawLog } from './rawLog'
import {
  LEGACY_V1_STORAGE_KEY,
  MAX_QUARANTINE_BACKUPS,
  PROFILE_STORAGE_KEY,
  QUARANTINE_KEY_PREFIX,
  createLocalStorageStore,
  deserializeProfile,
  isQuotaExceededError,
  listQuarantineBackups,
  loadProfileFromStorage,
  parseStoredProfile,
  serializeProfile,
  type SaveResult,
} from './storage'
import { FakeStorage, buildV1Fixture } from './__fixtures__/v1Profile'

const T = 1_800_000_000_000

function liveProfile(sessionCount: number, perSession: number): LearnerProfile {
  const profile = createEmptyProfile('Mikaela', 1)
  const sessions: SessionRecord[] = []
  const attempts: RawAttempt[] = []
  for (let s = 0; s < sessionCount; s++) {
    const id = `live-${s}`
    const start = T + s * 3_600_000
    sessions.push({
      id,
      kind: 'play',
      startedAtMs: start,
      endedAtMs: start + 100_000,
      mode: 'quick',
      levelId: 'L2',
      inferred: false,
      endReason: 'finished',
      isReplay: false,
      pauses: [],
      discardedOnHide: [],
    })
    for (let i = 0; i < perSession; i++) {
      attempts.push({
        factId: '3x4',
        a: 3,
        b: 4,
        correct: i % 5 !== 0,
        given: 12,
        latencyMs: 1800 + i,
        atMs: start + i * 1000,
        sessionId: id,
        sessionInferred: false,
        levelId: 'L2',
        mode: 'quick',
        source: 'draw',
        isReplay: false,
      })
    }
  }
  profile.rawLog = { attempts, sessions }
  profile.player.xp = 4321
  profile.player.level = 9
  profile.progress.unlockedLevelIds = ['L1', 'L2', 'L3']
  profile.progress.completedLevelIds = ['L1', 'L2']
  profile.progress.finishedSessionsByLevel = { L2: sessionCount }
  profile.records = {
    'L2|quick': { bestMs: 55_000 } as unknown as PersonalRecord,
  }
  return profile
}

/** The parts of a profile that must survive any storage failure. */
function progressOf(p: LearnerProfile) {
  return {
    learnerName: p.learnerName,
    progress: p.progress,
    player: p.player,
    records: p.records,
    dailyStreak: p.dailyStreak,
    pendingReinforcements: p.pendingReinforcements,
  }
}

/** Serialize, then damage the encoded raw log with `mutate`. */
function damagedBlob(profile: LearnerProfile, mutate: (enc: { a: unknown[][]; s: unknown[][]; ids: unknown[] }) => void): string {
  const obj = JSON.parse(serializeProfile(profile)) as Record<string, unknown>
  mutate(obj.rawLog as { a: unknown[][]; s: unknown[][]; ids: unknown[] })
  return JSON.stringify(obj)
}

function withV1<S extends FakeStorage = FakeStorage>(
  storage: S = new FakeStorage() as S,
): { storage: S; v1Json: string } {
  const v1Json = JSON.stringify(buildV1Fixture())
  storage.setItem(LEGACY_V1_STORAGE_KEY, v1Json)
  return { storage, v1Json }
}

/** FakeStorage that records writes and throws QuotaExceededError above `limit` chars. */
class QuotaStorage extends FakeStorage {
  writes: string[] = []
  limit: number
  failKeys: (key: string) => boolean
  constructor(limit = Infinity, failKeys: (key: string) => boolean = () => false) {
    super()
    this.limit = limit
    this.failKeys = failKeys
  }
  used(except?: string): number {
    let n = 0
    for (let i = 0; i < this.length; i++) {
      const k = this.key(i)!
      if (k !== except) n += k.length + this.getItem(k)!.length
    }
    return n
  }
  override setItem(key: string, value: string): void {
    if (this.failKeys(key) || this.used(key) + key.length + value.length > this.limit) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    this.writes.push(key)
    super.setItem(key, value)
  }
}

describe('damaged raw log is quarantined, not a rollback', () => {
  it('a damaged-rawLog blob loads with progress intact, a backup exists, and v1 is not re-migrated', () => {
    const profile = liveProfile(5, 10)
    profile.progress.evidenceStale = false
    // One bad attempt row (unknown source code) in session live-2.
    const blob = damagedBlob(profile, (enc) => {
      enc.a[23]![11] = 99
    })
    const { storage, v1Json } = withV1(new QuotaStorage())

    storage.setItem(PROFILE_STORAGE_KEY, blob)
    storage.writes = []
    const store = createLocalStorageStore(storage, { now: () => T })
    const loaded = store.load()

    expect(store.lastLoad()!.source).toBe('v2')
    expect(store.lastLoad()!.quarantine).toMatchObject({
      kind: 'raw-log-damaged',
      droppedAttempts: 1,
      droppedSessions: 0,
    })
    expect(loaded.migration).toBeUndefined()
    expect(progressOf(loaded)).toEqual(progressOf(profile))
    // Evidence is not marked stale: rebuilding from a truncated log would erase progress.
    expect(loaded.progress.evidenceStale).toBe(false)
    // Partial salvage: every other attempt and every session record survives.
    expect(loaded.rawLog.attempts).toHaveLength(49)
    expect(loaded.rawLog.attempts).toEqual(
      profile.rawLog.attempts.filter((_, i) => i !== 23),
    )
    expect(loaded.rawLog.sessions).toEqual(profile.rawLog.sessions)

    // Backup written at load, byte-identical, before any profile write.
    const backups = listQuarantineBackups(storage)
    expect(backups).toEqual([`${QUARANTINE_KEY_PREFIX}${T}`])
    expect(storage.getItem(backups[0]!)).toBe(blob)
    expect(storage.writes).toEqual([backups[0]])

    expect(store.save(loaded)).toEqual({ status: 'saved' })
    expect(storage.writes).toEqual([backups[0], PROFILE_STORAGE_KEY])
    expect(storage.getItem(backups[0]!)).toBe(blob)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)

    const again = loadProfileFromStorage(storage)
    expect(again.source).toBe('v2')
    expect(again.quarantine).toBeUndefined()
    expect(progressOf(again.profile)).toEqual(progressOf(profile))
  })

  it('an unreadable delta stops salvage there (later timestamps are unknown)', () => {
    const profile = liveProfile(3, 10)
    const blob = damagedBlob(profile, (enc) => {
      enc.a[12]![6] = 'x'
    })
    const r = parseStoredProfile(blob)
    expect(r.kind).toBe('raw-log-damaged')
    if (r.kind !== 'raw-log-damaged') return
    expect(r.droppedAttempts).toBe(18)
    expect(r.profile.rawLog.attempts).toEqual(profile.rawLog.attempts.slice(0, 12))
    expect(r.profile.player).toEqual(profile.player)
  })

  it.each([
    ['raw log is a string', (o: Record<string, unknown>) => { o.rawLog = 'garbage' }],
    ['raw log missing', (o: Record<string, unknown>) => { delete o.rawLog }],
    ['bad encoding version', (o: Record<string, unknown>) => { (o.rawLog as { v: number }).v = 9 }],
    ['id table broken', (o: Record<string, unknown>) => { (o.rawLog as { ids: unknown }).ids = 5 }],
  ])('%s: progress loads with an empty raw log and the blob is backed up', (_l, mutate) => {
    const profile = liveProfile(2, 5)
    const obj = JSON.parse(serializeProfile(profile)) as Record<string, unknown>
    mutate(obj)
    const blob = JSON.stringify(obj)
    const { storage } = withV1()
    storage.setItem(PROFILE_STORAGE_KEY, blob)

    const store = createLocalStorageStore(storage, { now: () => T })
    const loaded = store.load()
    expect(store.lastLoad()!.source).toBe('v2')
    expect(loaded.rawLog).toEqual({ attempts: [], sessions: [] })
    expect(progressOf(loaded)).toEqual(progressOf(profile))
    expect(listQuarantineBackups(storage).map((k) => storage.getItem(k))).toEqual([blob])
  })

  it('validation ignores the deprecated V1 fields (T8 can remove them safely)', () => {
    const profile = liveProfile(1, 3)
    const obj = JSON.parse(serializeProfile(profile)) as Record<string, unknown>
    delete obj.facts
    delete obj.bestTimeMsByMode
    delete obj.bestStreakByMode
    delete obj.gameXp
    const r = parseStoredProfile(JSON.stringify(obj))
    expect(r.kind).toBe('ok')
    const loaded = deserializeProfile(JSON.stringify(obj))!
    expect(progressOf(loaded)).toEqual(progressOf(profile))
    expect(loaded.rawLog).toEqual(profile.rawLog)
  })

  it('salvageRawLog never throws', () => {
    for (const v of [null, 1, 'x', [], {}, { v: 1 }, { v: 1, ids: [], s: 'x', a: 'y' }]) {
      expect(() => salvageRawLog(v)).not.toThrow()
      expect(salvageRawLog(v).log).toEqual({ attempts: [], sessions: [] })
    }
  })
})

describe('wholly unreadable v2 blob', () => {
  it.each([
    ['not JSON', '{"version":2,"learnerName":"Mik'],
    ['old/unknown version (0)', JSON.stringify({ version: 0, learnerName: 'x', progress: {}, player: {} })],
    ['non-numeric version', JSON.stringify({ version: '3', learnerName: 'x', progress: {}, player: {} })],
    ['no progress', JSON.stringify({ version: 2, learnerName: 'x', player: {} })],
  ])('%s: backed up before any overwrite; v1 migrated only after', (_l, blob) => {
    const { storage, v1Json } = withV1(new QuotaStorage())
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    storage.writes = []

    const store = createLocalStorageStore(storage, { now: () => T })
    const profile = store.load()
    expect(store.lastLoad()!.source).toBe('v1-migrated')
    expect(store.lastLoad()!.quarantine?.kind).toBe('unreadable')
    expect(profile.player.xp).toBe(1234)

    const [backup] = listQuarantineBackups(storage)
    expect(storage.getItem(backup!)).toBe(blob)
    // Load writes only the backup; the damaged blob itself is still in place.
    expect(storage.writes).toEqual([backup])
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(blob)

    expect(store.save(profile).status).toBe('saved')
    expect(storage.writes).toEqual([backup, PROFILE_STORAGE_KEY])
    expect(storage.getItem(backup!)).toBe(blob)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)
  })

  it('save without a prior load still backs up the blob it would overwrite', () => {
    const storage = new QuotaStorage()
    storage.setItem(PROFILE_STORAGE_KEY, '{broken')
    storage.writes = []
    const store = createLocalStorageStore(storage, { now: () => T })
    expect(store.save(createEmptyProfile()).status).toBe('saved')
    expect(storage.writes).toEqual([`${QUARANTINE_KEY_PREFIX}${T}`, PROFILE_STORAGE_KEY])
    expect(storage.getItem(`${QUARANTINE_KEY_PREFIX}${T}`)).toBe('{broken')
  })

  it('when the backup cannot be written, the damaged blob is not overwritten and nothing throws', () => {
    const storage = new QuotaStorage(Infinity, (k) => k.startsWith(QUARANTINE_KEY_PREFIX))
    withV1(storage)
    storage.setItem(PROFILE_STORAGE_KEY, '{broken')
    const results: SaveResult[] = []
    const store = createLocalStorageStore(storage, { now: () => T, onSaveResult: (r) => results.push(r) })
    const profile = store.load()

    expect(store.save(profile)).toEqual({ status: 'failed', reason: 'backup-required' })
    expect(store.clear()).toEqual({ status: 'failed', reason: 'backup-required' })
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe('{broken')
    expect(store.lastSaveError()).toEqual({ status: 'failed', reason: 'backup-required' })
    expect(results).toHaveLength(2)

    // Once space for the backup exists, the next save backs up first, then writes.
    storage.failKeys = () => false
    expect(store.save(profile).status).toBe('saved')
    expect(store.lastSaveError()).toBeNull()
    expect(storage.getItem(listQuarantineBackups(storage)[0]!)).toBe('{broken')
  })

  it(`keeps at most ${MAX_QUARANTINE_BACKUPS} backups (newest), deduplicating identical blobs`, () => {
    const storage = new FakeStorage()
    let now = T
    for (const blob of ['{a', '{a', '{b', '{c']) {
      storage.setItem(PROFILE_STORAGE_KEY, blob)
      createLocalStorageStore(storage, { now: () => (now += 1000) }).load()
    }
    const backups = listQuarantineBackups(storage)
    expect(backups).toHaveLength(2)
    expect(backups.map((k) => storage.getItem(k))).toEqual(['{b', '{c'])
  })

  it('a backup that exceeds the real byte budget blocks the overwrite (no throw)', () => {
    const blob = `{broken ${'x'.repeat(2000)}`
    const storage = new QuotaStorage()
    withV1(storage)
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    // Room for a small profile write, but not for a second copy of the blob.
    storage.limit = storage.used() + 1000
    const store = createLocalStorageStore(storage, { now: () => T })
    const profile = store.load()
    expect(listQuarantineBackups(storage)).toEqual([])
    expect(store.save(profile)).toEqual({ status: 'failed', reason: 'backup-required' })
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(blob)
  })
})

describe('newer-version blob (written by a newer build)', () => {
  const newer = JSON.stringify({
    version: 3,
    learnerName: 'Mikaela',
    progress: { anything: 'future' },
    player: { xp: 99_999 },
    futureField: [1, 2, 3],
  })

  it('loads read-only, never migrates v1, and stays byte-identical across saves', () => {
    const { storage, v1Json } = withV1(new QuotaStorage())
    storage.setItem(PROFILE_STORAGE_KEY, newer)
    storage.writes = []
    const results: SaveResult[] = []
    const store = createLocalStorageStore(storage, { now: () => T, onSaveResult: (r) => results.push(r) })

    const profile = store.load()
    const outcome = store.lastLoad()!
    expect(outcome.readOnly).toBe(true)
    expect(outcome.quarantine?.kind).toBe('newer-version')
    expect(outcome.source).toBe('fresh')
    expect(profile.migration).toBeUndefined()
    expect(profile.player.xp).toBe(0)

    profile.player.xp = 50
    for (let i = 0; i < 3; i++) {
      expect(store.save(profile)).toEqual({ status: 'failed', reason: 'newer-version' })
    }
    expect(store.clear()).toEqual({ status: 'failed', reason: 'newer-version' })
    expect(store.lastSaveError()).toEqual({ status: 'failed', reason: 'newer-version' })
    expect(results).toHaveLength(4)

    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(newer)
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)
    expect(storage.writes).toEqual([])
    expect(listQuarantineBackups(storage)).toEqual([])
  })

  it('save without a prior load also refuses to overwrite it', () => {
    const storage = new FakeStorage()
    storage.setItem(PROFILE_STORAGE_KEY, newer)
    const store = createLocalStorageStore(storage)
    expect(store.save(liveProfile(1, 1))).toEqual({ status: 'failed', reason: 'newer-version' })
    expect(store.save(liveProfile(1, 1))).toEqual({ status: 'failed', reason: 'newer-version' })
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(newer)
  })

  it('parseStoredProfile classifies only numeric versions > 2 as newer', () => {
    expect(parseStoredProfile(newer).kind).toBe('newer-version')
    expect(parseStoredProfile(JSON.stringify({ version: 2.5 })).kind).toBe('newer-version')
    expect(parseStoredProfile(JSON.stringify({ version: 1 })).kind).toBe('unreadable')
    expect(parseStoredProfile(JSON.stringify({ version: '9' })).kind).toBe('unreadable')
  })
})

describe('evidence caches survive raw-log loss (never rebuilt by persistence)', () => {
  function withEvidence(stale: boolean): LearnerProfile {
    const p = liveProfile(6, 20)
    p.progress.factEvidence = {
      '3x4': { status: 'fluent', counted: 17, marks: ['a', 'b'] },
      '6x7': { status: 'learning', counted: 4 },
    } as unknown as LearnerProfile['progress']['factEvidence']
    p.progress.evidence = {
      L2: [{ factId: '3x4', correct: true }, { factId: '6x7', correct: false }],
    } as unknown as LearnerProfile['progress']['evidence']
    p.progress.finishedSessionsByLevel = { L1: 3, L2: 6 }
    p.progress.evidenceStale = stale
    return p
  }
  const caches = (p: LearnerProfile) =>
    JSON.stringify([
      p.progress.factEvidence,
      p.progress.evidence,
      p.progress.finishedSessionsByLevel,
      p.progress.evidenceStale,
    ])

  it('damaged blob → load → save → load keeps evidence, buffers and session counts byte-for-byte', () => {
    const profile = withEvidence(false)
    const blob = damagedBlob(profile, (enc) => {
      enc.a[5]![6] = null // unreadable delta: most of the raw log is lost
    })
    const storage = new FakeStorage()
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    const store = createLocalStorageStore(storage, { now: () => T })

    const first = store.load()
    expect(first.rawLog.attempts).toHaveLength(5)
    expect(store.lastLoad()!.quarantine?.evidenceStaleWithDamagedLog).toBeUndefined()
    expect(caches(first)).toBe(caches(profile))
    expect(store.save(first).status).toBe('saved')

    const second = createLocalStorageStore(storage).load()
    expect(caches(second)).toBe(caches(profile))
    expect(second.progress.evidenceStale).toBe(false)
  })

  it('stale evidence + damaged log: flag and caches kept as-is, combination exposed', () => {
    const profile = withEvidence(true)
    const blob = damagedBlob(profile, (enc) => {
      enc.a[3]![11] = 42
    })
    const storage = new FakeStorage()
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    const store = createLocalStorageStore(storage, { now: () => T })
    const loaded = store.load()
    expect(store.lastLoad()!.quarantine).toMatchObject({
      kind: 'raw-log-damaged',
      evidenceStaleWithDamagedLog: true,
    })
    expect(caches(loaded)).toBe(caches(profile))
    store.save(loaded)
    expect(caches(createLocalStorageStore(storage).load())).toBe(caches(profile))
  })

  it('quota-driven eviction and hard trim never touch evidence or evidenceStale', () => {
    for (const stale of [false, true]) {
      const profile = withEvidence(stale)
      const storage = new QuotaStorage()
      const emptyLog = serializeProfile({ ...profile, rawLog: { attempts: [], sessions: [] } })
      storage.limit = PROFILE_STORAGE_KEY.length + emptyLog.length + 2000
      expect(createLocalStorageStore(storage).save(profile).status).toBe('saved-trimmed')
      const loaded = createLocalStorageStore(storage).load()
      expect(loaded.rawLog.attempts.length).toBeLessThan(profile.rawLog.attempts.length)
      expect(caches(loaded)).toBe(caches(profile))
    }
  })

  it('damaged raw log + failing backup (byte budget): nothing overwritten, progress survives in memory', () => {
    const profile = withEvidence(false)
    const blob = damagedBlob(profile, (enc) => {
      enc.s[1]![1] = 'bad-kind'
    })
    const storage = new QuotaStorage()
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    storage.limit = storage.used() + 500 // a second copy of the blob does not fit
    const store = createLocalStorageStore(storage, { now: () => T })

    const loaded = store.load()
    expect(store.lastLoad()!.quarantine?.kind).toBe('raw-log-damaged')
    expect(listQuarantineBackups(storage)).toEqual([])
    expect(progressOf(loaded)).toEqual(progressOf(profile))
    expect(caches(loaded)).toBe(caches(profile))

    loaded.player.xp += 10
    expect(store.save(loaded)).toEqual({ status: 'failed', reason: 'backup-required' })
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(blob)
    // The in-memory profile is untouched by the refused save.
    expect(loaded.player.xp).toBe(profile.player.xp + 10)
    expect(caches(loaded)).toBe(caches(profile))
  })
})

describe('raw log cap round trip', () => {
  it('v2 save → load round trip after the cap', () => {
    const profile = liveProfile(202, 100)
    const storage = new FakeStorage()
    const store = createLocalStorageStore(storage)
    expect(store.save(profile)).toEqual({ status: 'saved' })
    const firstBlob = storage.getItem(PROFILE_STORAGE_KEY)

    const loaded = store.load()
    expect(store.lastLoad()!.quarantine).toBeUndefined()
    expect(loaded.rawLog.attempts).toHaveLength(RULES.rawLogMaxAttempts)
    expect(loaded.rawLog.sessions.map((s) => s.id)).toEqual(
      profile.rawLog.sessions.slice(2).map((s) => s.id),
    )
    expect(loaded).toEqual({
      ...profile,
      rawLog: {
        attempts: profile.rawLog.attempts.filter(
          (a) => a.sessionId !== 'live-0' && a.sessionId !== 'live-1',
        ),
        sessions: profile.rawLog.sessions.slice(2),
      },
    })
    // Saving the loaded profile again is byte-stable.
    store.save(loaded)
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(firstBlob)
  })
})

describe('storage full (QuotaExceededError)', () => {
  it('recognises quota errors across engines', () => {
    expect(isQuotaExceededError(new DOMException('x', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaExceededError({ code: 22 })).toBe(true)
    expect(isQuotaExceededError(new Error('SecurityError'))).toBe(false)
    expect(isQuotaExceededError(null)).toBe(false)
  })

  it('saves progress by evicting the oldest raw-log sessions, never throwing', () => {
    const profile = liveProfile(40, 50)
    const fullSize = serializeProfile(profile).length
    const { storage, v1Json } = withV1(new QuotaStorage())
    storage.setItem(`${QUARANTINE_KEY_PREFIX}1`, '{old backup')
    storage.limit = storage.used() + PROFILE_STORAGE_KEY.length + Math.floor(fullSize * 0.6)

    const results: SaveResult[] = []
    const store = createLocalStorageStore(storage, { onSaveResult: (r) => results.push(r) })
    let result: SaveResult | undefined
    expect(() => {
      result = store.save(profile)
    }).not.toThrow()

    expect(result!.status).toBe('saved-trimmed')
    expect(results).toEqual([result])
    expect(store.lastSaveError()).toBeNull()

    const loaded = deserializeProfile(storage.getItem(PROFILE_STORAGE_KEY)!)!
    expect(progressOf(loaded)).toEqual(progressOf(profile))
    // Oldest-first: the kept sessions are exactly the newest ones, each kept whole.
    const kept = loaded.rawLog.sessions.map((s) => s.id)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(40)
    expect(kept).toEqual(profile.rawLog.sessions.slice(40 - kept.length).map((s) => s.id))
    expect(loaded.rawLog.attempts).toEqual(
      profile.rawLog.attempts.filter((a) => kept.includes(a.sessionId)),
    )
    if (result!.status === 'saved-trimmed') {
      expect(result!.droppedSessions).toBe(40 - kept.length)
      expect(result!.droppedAttempts).toBe(50 * (40 - kept.length))
    }
    // Never deletes v1 or backups to make room; caller's profile is not mutated.
    expect(storage.getItem(LEGACY_V1_STORAGE_KEY)).toBe(v1Json)
    expect(storage.getItem(`${QUARANTINE_KEY_PREFIX}1`)).toBe('{old backup')
    expect(profile.rawLog.sessions).toHaveLength(40)
  })

  it('falls back to a hard-trimmed raw log (newest session, then none)', () => {
    const profile = liveProfile(10, 50)
    const emptyLog = serializeProfile({ ...profile, rawLog: { attempts: [], sessions: [] } })
    const storage = new QuotaStorage()
    storage.limit = PROFILE_STORAGE_KEY.length + emptyLog.length + 10
    const store = createLocalStorageStore(storage)
    const r = store.save(profile)
    expect(r).toEqual({ status: 'saved-trimmed', droppedAttempts: 500, droppedSessions: 10 })
    const loaded = deserializeProfile(storage.getItem(PROFILE_STORAGE_KEY)!)!
    expect(loaded.rawLog).toEqual({ attempts: [], sessions: [] })
    expect(progressOf(loaded)).toEqual(progressOf(profile))
  })

  it('reports failure (no throw) when even progress alone does not fit, keeping the previous save', () => {
    const storage = new QuotaStorage()
    const store = createLocalStorageStore(storage)
    const older = liveProfile(1, 1)
    expect(store.save(older).status).toBe('saved')
    const previous = storage.getItem(PROFILE_STORAGE_KEY)
    // Room for anything except a profile blob (the old blob's space counts as reusable).
    storage.limit = storage.used(PROFILE_STORAGE_KEY) + PROFILE_STORAGE_KEY.length + 50

    const onSaveResult = vi.fn()
    const store2 = createLocalStorageStore(storage, { onSaveResult })
    store2.load()
    const newer = liveProfile(3, 5)
    newer.player.xp = 9999
    expect(() => store2.save(newer)).not.toThrow()
    expect(store2.lastSaveError()).toEqual({ status: 'failed', reason: 'quota' })
    expect(onSaveResult).toHaveBeenCalledWith({ status: 'failed', reason: 'quota' })
    expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(previous)
  })

  it('non-quota storage errors are reported, not thrown', () => {
    const storage = new FakeStorage()
    const err = new Error('SecurityError')
    storage.setItem = () => {
      throw err
    }
    const store = createLocalStorageStore(storage)
    expect(store.save(createEmptyProfile())).toEqual({ status: 'failed', reason: 'error', error: err })
  })
})
