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
 * Prefix of quarantine backups (D11 failure safety, T0.1/T0.3). A backup is written to
 * `<prefix><timestamp>` before anything overwrites the V2 key. Its value is either:
 * - an unreadable V2 blob, copied verbatim (byte for byte), or
 * - for a raw-log-damaged blob, only a raw-log fragment (see `buildRawLogFragment`,
 *   `type: 'raw-log-fragment'`): progress, XP, records and level state are valid and are
 *   carried forward in the next save, so only the damaged history needs a copy.
 */
export const QUARANTINE_KEY_PREFIX = 'mikaela-math-rush:learner-v2-quarantine-'
/** Most quarantine backups kept; the oldest is rotated out only after a newer one is written. */
export const MAX_QUARANTINE_BACKUPS = 2
/**
 * Persisted pending notices (T0.3 hardening): a JSON array of `PendingNotice`, capped at
 * `MAX_PENDING_NOTICES`. Written the moment a notice is produced (before any overwrite of
 * the data it is about) so it survives a reload until `acknowledgeNotices()`. Never written
 * in newer-version read-only mode or when storage is unavailable.
 */
export const PENDING_NOTICES_KEY = 'mikaela-math-rush:pending-notices'

/** `type` tag of a raw-log fragment backup (T0.3). */
export const RAW_LOG_FRAGMENT_TYPE = 'raw-log-fragment'

/**
 * Backup payload for a raw-log-damaged V2 blob (T0.3, D11 "Damaged raw log + full
 * storage"): the stored, still-encoded `rawLog` value exactly as found, plus minimal
 * identifying metadata. Deterministic for a given blob (no clock), so repeated loads
 * deduplicate against an existing backup.
 */
export interface RawLogFragmentBackup {
  type: typeof RAW_LOG_FRAGMENT_TYPE
  /** Profile version of the blob it came from (always 2). */
  profileVersion: number
  learnerName: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
  /** Why the raw log was judged damaged. */
  detail: string
  droppedAttempts: number | null
  droppedSessions: number | null
  /** The encoded raw-log value from the blob, verbatim (null when the key was absent). */
  rawLog: unknown
}

export interface ProfileStore {
  load(): LearnerProfile
  save(profile: LearnerProfile): void
  clear(): void
}

export type ProfileLoadSource = 'v2' | 'v1-migrated' | 'fresh'

/**
 * A persistence outcome the app MUST show the learner/parent (D11 persistence invariant,
 * T0.3). Every load/save path that alters, drops or refuses to write stored learner data
 * surfaces one of these; silent handling is not allowed (UI: T7/T8). Suggested wording is
 * in `PERSISTENCE_NOTICE_MESSAGES`.
 *
 * - `damaged-history-backed-up`: part of the answer history was damaged; progress, XP,
 *   badges, records and levels loaded intact; the damaged history was backed up.
 * - `damaged-history-not-backed-up`: as above, but the damaged history could not be backed
 *   up (storage full / error). Saving proceeds anyway — the valid learner state wins — and
 *   the damaged history is lost when the save overwrites it.
 * - `unreadable-save-backed-up`: saved progress could not be read; a copy was kept; the
 *   profile came from the V1 save (`source 'v1-migrated'`) or is fresh.
 * - `unreadable-save-not-backed-up`: saved progress could not be read and could not be
 *   backed up; the fallback profile is used and the next save overwrites the unreadable data.
 * - `unreadable-v1-save`: no V2 save, and the V1 save exists but could not be read or
 *   migrated; a fresh profile is used. The V1 key is never written or deleted (it stays as
 *   its own backup), but once a V2 save exists V1 is no longer migrated.
 * - `newer-version-read-only`: the save is from a newer app; nothing is written here.
 * - `storage-unavailable`: storage is missing or cannot be read; a fresh profile is used
 *   and progress will not be kept (every save returns `failed: storage-unavailable`).
 */
export type PersistenceNotice =
  | 'damaged-history-backed-up'
  | 'damaged-history-not-backed-up'
  | 'unreadable-save-backed-up'
  | 'unreadable-save-not-backed-up'
  | 'unreadable-v1-save'
  | 'newer-version-read-only'
  | 'storage-unavailable'

/** A notice persisted under `PENDING_NOTICES_KEY` until acknowledged. */
export interface PendingNotice {
  notice: PersistenceNotice
  /** When it was first produced (store clock). */
  atMs: number
}

/** Notices a successful save can carry: the save overwrote data that has no backup. */
export type SaveNotice = Extract<
  PersistenceNotice,
  'damaged-history-not-backed-up' | 'unreadable-save-not-backed-up'
