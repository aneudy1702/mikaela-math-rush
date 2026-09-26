import type { LearnerProfile } from '../contracts'
import { createEmptyProfile } from '../learning'

export const PROFILE_STORAGE_KEY = 'mikaela-math-rush:learner-v1'

export interface ProfileStore {
  load(): LearnerProfile
  save(profile: LearnerProfile): void
  clear(): void
}

function isValidProfile(value: unknown): value is LearnerProfile {
  if (!value || typeof value !== 'object') return false
  const p = value as LearnerProfile
  return (
    p.version === 1 &&
    typeof p.learnerName === 'string' &&
    typeof p.facts === 'object' &&
    p.facts != null &&
    typeof p.gameXp === 'number'
  )
}

export function createLocalStorageStore(
  storage: Storage | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): ProfileStore {
  return {
    load(): LearnerProfile {
      if (!storage) return createEmptyProfile()
      try {
        const raw = storage.getItem(PROFILE_STORAGE_KEY)
        if (!raw) return createEmptyProfile()
        const parsed: unknown = JSON.parse(raw)
        if (!isValidProfile(parsed)) return createEmptyProfile()
        return rehydrateProfile(parsed)
      } catch {
        return createEmptyProfile()
      }
    },
    save(profile: LearnerProfile): void {
      if (!storage) return
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
    },
    clear(): void {
      if (!storage) return
      storage.removeItem(PROFILE_STORAGE_KEY)
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

/**
 * Rehydrate after JSON parse — restore missing fields with safe defaults
 * without wiping known fact mastery.
 */
export function rehydrateProfile(raw: LearnerProfile): LearnerProfile {
  const base = createEmptyProfile(raw.learnerName, raw.createdAtMs)
  return {
    ...base,
    ...raw,
    version: 1,
    facts: { ...base.facts, ...raw.facts },
    bestTimeMsByMode: { ...raw.bestTimeMsByMode },
    bestStreakByMode: { ...raw.bestStreakByMode },
    dailyStreak:
      typeof raw.dailyStreak === 'number' ? raw.dailyStreak : 0,
    lastPlayDayKey:
      typeof raw.lastPlayDayKey === 'string' ? raw.lastPlayDayKey : null,
    gameXp: raw.gameXp ?? 0,
    placementComplete: Boolean(raw.placementComplete),
    pendingReinforcements: Array.isArray(raw.pendingReinforcements)
      ? raw.pendingReinforcements
      : [],
  }
}
