import type {
  LearnerProfile,
  PlayerProgress,
  RawLog,
  SkillProgress,
} from '../contracts'
import {
  createEmptyPlayerProgress,
  createEmptyProfile,
  createEmptySkillProgress,
} from '../learning'
import { isV1ProfileLike, migrateV1ToV2 } from './migration'
import {
  capRawLog,
  decodeRawLog,
  encodeRawLog,
  salvageRawLog,
} from './rawLog'

/** Profile V2 key (D11 / PLAN T0). */
export const PROFILE_STORAGE_KEY = 'mikaela-math-rush:learner-v2'
/** V1 key: read for migration only; never written or deleted (backup). */
export const LEGACY_V1_STORAGE_KEY = 'mikaela-math-rush:learner-v1'
/**
 * Prefix of quarantine backups: a rejected V2 blob is copied verbatim to
 * `<prefix><timestamp>` before anything overwrites it (D11 failure safety, T0.1).
 */
export const QUARANTINE_KEY_PREFIX = 'mikaela-math-rush:learner-v2-quarantine-'
/** Most quarantine backups kept; the oldest is rotated out only after a newer one is written. */
export const MAX_QUARANTINE_BACKUPS = 2

export interface ProfileStore {
  load(): LearnerProfile
  save(profile: LearnerProfile): void
  clear(): void
}

export type ProfileLoadSource = 'v2' | 'v1-migrated' | 'fresh'

/**
 * Why a stored V2 blob was (partly) rejected.
 *
 * UI OBLIGATION (T7/T8): every quarantine outcome must be surfaced to the learner/parent
 * by the app (e.g. "some history could not be read — a backup was kept", or "this save
 * is from a newer version of the app — progress will not be saved here"). Handling it
 * silently is not allowed.
 */
export interface ProfileQuarantine {
  /**
   * `raw-log-damaged`: the profile loaded with progress/XP/records intact; only the raw log
   * was (partly) dropped. `unreadable`: nothing usable (bad JSON, old/unknown version, no
   * progress/player); the profile came from V1 migration or is fresh.
   * `newer-version`: the blob was written by a newer build (version > 2). It is never
   * migrated, backed up or overwritten: the store is read-only and the returned profile
   * is a fresh placeholder.
   */
  kind: 'raw-log-damaged' | 'unreadable' | 'newer-version'
  detail: string
  /** The original stored blob, byte for byte (what gets backed up). */
  blob: string
  /** Raw-log rows that could not be salvaged (null when unknown). */
  droppedAttempts: number | null
  droppedSessions: number | null
  /**
   * `raw-log-damaged` only: the stored profile already had `progress.evidenceStale: true`
   * (e.g. a V1 migration not yet rebuilt) when its raw log was found damaged. Persistence
   * never rebuilds evidence and never changes `evidenceStale`, `factEvidence`, `evidence`
   * or `finishedSessionsByLevel`; but a rebuild from the salvaged (incomplete) raw log
   * would lose history, so the caller (T7) must decide explicitly whether to rebuild.
   */
  evidenceStaleWithDamagedLog?: boolean
}

/**
 * UI OBLIGATION (T7/T8): when `quarantine` is set or `readOnly` is true the app must tell
 * the learner/parent; silent handling is not allowed.
 */
export interface ProfileLoadResult {
  profile: LearnerProfile
  source: ProfileLoadSource
  /** Present when the stored V2 blob was damaged (backed up before overwrite) or newer. */
  quarantine?: ProfileQuarantine
  /** True when the stored blob is from a newer build: the store refuses every write. */
  readOnly?: boolean
}

/**
 * Result of a save; failures never throw into the UI (T0.1).
 *
 * UI OBLIGATION (T7/T8): `failed` with reason `newer-version`, `backup-required` or
 * `quota` (and `error`) means the learner's progress is NOT being saved; the app must
 * surface it to the learner/parent. `saved-trimmed` should be surfaced too (old raw
 * history was dropped for space). Silent handling is not allowed.
 */
export type SaveResult =
  | { status: 'saved' }
  /** Storage full: saved after evicting the oldest whole raw-log sessions (D11). */
  | { status: 'saved-trimmed'; droppedAttempts: number; droppedSessions: number }
  | {
      status: 'failed'
      /**
       * `quota`: storage full even with an empty raw log. `backup-required`: the stored
       * blob is damaged and its quarantine backup could not be written, so it is not
       * overwritten. `newer-version`: the stored blob was written by a newer build and is
       * never overwritten by this one. `error`: any other storage/serialization error.
       */
      reason: 'quota' | 'backup-required' | 'newer-version' | 'error'
      error?: unknown
    }