>

/** Suggested learner/parent-facing text for each notice (UI may reword). */
export const PERSISTENCE_NOTICE_MESSAGES: Readonly<Record<PersistenceNotice, string>> = {
  'damaged-history-backed-up':
    'Some answer history could not be read. Your progress is safe, and a backup of the damaged history was kept.',
  'damaged-history-not-backed-up':
    'Some answer history could not be read and there was no room to back it up. Your progress is safe; the damaged history was not kept.',
  'unreadable-save-backed-up':
    'Saved progress could not be read. A backup was kept; you are starting from an older save or a new profile.',
  'unreadable-save-not-backed-up':
    'Saved progress could not be read and could not be backed up. You are starting from an older save or a new profile.',
  'unreadable-v1-save':
    'Saved progress from the previous version of the app could not be read. You are starting with a new profile.',
  'newer-version-read-only':
    'This save is from a newer version of the app. Progress will not be saved here.',
  'storage-unavailable':
    'This browser is not letting the app save. Progress will not be kept after you close it.',
}

/**
 * Why a stored V2 blob was (partly) rejected.
 *
 * UI OBLIGATION (T7/T8): every quarantine outcome must be surfaced to the learner/parent
 * (see `ProfileLoadResult.notice`). Handling it silently is not allowed.
 */
