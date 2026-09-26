import type {
  FactRecord,
  LearnerProfile,
  PlayerProgress,
  SelectionBucket,
  SelectionStrategy,
  SessionMode,
  SkillProgress,
} from '../contracts'
import { DEFAULT_SELECTION_STRATEGY, FIRST_LEVEL_ID } from '../contracts'
import {
  CORE_FACTS,
  MULTIPLICATION_SKILL_ID,
  STRETCH_FACTS,
} from '../content/multiplication'
import {
  MASTERY_CONFIG,
  emptyFactRecord,
  isHighConfidence,
  isStrongFact,
} from './mastery'

export function createEmptyProfile(
  learnerName = 'Mikaela',
  nowMs = Date.now(),
): LearnerProfile {
  const facts: Record<string, FactRecord> = {}
  for (const f of CORE_FACTS) {
    facts[f.factId] = emptyFactRecord(f.factId)
  }
  return {
    version: 2,
    learnerName,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    placementComplete: false,
    dailyStreak: 0,
    lastPlayDayKey: null,
    pendingReinforcements: [],
    progress: createEmptySkillProgress(),
    rawLog: { attempts: [], sessions: [] },
    records: {},
    sessionLog: [],
    player: createEmptyPlayerProgress(),
    // Deprecated V1 compat fields (removed in T8).
    facts,
    bestTimeMsByMode: {},
    bestStreakByMode: {},
    gameXp: 0,
  }
}

/** Fresh curriculum position: L1 current and unlocked, no evidence. */
export function createEmptySkillProgress(
  skillId: string = MULTIPLICATION_SKILL_ID,
): SkillProgress {
  return {
    skillId,
    currentLevelId: FIRST_LEVEL_ID,
    unlockedLevelIds: [FIRST_LEVEL_ID],
    completedLevelIds: [],
    factEvidence: {},
    evidence: {},
    finishedSessionsByLevel: {},
    evidenceStale: false,
  }
}

export function createEmptyPlayerProgress(): PlayerProgress {
  return {
    xp: 0,
    level: 1,
    badges: [],
    finishedLevelModes: [],
    recordsBeaten: 0,
    lastRecordXpDayKey: null,
  }
}

