/**
 * T0.3 — D11 persistence invariant (owner): no persistence path may alter or roll back
 * mastery (`factEvidence` incl. `everMastered`, `evidence`), XP, badges, records or
 * unlocked/completed levels without a surfaced outcome (`lastLoad().notice`, a non-plain
 * `SaveResult`, or `lastSaveNotice()`).
 *
 * Matrix: every scenario runs load → save → reload. For the load step and the save step
 * separately, either the guarded fields are unchanged (vs the stored V2 state / vs the
 * profile handed to save) or an outcome is surfaced. Each row also pins the exact outcome.
 */
import { describe, expect, it } from 'vitest'
import type { LearnerProfile, PersonalRecord, RawAttempt, SessionRecord } from '../contracts'
import { createEmptyProfile } from '../learning'
import {
  LEGACY_V1_STORAGE_KEY,
  PERSISTENCE_NOTICE_MESSAGES,
  PROFILE_STORAGE_KEY,
  QUARANTINE_KEY_PREFIX,
  createLocalStorageStore,
  loadProfileFromStorage,
  serializeProfile,
  type PersistenceNotice,
  type SaveResult,
} from './storage'
import { FakeStorage, buildV1Fixture } from './__fixtures__/v1Profile'

const T = 1_800_000_000_000

/** Storage with a byte budget and per-key failures (quota or a generic error). */
class TestStorage extends FakeStorage {
  limit = Infinity
  quotaKeys: (key: string) => boolean = () => false
  errorKeys: (key: string) => boolean = () => false
  used(except?: string): number {
    let n = 0
    for (let i = 0; i < this.length; i++) {
      const k = this.key(i)!
      if (k !== except) n += k.length + this.getItem(k)!.length
    }
    return n
  }
  override setItem(key: string, value: string): void {
    if (this.errorKeys(key)) throw new Error('SecurityError')
    if (this.quotaKeys(key) || this.used(key) + key.length + value.length > this.limit) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    super.setItem(key, value)
  }
}

function storedState(): LearnerProfile {
  const p = createEmptyProfile('Mikaela', 1)
  const sessions: SessionRecord[] = []
  const attempts: RawAttempt[] = []
  for (let s = 0; s < 8; s++) {
    const id = `s-${s}`
    const start = T + s * 3_600_000
    sessions.push({
      id,
      kind: 'play',
      startedAtMs: start,
      endedAtMs: start + 60_000,
      mode: 'quick',
      levelId: 'L3',
      inferred: false,
      endReason: 'finished',
      isReplay: false,
      pauses: [],
      discardedOnHide: [],
    })
    for (let i = 0; i < 25; i++) {
      attempts.push({
        factId: '3x4',
        a: 3,
        b: 4,
        correct: i % 4 !== 0,
        given: 12,
        latencyMs: 2000 + i,
        atMs: start + i * 1000,
        sessionId: id,
        sessionInferred: false,
        levelId: 'L3',
        mode: 'quick',
        source: 'draw',
        isReplay: false,
      })
    }
  }
  p.rawLog = { attempts, sessions }
  p.progress.unlockedLevelIds = ['L1', 'L2', 'L3']
  p.progress.completedLevelIds = ['L1', 'L2']
  p.progress.factEvidence = {
    '3x4': { status: 'mastered', everMastered: true, counted: 12 },
    '6x7': { status: 'learning', everMastered: true, counted: 5 },
  } as unknown as LearnerProfile['progress']['factEvidence']
  p.progress.evidence = {
    L3: [{ factId: '3x4', correct: true }],
  } as unknown as LearnerProfile['progress']['evidence']
  p.player.xp = 5555
  p.player.level = 11
  p.player.badges = ['first-level', 'streak-3'] as unknown as LearnerProfile['player']['badges']
  p.records = { 'L2|quick': { bestMs: 48_000 } as unknown as PersonalRecord }
  return p
}

/** The fields the invariant protects. */
function guarded(p: LearnerProfile) {
  return JSON.stringify({
    factEvidence: p.progress.factEvidence,
    evidence: p.progress.evidence,
    unlocked: p.progress.unlockedLevelIds,
    completed: p.progress.completedLevelIds,
    xp: p.player.xp,
    level: p.player.level,
    badges: p.player.badges,
    records: p.records,
  })
}

