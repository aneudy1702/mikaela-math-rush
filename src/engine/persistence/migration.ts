/**
 * V1 → V2 profile migration (D5b steps 1–2, D9, D11).
 *
 * - Every v1 `recentAttempts` entry goes into the raw log (source draw, levelId null,
 *   sessionInferred true); nothing is filtered here (the 30-day window and start-level
 *   inference are T6).
 * - Sessions are reconstructed by the migration-only gap rule: attempts sorted by time,
 *   a gap ≥ RULES.inferenceSessionGapMs starts a new session. IDs are synthetic, marked inferred.
 * - Fact keys are re-canonicalized (D9) and stray keys merged.
 * - gameXp → player.xp (no XP awarded); dailyStreak / lastPlayDayKey / placementComplete kept;
 *   mode-only bests dropped (D3); pendingReinforcements outside the core 1–10 space dropped.
 * - v1 mastery/confidence are NOT carried into V2 evidence (`progress.factEvidence` stays
 *   empty and `evidenceStale` is set so the evidence view is rebuilt from the raw log).
 *   The legacy `facts` map is kept only for the deprecated V1 runtime until T8.
 */

import type {
  FactAttempt,
  FactRecord,
  LearnerProfile,
  LearnerProfileV1,
  PendingReinforcement,
  RawAttempt,
  ReinforcementState,
  SessionRecord,
} from '../contracts'
import { RULES, canonicalFactId, isCoreFactId } from '../contracts'
import {
  MASTERY_CONFIG,
  computeMastery,
  createEmptyPlayerProgress,
  createEmptyProfile,
  createEmptySkillProgress,
} from '../learning'

/** Prefix of synthetic session IDs created by migration. */
export const INFERRED_SESSION_PREFIX = 'v1-inferred-'

const REINFORCEMENT_STATES: readonly ReinforcementState[] = [
  'none',
  'pending',
  'due',
  'check-pending',
  'check-due',
]

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** Structural check for a V1 blob (lenient on missing optional fields). */
export function isV1ProfileLike(value: unknown): value is LearnerProfileV1 {
  return isObject(value) && value.version === 1 && isObject(value.facts)
}

/**
 * Re-canonicalize a legacy fact key ("8x7", "07x8", "8 × 7" → "7x8").
 * Returns null for anything that is not a fact with factors 1–12.
 */
export function normalizeLegacyFactKey(key: string): string | null {
  const m = /^\s*0*(\d{1,2})\s*[xX×*]\s*0*(\d{1,2})\s*$/.exec(key)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  try {
    return canonicalFactId(a, b)
  } catch {
    return null
  }
}

function sanitizeAttempt(v: unknown): FactAttempt | null {
  if (!isObject(v)) return null
  const atMs = v.atMs
  if (typeof atMs !== 'number' || !Number.isFinite(atMs)) return null
  return {
    correct: v.correct === true,
    latencyMs: Math.max(0, finiteOr(v.latencyMs, 0)),
    atMs,
  }
}

function recentAttemptsOf(rec: unknown): { valid: FactAttempt[]; total: number } {
  if (!isObject(rec) || !Array.isArray(rec.recentAttempts)) {
    return { valid: [], total: 0 }
  }
  const valid: FactAttempt[] = []
  for (const a of rec.recentAttempts) {
    const s = sanitizeAttempt(a)
    if (s) valid.push(s)
  }
  return { valid, total: rec.recentAttempts.length }
}