export function dayKey(nowMs: number): string {
  const d = new Date(nowMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  dt.setDate(dt.getDate() - 1)
  return dayKey(dt.getTime())
}

/** Bump calendar-day play streak when a session finishes. */
export function touchDailyStreak(
  profile: LearnerProfile,
  nowMs = Date.now(),
): void {
  const today = dayKey(nowMs)
  if (profile.lastPlayDayKey === today) return
  if (profile.lastPlayDayKey && previousDayKey(today) === profile.lastPlayDayKey) {
    profile.dailyStreak = Math.max(1, profile.dailyStreak) + 1
  } else {
    profile.dailyStreak = 1
  }
  profile.lastPlayDayKey = today
}

export function ensureFact(
  profile: LearnerProfile,
  factId: string,
): FactRecord {
  if (!profile.facts[factId]) {
    profile.facts[factId] = emptyFactRecord(factId)
  }
  return profile.facts[factId]!
}

export function classifyFact(
  record: FactRecord | undefined,
): SelectionBucket {
  if (!record || record.attempts === 0) return 'target'
  if (!isHighConfidence(record)) return 'target'
  if (isStrongFact(record)) {
    if (record.mastery >= MASTERY_CONFIG.masteredThreshold) return 'review'
    return 'challenge'
  }
  if (record.mastery < 0.45) return 'target'
  return 'challenge'
}

export function bucketFacts(
  profile: LearnerProfile,
  stretch = false,
): Record<SelectionBucket, string[]> {
  const pool = stretch ? STRETCH_FACTS : CORE_FACTS
  const buckets: Record<SelectionBucket, string[]> = {
    review: [],
    target: [],
    challenge: [],
    stretch: [],
  }

  const knownIds = new Set(pool.map((f) => f.factId))

  for (const fact of pool) {
    const record = profile.facts[fact.factId]
    const bucket = classifyFact(record)
    buckets[bucket].push(fact.factId)
  }

  // Stretch: high-band facts with low exposure when learner is strong overall.
  const strongCount = Object.values(profile.facts).filter(isStrongFact).length
  if (strongCount >= 20) {
    for (const fact of STRETCH_FACTS) {
      if (knownIds.has(fact.factId) && fact.band < 6) continue
      const record = profile.facts[fact.factId]
      if (!record || record.attempts < 3 || !isStrongFact(record)) {
        if (!buckets.stretch.includes(fact.factId)) {
          buckets.stretch.push(fact.factId)
        }
      }
    }
  }

  return buckets
}

function pickWeightedBucket(
  strategy: SelectionStrategy,
  available: SelectionBucket[],
  rng: () => number,
): SelectionBucket {
  const weights: Record<SelectionBucket, number> = {
    review: strategy.reviewWeight,
    target: strategy.targetWeight,
    challenge: strategy.challengeWeight,
    stretch: strategy.stretchWeight,
  }
  const usable = available.filter((b) => weights[b] > 0)
  if (usable.length === 0) return 'target'
  const total = usable.reduce((s, b) => s + weights[b], 0)
  let roll = rng() * total
  for (const b of usable) {
    roll -= weights[b]
    if (roll <= 0) return b
  }
  return usable[usable.length - 1]!
}

export interface SelectionResult {
  factId: string
  bucket: SelectionBucket
  cognitiveDifficulty: number
}

/**
 * Adaptive selection: weights, not quotas.
 * Never force an empty bucket — falls through to whatever candidates exist.
 */
export function selectNextFact(
  profile: LearnerProfile,
  options: {
    strategy?: SelectionStrategy
    recentFactIds?: string[]
    avoidDuplicates?: boolean
    rng?: () => number
    stretch?: boolean
  } = {},
): SelectionResult {
  const strategy = options.strategy ?? DEFAULT_SELECTION_STRATEGY
  const rng = options.rng ?? Math.random
  const recent = new Set(options.recentFactIds ?? [])
  const buckets = bucketFacts(profile, options.stretch)

  const nonEmpty = (
    Object.entries(buckets) as [SelectionBucket, string[]][]
  )
    .filter(([, ids]) => ids.length > 0)
    .map(([b]) => b)

  let bucket = pickWeightedBucket(strategy, nonEmpty, rng)
  let candidates = buckets[bucket]

  // Prefer avoiding recent duplicates within the chosen bucket.
  if (options.avoidDuplicates !== false && recent.size > 0) {
    const filtered = candidates.filter((id) => !recent.has(id))
    if (filtered.length > 0) {
      candidates = filtered
    } else {
      // Try other non-empty buckets before repeating.
      for (const alt of nonEmpty) {
        if (alt === bucket) continue
        const altFiltered = buckets[alt].filter((id) => !recent.has(id))
        if (altFiltered.length > 0) {
          bucket = alt
          candidates = altFiltered
          break
        }
      }
    }
  }

  if (candidates.length === 0) {
    candidates = CORE_FACTS.map((f) => f.factId)
    bucket = 'target'
  }

  const factId = candidates[Math.floor(rng() * candidates.length)]!
  const record = profile.facts[factId]
  const cognitiveDifficulty = difficultyForBucket(bucket, record)

  return { factId, bucket, cognitiveDifficulty }
}

function difficultyForBucket(
  bucket: SelectionBucket,
  record: FactRecord | undefined,
): number {
  switch (bucket) {
    case 'review':
      return 0.35
    case 'target':
      return record && record.attempts > 0 ? 0.55 : 0.45
    case 'challenge':
      return 0.7
    case 'stretch':
      return 0.9
  }
}

export function awardGameXp(profile: LearnerProfile, amount: number): void {
  // Explicitly separate from academic mastery.
  profile.gameXp = Math.max(0, profile.gameXp + amount)
}

export function recordBest(
  profile: LearnerProfile,
  mode: SessionMode,
  timeMs: number,
  streak: number,
): {
  newTimeRecord: boolean
  newStreakRecord: boolean
  previousBestTimeMs: number | null
} {
  const prevTime = profile.bestTimeMsByMode[mode] ?? null
  const prevStreak = profile.bestStreakByMode[mode] ?? 0
  const newTimeRecord = prevTime == null || timeMs < prevTime
  const newStreakRecord = streak > prevStreak
  if (newTimeRecord) profile.bestTimeMsByMode[mode] = timeMs
  if (newStreakRecord) profile.bestStreakByMode[mode] = streak
  return { newTimeRecord, newStreakRecord, previousBestTimeMs: prevTime }
}