function withDamagedLog(p: LearnerProfile, mutate: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(serializeProfile(p)) as Record<string, unknown>
  mutate(o)
  return JSON.stringify(o)
}

interface Setup {
  storage: TestStorage
  /** Called after load, before save (e.g. to make storage fail). */
  beforeSave?: (s: TestStorage) => void
}

interface Row {
  name: string
  setup: (S: LearnerProfile) => Setup
  /** Expected load outcome. */
  loadNotice: PersistenceNotice | undefined
  /** Load-time guarded fields equal the stored V2 state. */
  loadPreserved: boolean
  /** Expected save result shape (status, reason/notice). */
  save: Partial<Record<'status' | 'reason' | 'notice', string>>
  /** After reload, guarded fields equal what was handed to save. */
  savePersisted: boolean
}

const v1 = () => JSON.stringify(buildV1Fixture())

const ROWS: Row[] = [
  {
    name: 'healthy',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(S))
      return { storage }
    },
    loadNotice: undefined,
    loadPreserved: true,
    save: { status: 'saved' },
    savePersisted: true,
  },
  {
    name: 'partly damaged raw log',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(
        PROFILE_STORAGE_KEY,
        withDamagedLog(S, (o) => {
          ;(o.rawLog as { a: unknown[][] }).a[30]![11] = 77
        }),
      )
      return { storage }
    },
    loadNotice: 'damaged-history-backed-up',
    loadPreserved: true,
    save: { status: 'saved' },
    savePersisted: true,
  },
  {
    name: 'fully damaged raw log',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, withDamagedLog(S, (o) => void (o.rawLog = 'garbage')))
      return { storage }
    },
    loadNotice: 'damaged-history-backed-up',
    loadPreserved: true,
    save: { status: 'saved' },
    savePersisted: true,
  },
  {
    name: 'unreadable v2 with v1 present',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(LEGACY_V1_STORAGE_KEY, v1())
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(S).slice(0, 500))
      return { storage }
    },
    loadNotice: 'unreadable-save-backed-up',
    loadPreserved: false,
    save: { status: 'saved' },
    savePersisted: true,
  },
  {
    name: 'unreadable v2 without v1',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ ...S, version: 1 }))
      return { storage }
    },
    loadNotice: 'unreadable-save-backed-up',
    loadPreserved: false,
    save: { status: 'saved' },
    savePersisted: true,
  },
  {
    name: 'unreadable v2, backup fails',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(LEGACY_V1_STORAGE_KEY, v1())
      storage.setItem(PROFILE_STORAGE_KEY, '{"version":2,')
      storage.quotaKeys = (k) => k.startsWith(QUARANTINE_KEY_PREFIX)
      void S
      return { storage }
    },
    loadNotice: 'unreadable-save-not-backed-up',
    loadPreserved: false,
    save: { status: 'saved', notice: 'unreadable-save-not-backed-up' },
    savePersisted: true,
  },
  {
    name: 'newer-version',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(LEGACY_V1_STORAGE_KEY, v1())
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ ...S, version: 3 }))
      return { storage }
    },
    loadNotice: 'newer-version-read-only',
    loadPreserved: false,
    save: { status: 'failed', reason: 'newer-version' },
    savePersisted: false,
  },
  {
    name: 'quota: raw log trimmed',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(S))
      return {
        storage,
        beforeSave: (s) => {
          const empty = serializeProfile({ ...S, rawLog: { attempts: [], sessions: [] } })
          s.limit = PROFILE_STORAGE_KEY.length + empty.length + 1500
        },
      }
    },
    loadNotice: undefined,
    loadPreserved: true,
    save: { status: 'saved-trimmed' },
    savePersisted: true,
  },
  {
    name: 'quota even with an empty raw log',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(S))
      return { storage, beforeSave: (s) => void (s.limit = PROFILE_STORAGE_KEY.length + 100) }
    },
    loadNotice: undefined,
    loadPreserved: true,
    save: { status: 'failed', reason: 'quota' },
    savePersisted: false,
  },
  {
    name: 'damaged raw log, fragment backup fails',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(
        PROFILE_STORAGE_KEY,
        withDamagedLog(S, (o) => {
          ;(o.rawLog as { s: unknown[][] }).s[2]![1] = 'bad'
        }),
      )
      storage.quotaKeys = (k) => k.startsWith(QUARANTINE_KEY_PREFIX)
      return { storage }
    },
    loadNotice: 'damaged-history-not-backed-up',
    loadPreserved: true,
    save: { status: 'saved', notice: 'damaged-history-not-backed-up' },
    savePersisted: true,
  },
  {
    name: 'damaged raw log, fragment backup throws a non-quota error',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, withDamagedLog(S, (o) => void delete o.rawLog))
      storage.errorKeys = (k) => k.startsWith(QUARANTINE_KEY_PREFIX)
      return { storage }
    },
    loadNotice: 'damaged-history-not-backed-up',
    loadPreserved: true,
    save: { status: 'saved', notice: 'damaged-history-not-backed-up' },
    savePersisted: true,
  },
  {
    name: 'non-quota storage error on save',
    setup: (S) => {
      const storage = new TestStorage()
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(S))
      return { storage, beforeSave: (s) => void (s.errorKeys = () => true) }
    },
    loadNotice: undefined,
    loadPreserved: true,
    save: { status: 'failed', reason: 'error' },
    savePersisted: false,
  },
]