export interface LocalProfileStore extends ProfileStore {
  save(profile: LearnerProfile): SaveResult
  clear(): SaveResult
  /** Last save/clear failure, or null when the last write succeeded. */
  lastSaveError(): Extract<SaveResult, { status: 'failed' }> | null
  /** Result of the most recent load (source and any quarantine), or null before load. */
  lastLoad(): ProfileLoadResult | null
}

export interface LocalStoreOptions {
  /** Clock for backup keys and migration (default Date.now). */
  now?: () => number
  /** Called after every save/clear attempt. */
  onSaveResult?: (result: SaveResult) => void
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const EMPTY_LOG: RawLog = { attempts: [], sessions: [] }

function serializeWithLog(profile: LearnerProfile, rawLog: RawLog): string {
  return JSON.stringify({ ...profile, rawLog: encodeRawLog(rawLog) })
}

/** Serialize for storage: raw log capped (D11) and compactly encoded. */
export function serializeProfile(profile: LearnerProfile): string {
  return serializeWithLog(profile, capRawLog(profile.rawLog ?? EMPTY_LOG))
}

export type StoredProfileParse =
  | { kind: 'ok'; profile: LearnerProfile }
  | {
      kind: 'raw-log-damaged'
      profile: LearnerProfile
      detail: string
      droppedAttempts: number | null
      droppedSessions: number | null
    }
  | { kind: 'unreadable'; detail: string }
  /** Parsed, but `version` is a number > 2 (a newer build wrote it). Never overwrite. */
  | { kind: 'newer-version'; detail: string; version: number }

/**
 * Parse a stored V2 blob and classify it. Validation rests on `progress`, `player` and
 * `rawLog` — never on the deprecated V1 compat fields (`facts` etc.), so removing them
 * (T8) cannot turn a good save into a rejected one. A damaged raw log never rejects the
 * profile: progress/XP/records load with whatever raw-log rows could be salvaged. The
 * evidence caches and `evidenceStale` are left as stored — rebuilding evidence from a
 * truncated log would erase progress.
 */
export function parseStoredProfile(json: string): StoredProfileParse {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { kind: 'unreadable', detail: 'not JSON' }
  }
  if (!isObject(parsed)) return { kind: 'unreadable', detail: 'not an object' }
  if (typeof parsed.version === 'number' && parsed.version > 2) {
    return {
      kind: 'newer-version',
      detail: `written by a newer app (version ${parsed.version})`,
      version: parsed.version,
    }
  }
  if (parsed.version !== 2) return { kind: 'unreadable', detail: 'not version 2' }
  if (typeof parsed.learnerName !== 'string') {
    return { kind: 'unreadable', detail: 'missing learnerName' }
  }
  if (!isObject(parsed.progress)) return { kind: 'unreadable', detail: 'missing progress' }
  if (!isObject(parsed.player)) return { kind: 'unreadable', detail: 'missing player' }

  let rawLog: RawLog
  let damage: { detail: string; droppedAttempts: number | null; droppedSessions: number | null } | null =
    null
  try {
    if (parsed.rawLog === undefined) throw new Error('raw log: missing')
    rawLog = decodeRawLog(parsed.rawLog)
  } catch (e) {
    const salvage = salvageRawLog(parsed.rawLog)
    rawLog = salvage.log
    damage = {
      detail: e instanceof Error ? e.message : 'raw log: undecodable',
      droppedAttempts: salvage.droppedAttempts,
      droppedSessions: salvage.droppedSessions,
    }
  }

  try {
    const profile = rehydrateProfile({ ...parsed, rawLog } as unknown as LearnerProfile)
    return damage ? { kind: 'raw-log-damaged', profile, ...damage } : { kind: 'ok', profile }
  } catch {
    return { kind: 'unreadable', detail: 'rehydrate failed' }
  }
}

/**
 * Parse a stored V2 blob. Returns null when no V2 progress is readable by this build
 * (unreadable, or written by a newer version — use parseStoredProfile to tell them
 * apart; a newer blob must never be overwritten). A blob whose
 * raw log is damaged still returns the profile (with the salvaged raw log).
 */