function sanitizeRecord(factId: string, rec: unknown): FactRecord {
  const r = isObject(rec) ? rec : {}
  const recent = recentAttemptsOf(r).valid
  const reinforcement = REINFORCEMENT_STATES.includes(
    r.reinforcement as ReinforcementState,
  )
    ? (r.reinforcement as ReinforcementState)
    : 'none'
  return {
    factId,
    attempts: Math.max(recent.length, finiteOr(r.attempts, recent.length)),
    correct: Math.max(0, finiteOr(r.correct, recent.filter((a) => a.correct).length)),
    recentAttempts: recent,
    mastery: finiteOr(r.mastery, 0),
    confidence: finiteOr(r.confidence, 0),
    avgLatencyMs: finiteOr(r.avgLatencyMs, 0),
    lastPracticedAtMs:
      typeof r.lastPracticedAtMs === 'number' && Number.isFinite(r.lastPracticedAtMs)
        ? r.lastPracticedAtMs
        : null,
    reinforcement,
  }
}

/** Merge several legacy records of one canonical fact (stray keys). */
function mergeRecords(factId: string, records: FactRecord[]): FactRecord {
  if (records.length === 1) return { ...records[0]!, factId }
  const attempts = records.reduce((s, r) => s + r.attempts, 0)
  const correct = records.reduce((s, r) => s + r.correct, 0)
  const recent = records
    .flatMap((r) => r.recentAttempts)
    .sort((x, y) => x.atMs - y.atMs)
    .slice(-MASTERY_CONFIG.recentWindowSize)
  const lastTimes = records
    .map((r) => r.lastPracticedAtMs)
    .filter((t): t is number => t != null)
  const lastPracticedAtMs = lastTimes.length ? Math.max(...lastTimes) : null
  const avgLatencyMs =
    attempts > 0
      ? records.reduce((s, r) => s + r.avgLatencyMs * r.attempts, 0) / attempts
      : 0
  const { mastery, confidence } =
    lastPracticedAtMs != null
      ? computeMastery(recent, lastPracticedAtMs, lastPracticedAtMs)
      : { mastery: 0, confidence: 0 }
  const reinforcement =
    records.map((r) => r.reinforcement).find((s) => s !== 'none') ?? 'none'
  return {
    factId,
    attempts,
    correct,
    recentAttempts: recent,
    mastery,
    confidence,
    avgLatencyMs,
    lastPracticedAtMs,
    reinforcement,
  }
}

/** D6 player level for an XP total: largest L with factor·L·(L−1) ≤ xp. */
function playerLevelForXp(xp: number): number {
  const f = RULES.xp.levelCurveFactor
  let level = 1
  while (f * (level + 1) * level <= xp) level++
  return level
}

interface PendingAttempt {
  factId: string
  attempt: FactAttempt
  order: number
}

/**
 * D5b step 2: sort by time; a gap ≥ gapMs starts a new session.
 * Returns raw attempts (chronological) and their inferred session records.
 */
export function reconstructInferredSessions(
  items: readonly { factId: string; attempt: FactAttempt }[],
  gapMs: number = RULES.inferenceSessionGapMs,
): { attempts: RawAttempt[]; sessions: SessionRecord[] } {
  const sorted: PendingAttempt[] = items
    .map((it, order) => ({ ...it, order }))
    .sort((x, y) => x.attempt.atMs - y.attempt.atMs || x.order - y.order)

  const attempts: RawAttempt[] = []
  const sessions: SessionRecord[] = []
  let current: SessionRecord | null = null
  let prevAt = -Infinity
  for (const { factId, attempt } of sorted) {
    if (current === null || attempt.atMs - prevAt >= gapMs) {
      current = {
        id: `${INFERRED_SESSION_PREFIX}${sessions.length + 1}`,
        kind: 'play',
        startedAtMs: attempt.atMs,
        endedAtMs: attempt.atMs,
        mode: null,
        levelId: null,
        inferred: true,
        endReason: 'inferred',
        isReplay: false,
        pauses: [],
        discardedOnHide: [],
      }
      sessions.push(current)
    }
    current.endedAtMs = attempt.atMs
    prevAt = attempt.atMs
    attempts.push({
      factId,
      a: null,
      b: null,
      correct: attempt.correct,
      given: null,
      latencyMs: attempt.latencyMs,
      atMs: attempt.atMs,
      sessionId: current.id,
      sessionInferred: true,
      levelId: null,
      mode: null,
      source: 'draw',
      isReplay: false,
    })
  }
  return { attempts, sessions }
}