function isSurfaced(r: SaveResult): boolean {
  return r.status !== 'saved' || r.notice !== undefined
}

describe('D11 persistence invariant matrix (T0.3)', () => {
  it.each(ROWS.map((r) => [r.name, r] as const))('%s', (_name, row) => {
    const S = storedState()
    const { storage, beforeSave } = row.setup(S)
    const blobBefore = storage.getItem(PROFILE_STORAGE_KEY)
    const store = createLocalStorageStore(storage, { now: () => T })

    // ---- load ----
    let loaded!: LearnerProfile
    expect(() => (loaded = store.load())).not.toThrow()
    const outcome = store.lastLoad()!
    expect(outcome.notice).toBe(row.loadNotice)
    const loadPreserved = guarded(loaded) === guarded(S)
    expect(loadPreserved).toBe(row.loadPreserved)
    // Invariant: unchanged, or surfaced.
    expect(loadPreserved || outcome.notice !== undefined).toBe(true)
    if (outcome.notice) expect(PERSISTENCE_NOTICE_MESSAGES[outcome.notice]).toBeTruthy()
    if (outcome.quarantine) expect(outcome.notice).toBeDefined()

    // ---- save (the app's next state: a little more progress) ----
    beforeSave?.(storage)
    const toSave = structuredClone(loaded)
    toSave.player.xp += 7
    let saved!: SaveResult
    expect(() => (saved = store.save(toSave))).not.toThrow()
    expect(saved).toMatchObject(row.save)
    if (!row.save.notice) expect((saved as { notice?: unknown }).notice).toBeUndefined()

    // ---- reload from storage ----
    storage.limit = Infinity
    storage.quotaKeys = () => false
    storage.errorKeys = () => false
    const after = loadProfileFromStorage(storage, T)
    const persisted = !after.readOnly && guarded(after.profile) === guarded(toSave)
    expect(persisted).toBe(row.savePersisted)
    // Invariant: what was handed to save is what storage now holds, or the save surfaced.
    expect(persisted || isSurfaced(saved)).toBe(true)
    if (saved.status === 'failed') {
      // A failed save never replaces the stored blob (no partial overwrite / rollback).
      expect(storage.getItem(PROFILE_STORAGE_KEY)).toBe(blobBefore)
      expect(store.lastSaveError()).toEqual(saved)
    }
    // The notice stays readable after the fact.
    expect(store.lastSaveNotice()).toBe(row.save.notice ?? null)
    expect(store.lastLoad()!.notice).toBe(row.loadNotice)
  })

  it('a stored raw-log-damaged blob is never overwritten before its fragment backup is attempted', () => {
    const S = storedState()
    const storage = new TestStorage()
    const blob = withDamagedLog(S, (o) => void (o.rawLog = 5))
    storage.setItem(PROFILE_STORAGE_KEY, blob)
    const order: string[] = []
    const orig = storage.setItem.bind(storage)
    storage.setItem = (k, v) => {
      order.push(k.startsWith(QUARANTINE_KEY_PREFIX) ? 'backup' : k)
      orig(k, v)
    }
    const store = createLocalStorageStore(storage, { now: () => T })
    // save without load: guard still backs up first
    expect(store.save(S)).toEqual({ status: 'saved' })
    expect(order).toEqual(['backup', PROFILE_STORAGE_KEY])
  })
})
