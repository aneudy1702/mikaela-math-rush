/**
 * V3 household persistence. Writes `math-rush:household-v3` only.
 * The V2 key is read for the one-time map and is never written or deleted.
 */

import type { Household, LearnerProfileV3 } from '../contracts'
import { HOUSEHOLD_STORAGE_KEY } from '../contracts'
import { PROFILE_STORAGE_KEY, deserializeProfile } from './storage'
import { applyHouseholdMigration } from './householdMigration'

export const HOUSEHOLD_QUARANTINE_PREFIX = 'math-rush:household-v3-quarantine-'
export const HOUSEHOLD_NOTICES_KEY = 'math-rush:household-notices'

export type HouseholdNotice = 'unreadable-household' | 'unreadable-v2' | 'save-failed'

export interface HouseholdLoadResult {
  household: Household
  migrated: boolean
  notice?: HouseholdNotice
  quarantineKey?: string
}

export interface HouseholdSaveResult {
  status: 'saved' | 'failed'
  notice?: HouseholdNotice
}

const EMPTY: Household = { activeLearnerId: null, learners: {} }

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function parseHousehold(json: string): Household | null {
  try {
    const value = JSON.parse(json) as Partial<Household>
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (value.learners == null || typeof value.learners !== 'object') return null
    if (value.activeLearnerId !== null && typeof value.activeLearnerId !== 'string') return null
    return value as Household
  } catch {
    return null
  }
}

function quarantine(storage: Storage, blob: string, nowMs: number): string | undefined {
  const key = `${HOUSEHOLD_QUARANTINE_PREFIX}${nowMs}`
  try {
    storage.setItem(key, blob)
    return key
  } catch {
    return undefined
  }
}

export function loadHousehold(
  storage: Storage,
  options: { nowMs: number; learnerId: string },
): HouseholdLoadResult {
  const v2Before = read(storage, PROFILE_STORAGE_KEY)
  const raw = read(storage, HOUSEHOLD_STORAGE_KEY)

  if (raw !== null) {
    const parsed = parseHousehold(raw)
    if (!parsed) {
      const quarantineKey = quarantine(storage, raw, options.nowMs)
      return { household: EMPTY, migrated: false, notice: 'unreadable-household', quarantineKey }
    }
    if (parsed.migration?.completed) {
      return { household: parsed, migrated: false }
    }
  }

  if (v2Before === null) return { household: EMPTY, migrated: false }

  const v2 = deserializeProfile(v2Before)
  if (!v2) return { household: EMPTY, migrated: false, notice: 'unreadable-v2' }

  const migrated = applyHouseholdMigration({
    household: raw ? parseHousehold(raw) : null,
    v2Profile: v2,
    nowMs: options.nowMs,
    learnerId: options.learnerId,
  })
  const saved = saveHousehold(storage, migrated.household)
  if (saved.status === 'failed') {
    return { household: migrated.household, migrated: false, notice: 'save-failed' }
  }
  return { household: migrated.household, migrated: migrated.ran }
}

export function saveHousehold(storage: Storage, household: Household): HouseholdSaveResult {
  try {
    storage.setItem(HOUSEHOLD_STORAGE_KEY, JSON.stringify(household))
    return { status: 'saved' }
  } catch {
    return { status: 'failed', notice: 'save-failed' }
  }
}

/** Replace one learner. Other learners stay as they are. */
export function upsertLearner(household: Household, learner: LearnerProfileV3): Household {
  return {
    ...household,
    learners: { ...household.learners, [learner.identity.id]: learner },
  }
}