/** Migrate a V1 blob (already JSON-parsed) to a V2 profile. Pure; never touches storage. */
export function migrateV1ToV2(
  v1: LearnerProfileV1,
  nowMs: number = Date.now(),
): LearnerProfile {
  const learnerName =
    typeof v1.learnerName === 'string' ? v1.learnerName : 'Mikaela'
  const createdAtMs = finiteOr(v1.createdAtMs, nowMs)
  const base = createEmptyProfile(learnerName, createdAtMs)

  // ---- facts: re-canonicalize, merge stray keys, collect raw attempts --------------
  const grouped = new Map<string, FactRecord[]>()
  const rawItems: { factId: string; attempt: FactAttempt }[] = []
  const mergedFactKeys: string[] = []
  const droppedFactKeys: string[] = []
  let v1Attempts = 0

  for (const [key, rec] of Object.entries(v1.facts ?? {})) {
    const { valid, total } = recentAttemptsOf(rec)
    v1Attempts += total
    const canonical = normalizeLegacyFactKey(key)
    if (!canonical) {
      droppedFactKeys.push(key)
      continue
    }
    if (canonical !== key) mergedFactKeys.push(key)
    const list = grouped.get(canonical) ?? []
    list.push(sanitizeRecord(canonical, rec))
    grouped.set(canonical, list)
    for (const attempt of valid) rawItems.push({ factId: canonical, attempt })
  }

  const facts: Record<string, FactRecord> = { ...base.facts }
  for (const [factId, records] of grouped) {
    facts[factId] = mergeRecords(factId, records)
  }

  const rawLog = reconstructInferredSessions(rawItems)

  // ---- pending reinforcements: canonical, core 1–10 only ---------------------------
  const pendingReinforcements: PendingReinforcement[] = []
  let droppedPendingReinforcements = 0
  for (const p of Array.isArray(v1.pendingReinforcements)
    ? v1.pendingReinforcements
    : []) {
    const factId =
      isObject(p) && typeof p.factId === 'string'
        ? normalizeLegacyFactKey(p.factId)
        : null
    const kind = isObject(p) ? p.kind : undefined
    if (
      !factId ||
      !isCoreFactId(factId) ||
      (kind !== 'reintroduce' && kind !== 'later-check')
    ) {
      droppedPendingReinforcements++
      continue
    }
    pendingReinforcements.push({
      factId,
      kind,
      dueInQuestions: Math.max(0, finiteOr(p.dueInQuestions, 0)),
    })
  }

  const gameXp = Math.max(0, finiteOr(v1.gameXp, 0))

  return {
    ...base,
    version: 2,
    learnerName,
    createdAtMs,
    updatedAtMs: finiteOr(v1.updatedAtMs, nowMs),
    placementComplete: Boolean(v1.placementComplete),
    dailyStreak: Math.max(0, finiteOr(v1.dailyStreak, 0)),
    lastPlayDayKey:
      typeof v1.lastPlayDayKey === 'string' ? v1.lastPlayDayKey : null,
    pendingReinforcements,
    progress: {
      ...createEmptySkillProgress(),
      evidenceStale: rawLog.attempts.length > 0,
    },
    rawLog,
    records: {},
    sessionLog: [],
    player: {
      ...createEmptyPlayerProgress(),
      xp: gameXp,
      level: playerLevelForXp(gameXp),
    },
    migration: {
      fromVersion: 1,
      migratedAtMs: nowMs,
      v1Attempts,
      migratedAttempts: rawLog.attempts.length,
      inferredSessions: rawLog.sessions.length,
      mergedFactKeys,
      droppedFactKeys,
      droppedPendingReinforcements,
    },
    facts,
    bestTimeMsByMode: {},
    bestStreakByMode: {},
    gameXp,
  }
}