export function deserializeProfile(json: string): LearnerProfile | null {
  const r = parseStoredProfile(json)
  return r.kind === 'ok' || r.kind === 'raw-log-damaged' ? r.profile : null
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Loading order: V2 blob → else V1 blob migrated → else fresh profile.
 * - V2 with a damaged raw log: loads as `v2` (progress kept) with `quarantine` set.
 * - V2 wholly unreadable (bad JSON, version < 2 / non-numeric, no progress/player): falls
 *   through to V1 migration / fresh with `quarantine` set; callers must back up
 *   `quarantine.blob` before overwriting (the store does).
 * - V2 key holds a newer version (> 2): a fresh placeholder with `readOnly: true` and
 *   `quarantine.kind 'newer-version'`; V1 is not migrated and nothing may be written.
 * Never writes.
 */
export function loadProfileFromStorage(
  storage: Storage | null,
  nowMs: number = Date.now(),
): ProfileLoadResult {
  if (!storage) return { profile: createEmptyProfile(), source: 'fresh' }

  let quarantine: ProfileQuarantine | undefined
  const v2 = safeGet(storage, PROFILE_STORAGE_KEY)
  if (v2) {
    const r = parseStoredProfile(v2)
    if (r.kind === 'ok') return { profile: r.profile, source: 'v2' }
    if (r.kind === 'raw-log-damaged') {
      return {
        profile: r.profile,
        source: 'v2',
        quarantine: {
          kind: 'raw-log-damaged',
          detail: r.detail,
          blob: v2,
          droppedAttempts: r.droppedAttempts,
          droppedSessions: r.droppedSessions,
          ...(r.profile.progress.evidenceStale
            ? { evidenceStaleWithDamagedLog: true }
            : {}),
        },
      }
    }
    if (r.kind === 'newer-version') {
      // Never migrate or fall back: a placeholder, and the store stays read-only.
      return {
        profile: createEmptyProfile(),
        source: 'fresh',
        readOnly: true,
        quarantine: {
          kind: 'newer-version',
          detail: r.detail,
          blob: v2,
          droppedAttempts: null,
          droppedSessions: null,
        },
      }
    }
    quarantine = {
      kind: 'unreadable',
      detail: r.detail,
      blob: v2,
      droppedAttempts: null,
      droppedSessions: null,
    }
  }
  const q = quarantine ? { quarantine } : {}

  const v1 = safeGet(storage, LEGACY_V1_STORAGE_KEY)
  if (v1) {
    try {
      const parsed: unknown = JSON.parse(v1)
      if (isV1ProfileLike(parsed)) {
        return { profile: migrateV1ToV2(parsed, nowMs), source: 'v1-migrated', ...q }
      }
    } catch {
      // fall through to fresh
    }
  }

  return { profile: createEmptyProfile(), source: 'fresh', ...q }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** True for the browser's "storage full" errors (all engines). */
export function isQuotaExceededError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const err = e as { name?: unknown; code?: unknown }
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  )
}

function backupTimestamp(key: string): number {
  const n = Number.parseInt(key.slice(QUARANTINE_KEY_PREFIX.length), 10)
  return Number.isFinite(n) ? n : 0
}

/** Quarantine backup keys, oldest first. */
export function listQuarantineBackups(storage: Storage): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k !== null && k.startsWith(QUARANTINE_KEY_PREFIX)) keys.push(k)
    }
  } catch {
    return keys
  }
  return keys.sort((x, y) => backupTimestamp(x) - backupTimestamp(y) || (x < y ? -1 : 1))
}

/**
 * Copy `blob` to a new quarantine key (no-op if an identical backup already exists), then
 * rotate to at most MAX_QUARANTINE_BACKUPS. Returns false when the backup could not be
 * written. Never touches the V1 key or the profile key.
 */
export function backupRejectedBlob(storage: Storage, blob: string, nowMs: number): boolean {
  const existing = listQuarantineBackups(storage)
  if (existing.some((k) => safeGet(storage, k) === blob)) return true
  let key = `${QUARANTINE_KEY_PREFIX}${nowMs}`
  for (let n = 1; existing.includes(key); n++) key = `${QUARANTINE_KEY_PREFIX}${nowMs}-${n}`
  try {
    storage.setItem(key, blob)
    if (storage.getItem(key) !== blob) return false
  } catch {
    return false
  }
  const all = listQuarantineBackups(storage)
  for (const old of all.slice(0, Math.max(0, all.length - MAX_QUARANTINE_BACKUPS))) {
    if (old === key) continue
    try {
      storage.removeItem(old)
    } catch {
      // best effort: an extra backup is harmless
    }
  }
  return true
}

