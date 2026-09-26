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
import { capRawLog, decodeRawLog, encodeRawLog } from './rawLog'

/** Profile V2 key (D11 / PLAN T0). */
export const PROFILE_STORAGE_KEY = 'mikaela-math-rush:learner-v2'
/** V1 key: read for migration only; never written or deleted (backup). */
export const LEGACY_V1_STORAGE_KEY = 'mikaela-math-rush:learner-v1'

export interface ProfileStore {
  load(): LearnerProfile
  save(profile: LearnerProfile): void
  clear(): void
}

export type ProfileLoadSource = 'v2' | 'v1-migrated' | 'fresh'

export interface ProfileLoadResult {
  profile: LearnerProfile
  source: ProfileLoadSource
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Serialize for storage: raw log capped (D11) and compactly encoded. */
export function serializeProfile(profile: LearnerProfile): string {
  const rawLog = capRawLog(profile.rawLog ?? { attempts: [], sessions: [] })
  return JSON.stringify({ ...profile, rawLog: encodeRawLog(rawLog) })
}

/** Parse a stored V2 blob. Returns null when the blob is corrupt or not V2. */
export function deserializeProfile(json: string): LearnerProfile | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!isObject(parsed)) return null
    if (
      parsed.version !== 2 ||
      typeof parsed.learnerName !== 'string' ||
      !isObject(parsed.facts)
    ) {
      return null
    }
    const rawLog: RawLog =
      parsed.rawLog === undefined
        ? { attempts: [], sessions: [] }
        : decodeRawLog(parsed.rawLog)
    return rehydrateProfile({ ...parsed, rawLog } as unknown as LearnerProfile)
  } catch {
    return null
  }
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
 * A corrupt V2 blob falls through to V1 migration, then to fresh. Never writes.
 */
export function loadProfileFromStorage(
  storage: Storage | null,
  nowMs: number = Date.now(),
): ProfileLoadResult {
  if (!storage) return { profile: createEmptyProfile(), source: 'fresh' }

  const v2 = safeGet(storage, PROFILE_STORAGE_KEY)
  if (v2) {
    const profile = deserializeProfile(v2)
    if (profile) return { profile, source: 'v2' }
  }

  const v1 = safeGet(storage, LEGACY_V1_STORAGE_KEY)
  if (v1) {
    try {
      const parsed: unknown = JSON.parse(v1)
      if (isV1ProfileLike(parsed)) {
        return { profile: migrateV1ToV2(parsed, nowMs), source: 'v1-migrated' }
      }
    } catch {
      // fall through to fresh
    }
  }

  return { profile: createEmptyProfile(), source: 'fresh' }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function createLocalStorageStore(
  storage: Storage | null = defaultStorage(),
): ProfileStore {
  return {
    load(): LearnerProfile {
      try {
        return loadProfileFromStorage(storage).profile
      } catch {
        return createEmptyProfile()
      }
    },
    save(profile: LearnerProfile): void {
      if (!storage) return
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(profile))
    },
    /** Reset to a fresh profile. Writes a fresh V2 blob; the V1 backup is left untouched. */
    clear(): void {
      if (!storage) return
      storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(createEmptyProfile()))
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
 * without wiping known fact history.
 */
export function rehydrateProfile(raw: LearnerProfile): LearnerProfile {
  const base = createEmptyProfile(raw.learnerName, raw.createdAtMs)
  const rawLog = raw.rawLog
  return {
    ...base,
    ...raw,
    version: 2,
    facts: { ...base.facts, ...raw.facts },
    bestTimeMsByMode: { ...raw.bestTimeMsByMode },
    bestStreakByMode: { ...raw.bestStreakByMode },
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