export interface ProfileQuarantine {
  /**
   * `raw-log-damaged`: the profile loaded with progress/XP/records intact; only the raw log
   * was (partly) dropped. `unreadable`: nothing usable (bad JSON, old/unknown or
   * non-numeric version, no learnerName/progress/player); the profile came from V1
   * migration or is fresh.
   * `newer-version`: the blob was written by a newer build (version > 2). It is never
   * migrated, backed up or overwritten: the store is read-only and the returned profile
   * is a fresh placeholder.
   */
  kind: 'raw-log-damaged' | 'unreadable' | 'newer-version'
  detail: string
  /**
   * The original stored blob, byte for byte. Backed up verbatim for `unreadable`; for
   * `raw-log-damaged` only its raw-log fragment is backed up (`buildRawLogFragment`).
   */
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
 * UI OBLIGATIONS (T7/T8) — the app must visibly tell the learner/parent when:
 * - `notice` is set (always set together with `quarantine`; also for `unreadable-v1-save`
 *   and `storage-unavailable`; see `PersistenceNotice`). In particular a `fresh` or
 *   `v1-migrated` profile that carries a notice must never be presented as a normal load
 *   ("saved progress could not be read").
 * - `pendingNotices` is non-empty: notices produced by this or an earlier load/save that
 *   nobody has acknowledged yet (they survive reloads). T8 shows them and calls
 *   `store.acknowledgeNotices()` once the learner/parent has seen them.
 * - `readOnly` is true (newer build's save: progress will not be saved here).
 * - `quarantine.evidenceStaleWithDamagedLog` is set (T7 decides about evidence rebuild).
 */
export interface ProfileLoadResult {
  profile: LearnerProfile
  source: ProfileLoadSource
  /** Present when the stored V2 blob was damaged/unreadable or newer. */
  quarantine?: ProfileQuarantine
  /** True when the stored blob is from a newer build: the store refuses every write. */
  readOnly?: boolean
  /**
   * The outcome to show (T0.3). Set whenever `quarantine` is. From the pure
   * `loadProfileFromStorage` (which never writes) a damaged/unreadable blob reports the
   * `*-not-backed-up` variant; `createLocalStorageStore().load()` attempts the backup and
   * reports the actual result.
   */
  notice?: PersistenceNotice
  /**
   * Unacknowledged notices, oldest first (T0.3 hardening). From the pure loader: what is
   * persisted under `PENDING_NOTICES_KEY`. From the store's load(): that list plus this
   * load's notice (kept in memory when it could not be persisted, e.g. read-only or
   * storage unavailable). Always an array; empty when there is nothing to show.
   */
  pendingNotices?: PendingNotice[]
}

/**
 * Result of a save; failures never throw into the UI (T0.1).
 *
 * UI OBLIGATIONS (T7/T8) — silent handling is not allowed:
 * - `failed` (reason `newer-version`, `quota`, `storage-unavailable`, `error`): the
 *   learner's progress is NOT being saved; show it.
 * - `saved-trimmed`: saved, but the oldest raw answer history was dropped for space
 *   (progress, evidence, XP, badges, records and levels are written in full); show it.
 * - `notice` on `saved`/`saved-trimmed` (T0.3): this save overwrote damaged or unreadable
 *   stored data that could not be backed up; show it. Also kept in `lastSaveNotice()`.
 */
export type SaveResult =
  | { status: 'saved'; notice?: SaveNotice }
  /** Storage full: saved after evicting the oldest whole raw-log sessions (D11). */
  | {
      status: 'saved-trimmed'
      droppedAttempts: number
      droppedSessions: number
      notice?: SaveNotice
    }
  | {
      status: 'failed'
      /**
       * `quota`: storage full even with an empty raw log (the previous save is kept).
       * `newer-version`: the stored blob was written by a newer build and is never
       * overwritten by this one. `storage-unavailable`: there is no usable storage (none,
       * or reading it threw at load), so nothing is written. `error`: any other
       * storage/serialization error.
       * `backup-required`: no longer produced (T0.3 — a damaged or unreadable blob whose
       * backup cannot be written no longer blocks saving; the save proceeds with a
       * `notice`). Kept in the union for compatibility.
       */
      reason: 'quota' | 'backup-required' | 'newer-version' | 'storage-unavailable' | 'error'
      error?: unknown
    }

export interface LocalProfileStore extends ProfileStore {
  save(profile: LearnerProfile): SaveResult
  clear(): SaveResult
  /** Last save/clear failure, or null when the last write succeeded. */
  lastSaveError(): Extract<SaveResult, { status: 'failed' }> | null
  /** Result of the most recent load (source, quarantine, notice), or null before load. */
  lastLoad(): ProfileLoadResult | null
  /**
   * T0.3: the notice of the save that overwrote damaged/unreadable data without a backup,
   * or null if no save has. Sticky for the store's lifetime (a later plain save does not
   * clear it), so the app can show it even if it missed that SaveResult.
   */
  lastSaveNotice(): SaveNotice | null
  /**
   * T0.3 hardening: the unacknowledged notices (persisted + in-memory), oldest first.
   * Same list as `lastLoad().pendingNotices`, kept current as saves add notices.
   */
  pendingNotices(): PendingNotice[]
  /**
   * Clear the pending notices after the learner/parent has seen them (T8). Removes
   * `PENDING_NOTICES_KEY` (not in read-only / storage-unavailable mode, which never touch
   * storage) and the in-memory list. Never throws; returns false if removal failed.
   */
  acknowledgeNotices(): boolean
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
 * - V2 wholly unreadable (bad JSON, version < 2 / non-numeric, no learnerName/progress/
 *   player): falls through to V1 migration / fresh with `quarantine` set.
 * - V2 key holds a newer version (> 2): a fresh placeholder with `readOnly: true` and
 *   `quarantine.kind 'newer-version'`; V1 is not migrated and nothing may be written.
 * - No usable V2 blob and the V1 blob exists but cannot be migrated: fresh with notice
 *   `unreadable-v1-save` (the V1 key is never written or deleted; it is its own backup).
 * - Storage missing or throwing on read: fresh with notice `storage-unavailable` (the
 *   store then refuses every write so an unread save is never overwritten).
 * Every quarantine comes with a `notice`. Never writes, so a damaged/unreadable blob reports
 * the `*-not-backed-up` notice; the store's load() backs up and reports the real outcome.
 * `pendingNotices` are read from `PENDING_NOTICES_KEY` (read-only here).
 */
export function loadProfileFromStorage(
  storage: Storage | null,
  nowMs: number = Date.now(),
): ProfileLoadResult {
  const unavailable = (): ProfileLoadResult => ({
    profile: createEmptyProfile(),
    source: 'fresh',
    notice: 'storage-unavailable',
    pendingNotices: [],
  })
  if (!storage) return unavailable()
  let v2: string | null
  try {
    v2 = storage.getItem(PROFILE_STORAGE_KEY)
  } catch {
    return unavailable()
  }
  const pendingNotices = readPendingNotices(storage)
  return { ...loadFrom(storage, v2, nowMs), pendingNotices }
}

function loadFrom(storage: Storage, v2: string | null, nowMs: number): ProfileLoadResult {
  let quarantine: ProfileQuarantine | undefined
  if (v2) {
    const r = parseStoredProfile(v2)
    if (r.kind === 'ok') return { profile: r.profile, source: 'v2' }
    if (r.kind === 'raw-log-damaged') {
      return {
        profile: r.profile,
        source: 'v2',
        notice: 'damaged-history-not-backed-up',
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
        notice: 'newer-version-read-only',
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
  const q: Pick<ProfileLoadResult, 'quarantine' | 'notice'> = quarantine
    ? { quarantine, notice: 'unreadable-save-not-backed-up' }
    : {}

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
    // V1 present but unusable. An unreadable V2 notice already says progress could not
    // be read; otherwise report the V1 failure itself (never a silent fresh start).
    if (!quarantine) {
      return { profile: createEmptyProfile(), source: 'fresh', notice: 'unreadable-v1-save' }
    }
  }

  return { profile: createEmptyProfile(), source: 'fresh', ...q }
}

/** Pending notices kept (newest win when over the cap). */
export const MAX_PENDING_NOTICES = 10

/** Parse the pending-notice record; anything malformed reads as empty. Never throws. */
export function readPendingNotices(storage: Storage | null): PendingNotice[] {
  if (!storage) return []
  const raw = safeGet(storage, PENDING_NOTICES_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (n): n is PendingNotice =>
        isObject(n) &&
        typeof n.notice === 'string' &&
        n.notice in PERSISTENCE_NOTICE_MESSAGES &&
        typeof n.atMs === 'number',
    )
  } catch {
    return []
  }
}

/** Notices that are never written to the pending-notice key. */
function isPersistableNotice(n: PersistenceNotice): boolean {
  return n !== 'newer-version-read-only' && n !== 'storage-unavailable'
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
 * T0.3: the backup payload for a raw-log-damaged V2 blob — only the damaged raw-log value
 * (still encoded, verbatim) plus minimal identifying metadata, serialized as JSON. Returns
 * null when `blob` is not a raw-log-damaged V2 blob.
 */
export function buildRawLogFragment(blob: string): string | null {
  const r = parseStoredProfile(blob)
  if (r.kind !== 'raw-log-damaged') return null
  const parsed = JSON.parse(blob) as Record<string, unknown>
  const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const fragment: RawLogFragmentBackup = {
    type: RAW_LOG_FRAGMENT_TYPE,
    profileVersion: 2,
    learnerName: typeof parsed.learnerName === 'string' ? parsed.learnerName : null,
    createdAtMs: numOrNull(parsed.createdAtMs),
    updatedAtMs: numOrNull(parsed.updatedAtMs),
    detail: r.detail,
    droppedAttempts: r.droppedAttempts,
    droppedSessions: r.droppedSessions,
    rawLog: parsed.rawLog === undefined ? null : parsed.rawLog,
  }
  return JSON.stringify(fragment)
}

/**
 * Back up a rejected V2 blob in the form D11/T0.3 prescribes: a raw-log fragment for a
 * raw-log-damaged blob, the verbatim blob for an unreadable one. Never throws; returns
 * whether the backup exists. Healthy and newer-version blobs are never passed here.
 */
function backupRejected(
  storage: Storage,
  blob: string,
  kind: 'raw-log-damaged' | 'unreadable',
  nowMs: number,
): boolean {
  try {
    const payload = kind === 'raw-log-damaged' ? (buildRawLogFragment(blob) ?? blob) : blob
    return backupRejectedBlob(storage, payload, nowMs)
  } catch {
    return false
  }
}

function noticeFor(
  kind: 'raw-log-damaged' | 'unreadable',
  backedUp: boolean,
): PersistenceNotice {
  if (kind === 'raw-log-damaged') {
    return backedUp ? 'damaged-history-backed-up' : 'damaged-history-not-backed-up'
  }
  return backedUp ? 'unreadable-save-backed-up' : 'unreadable-save-not-backed-up'
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
 * localStorage-backed store with the T0.1 + T0.3 failure-safety rules (D11):
 * - load() backs up a damaged/unreadable V2 blob to a quarantine key right away: only the
 *   raw-log fragment for a raw-log-damaged blob, the whole blob for an unreadable one;
 * - if that backup cannot be written (storage full or any other error), saving still
 *   proceeds: the current valid learner state wins over preserving damaged/unreadable
 *   data. `lastLoad().notice` reports it, and the first save that overwrites the
 *   un-backed-up data carries the same `notice` (also kept in `lastSaveNotice()`);
 * - a newer-version blob (version > 2) makes the store read-only: every save()/clear()
 *   returns `failed: newer-version` and the blob stays byte-identical;
 * - evidence is never rebuilt here and `evidenceStale` / evidence caches are never changed,
 *   neither on raw-log salvage nor on quota-driven raw-log eviction;
 * - every notice is also persisted under `PENDING_NOTICES_KEY` the moment it is produced
 *   (before the data it is about is overwritten) and surfaced on every load until
 *   `acknowledgeNotices()`; if that write fails the notice is kept in memory and saving
 *   is not blocked. Read-only and storage-unavailable modes never write it;
 * - no storage (or storage that throws on read): every save()/clear() returns
 *   `failed: storage-unavailable` and load() reports notice `storage-unavailable`;
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
  let lastNotice: SaveNotice | null = null
  /** The V2 key has been checked (any rejected blob handled) since this store began. */
  let guarded = false
  /** The V2 key holds a newer build's blob: every write is refused for this store's life. */
  let readOnly = false
  /** No usable storage: every write is refused (an unread save must never be overwritten). */
  let unavailable = storage === null
  /** The V2 key holds rejected data with no backup: reported by the save that overwrites it. */
  let pendingNotice: SaveNotice | null = null
  /** Unacknowledged notices (persisted ones plus any that could not be persisted). */
  let pending: PendingNotice[] = []

  function noteUnbacked(notice: PersistenceNotice): void {
    if (notice === 'damaged-history-not-backed-up' || notice === 'unreadable-save-not-backed-up') {
      pendingNotice = notice
    }
  }

  function mergeNotices(a: PendingNotice[], b: PendingNotice[]): PendingNotice[] {
    const out: PendingNotice[] = []
    for (const n of [...a, ...b]) if (!out.some((o) => o.notice === n.notice)) out.push(n)
    return out.slice(-MAX_PENDING_NOTICES)
  }

  /** Record a notice: in memory always, persisted when allowed. Never throws or blocks. */
  function produce(notice: PersistenceNotice): void {
    const entry: PendingNotice = { notice, atMs: now() }
    pending = mergeNotices(pending, [entry])
    if (!storage || readOnly || unavailable || !isPersistableNotice(notice)) return
    try {
      const next = mergeNotices(readPendingNotices(storage), [entry])
      storage.setItem(PENDING_NOTICES_KEY, JSON.stringify(next))
    } catch {
      // kept in memory; a failed notice write never blocks saving
    }
  }

  /**
   * Before the first overwrite (when load() did not run): back up whatever
   * damaged/unreadable blob sits at the V2 key. Only a newer-version blob refuses the write.
   */
  function guardBeforeOverwrite(s: Storage): 'newer-version' | 'storage-unavailable' | null {
    if (readOnly) return 'newer-version'
    if (unavailable) return 'storage-unavailable'
    if (guarded) return null
    let current: string | null
    try {
      current = s.getItem(PROFILE_STORAGE_KEY)
    } catch {
      unavailable = true
      produce('storage-unavailable')
      return 'storage-unavailable'
    }
    if (current) {
      const kind = parseStoredProfile(current).kind
      if (kind === 'newer-version') {
        readOnly = true
        return 'newer-version'
      }
      if (kind !== 'ok') {
        const notice = noticeFor(kind, backupRejected(s, current, kind, now()))
        produce(notice)
        noteUnbacked(notice)
      }
    }
    guarded = true
    return null
  }

  function write(profile: LearnerProfile): SaveResult {
    let result: SaveResult
    const refused = storage ? guardBeforeOverwrite(storage) : 'storage-unavailable'
    if (refused) {
      result = { status: 'failed', reason: refused }
    } else {
      result = writeProfile(storage!, profile)
      if (result.status !== 'failed' && pendingNotice) {
        result = { ...result, notice: pendingNotice }
        lastNotice = pendingNotice
        pendingNotice = null
      }
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
        let result = loadProfileFromStorage(storage, now())
        pending = mergeNotices(result.pendingNotices ?? [], pending)
        if (result.notice === 'storage-unavailable') {
          unavailable = true
        } else if (result.readOnly) {
          // Newer build's save: never backed up, migrated or overwritten.
          readOnly = true
        } else if (storage) {
          const q = result.quarantine
          if (q && q.kind !== 'newer-version') {
            const notice = noticeFor(q.kind, backupRejected(storage, q.blob, q.kind, now()))
            result = { ...result, notice }
            noteUnbacked(notice)
          }
          guarded = true
        }
        // Persist before any save can overwrite the data the notice is about.
        if (result.notice) produce(result.notice)
        result = { ...result, pendingNotices: [...pending] }
        lastLoad = result
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
    lastSaveNotice: () => lastNotice,
    pendingNotices: () => [...pending],
    acknowledgeNotices(): boolean {
      pending = []
      if (!storage || readOnly || unavailable) return true
      try {
        storage.removeItem(PENDING_NOTICES_KEY)
        return true
      } catch {
        return false
      }
    },
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