/**
 * Write the profile, handling a full storage (D11): evict the oldest whole raw-log
 * sessions (halving the attempt budget each retry), then keep only the newest session,
 * then an empty raw log. Progress, evidence caches, records and player state are always
 * written in full. Only the V2 key is written; nothing else is deleted to make room.
 */
function writeProfile(storage: Storage, profile: LearnerProfile): SaveResult {
  let full: RawLog
  try {
    full = capRawLog(profile.rawLog ?? EMPTY_LOG)
  } catch (error) {
    return { status: 'failed', reason: 'error', error }
  }
  const tryWrite = (log: RawLog): 'ok' | 'quota' | { error: unknown } => {
    try {
      storage.setItem(PROFILE_STORAGE_KEY, serializeWithLog(profile, log))
      return 'ok'
    } catch (error) {
      return isQuotaExceededError(error) ? 'quota' : { error }
    }
  }

  const first = tryWrite(full)
  if (first === 'ok') return { status: 'saved' }
  if (first !== 'quota') return { status: 'failed', reason: 'error', error: first.error }

  const candidates: RawLog[] = []
  for (let limit = Math.floor(full.attempts.length / 2); limit >= 1; limit = Math.floor(limit / 2)) {
    candidates.push(capRawLog(full, limit))
  }
  candidates.push(capRawLog(full, 0)) // hard trim: newest session only
  candidates.push(EMPTY_LOG) // last resort: no raw log at all

  let lastSize = full.attempts.length + full.sessions.length
  for (const log of candidates) {
    const size = log.attempts.length + log.sessions.length
    if (size >= lastSize && log !== EMPTY_LOG) continue
    lastSize = size
    const r = tryWrite(log)
    if (r === 'ok') {
      return {
        status: 'saved-trimmed',
        droppedAttempts: full.attempts.length - log.attempts.length,
        droppedSessions: full.sessions.length - log.sessions.length,
      }
    }
    if (r !== 'quota') return { status: 'failed', reason: 'error', error: r.error }
  }
  return { status: 'failed', reason: 'quota' }
}

/**
 * localStorage-backed store with the T0.1 failure-safety rules:
 * - load() backs up a damaged/unreadable V2 blob to a quarantine key right away;
 * - no write overwrites the V2 key while a damaged blob there has no backup;
 * - a newer-version blob (version > 2) makes the store read-only: every save()/clear()
 *   returns `failed: newer-version` and the blob stays byte-identical;
 * - evidence is never rebuilt here and `evidenceStale` / evidence caches are never changed,
 *   neither on raw-log salvage nor on quota-driven raw-log eviction;
 * - save()/clear() never throw; failures are returned, reported to `onSaveResult`
 *   and kept in `lastSaveError()`.
 */
export function createLocalStorageStore(
  storage: Storage | null = defaultStorage(),
  options: LocalStoreOptions = {},
): LocalProfileStore {
  const now = options.now ?? (() => Date.now())
  let lastError: Extract<SaveResult, { status: 'failed' }> | null = null
  let lastLoad: ProfileLoadResult | null = null
  /** The V2 key is known to hold our own write or a backed-up / valid blob. */
  let guarded = false
  /** The V2 key holds a newer build's blob: every write is refused for this store's life. */
  let readOnly = false

  /**
   * Back up whatever unreadable/damaged blob sits at the V2 key before overwriting it.
   * Returns the failure reason, or null when the write may proceed.
   */
  function guardBeforeOverwrite(s: Storage): 'backup-required' | 'newer-version' | null {
    if (readOnly) return 'newer-version'
    if (guarded) return null
    const current = safeGet(s, PROFILE_STORAGE_KEY)
    if (current) {
      const kind = parseStoredProfile(current).kind
      if (kind === 'newer-version') {
        readOnly = true
        return 'newer-version'
      }
      if (kind !== 'ok' && !backupRejectedBlob(s, current, now())) return 'backup-required'
    }
    guarded = true
    return null
  }

  function write(profile: LearnerProfile): SaveResult {
    let result: SaveResult
    const refused = storage ? guardBeforeOverwrite(storage) : null
    if (!storage) {
      result = { status: 'saved' }
    } else if (refused) {
      result = { status: 'failed', reason: refused }
    } else {
      result = writeProfile(storage, profile)
    }
    lastError = result.status === 'failed' ? result : null
    try {
      options.onSaveResult?.(result)
    } catch {
      // a reporting callback must never break saving
    }
    return result
  }

  return {
    load(): LearnerProfile {
      try {
        const result = loadProfileFromStorage(storage, now())
        lastLoad = result
        if (result.readOnly) {
          // Newer build's save: never backed up, migrated or overwritten.
          readOnly = true
        } else if (storage) {
          guarded = result.quarantine
            ? backupRejectedBlob(storage, result.quarantine.blob, now())
            : true
        }
        return result.profile
      } catch {
        return createEmptyProfile()
      }
    },
    save(profile: LearnerProfile): SaveResult {
      return write(profile)
    },
    /** Reset to a fresh profile. Writes a fresh V2 blob; the V1 backup is left untouched. */
    clear(): SaveResult {
      return write(createEmptyProfile())
    },
    lastSaveError: () => lastError,
    lastLoad: () => lastLoad,
  }
}

/** Memory store for tests. */
export function createMemoryStore(
  initial?: LearnerProfile,
): ProfileStore {
  let current = initial ?? createEmptyProfile()
  return {
    load: () => structuredClone(current),
    save: (profile) => {
      current = structuredClone(profile)
    },
    clear: () => {
      current = createEmptyProfile()
    },
  }
}

function rehydrateProgress(raw: unknown): SkillProgress {
  const base = createEmptySkillProgress()
  if (!isObject(raw)) return base
  const p = raw as Partial<SkillProgress>
  return {
    ...base,
    ...p,
    unlockedLevelIds: Array.isArray(p.unlockedLevelIds)
      ? p.unlockedLevelIds
      : base.unlockedLevelIds,
    completedLevelIds: Array.isArray(p.completedLevelIds)
      ? p.completedLevelIds
      : [],
    factEvidence: isObject(p.factEvidence) ? p.factEvidence : {},
    evidence: isObject(p.evidence) ? p.evidence : {},
    finishedSessionsByLevel: isObject(p.finishedSessionsByLevel)
      ? p.finishedSessionsByLevel
      : {},
    evidenceStale: Boolean(p.evidenceStale),
  }
}

function rehydratePlayer(raw: unknown): PlayerProgress {
  const base = createEmptyPlayerProgress()
  if (!isObject(raw)) return base
  const p = raw as Partial<PlayerProgress>
  return {
    ...base,
    ...p,
    xp: typeof p.xp === 'number' ? p.xp : 0,
    level: typeof p.level === 'number' ? p.level : 1,
    badges: Array.isArray(p.badges) ? p.badges : [],
    finishedLevelModes: Array.isArray(p.finishedLevelModes)
      ? p.finishedLevelModes
      : [],
    recordsBeaten: typeof p.recordsBeaten === 'number' ? p.recordsBeaten : 0,
    lastRecordXpDayKey:
      typeof p.lastRecordXpDayKey === 'string' ? p.lastRecordXpDayKey : null,
  }
}

/**
 * Rehydrate after JSON parse — restore missing fields with safe defaults
 * without wiping known fact history. Deprecated V1 compat fields are optional here.
 */
export function rehydrateProfile(raw: LearnerProfile): LearnerProfile {
  const base = createEmptyProfile(raw.learnerName, raw.createdAtMs)
  const rawLog = raw.rawLog
  return {
    ...base,
    ...raw,
    version: 2,
    facts: { ...base.facts, ...(isObject(raw.facts) ? raw.facts : {}) },
    bestTimeMsByMode: isObject(raw.bestTimeMsByMode) ? { ...raw.bestTimeMsByMode } : {},
    bestStreakByMode: isObject(raw.bestStreakByMode) ? { ...raw.bestStreakByMode } : {},
    dailyStreak:
      typeof raw.dailyStreak === 'number' ? raw.dailyStreak : 0,
    lastPlayDayKey:
      typeof raw.lastPlayDayKey === 'string' ? raw.lastPlayDayKey : null,
    gameXp: typeof raw.gameXp === 'number' ? raw.gameXp : 0,
    placementComplete: Boolean(raw.placementComplete),
    pendingReinforcements: Array.isArray(raw.pendingReinforcements)
      ? raw.pendingReinforcements
      : [],
    progress: rehydrateProgress(raw.progress),
    rawLog:
      isObject(rawLog) &&
      Array.isArray(rawLog.attempts) &&
      Array.isArray(rawLog.sessions)
        ? rawLog
        : { attempts: [], sessions: [] },
    records: isObject(raw.records) ? raw.records : {},
    sessionLog: Array.isArray(raw.sessionLog) ? raw.sessionLog : [],
    player: rehydratePlayer(raw.player),
  }
}
