import type {
  FactAttempt,
  FactEvidence,
  LearnerProfile,
  LevelDef,
  LevelId,
  LevelInferenceVerdict,
  PlacementProbe,
  PlacementResult,
  RawAttempt,
  SessionMode,
  StartLevelInference,
} from '../contracts'
import {
  FIRST_LEVEL_ID,
  RULES,
  SPEC_CONSTANTS,
  levelIdOf,
  levelIndexOf,
  parseFactId,
} from '../contracts'
import { CORE_FACTS, getFact } from '../content/multiplication'
import { getCurriculum, getLevel } from '../curriculum'
import {
  countedFlags,
  emptyFactEvidence,
  evaluateTableLevel,
  factStatus,
  levelAllowance,
  rebuildEvidence,
} from './advancement'
import { applyAttempt, emptyFactRecord } from './mastery'

/**
 * Placement samples across the fact space (not a single band)
 * and seeds estimated mastery + confidence into the learner profile.
 */
export interface PlacementItem {
  factId: string
  a: number
  b: number
  product: number
}

/** Spread sample: ~2–3 facts per band across core space. */
export function buildPlacementSequence(
  count = 16,
  rng: () => number = Math.random,
): PlacementItem[] {
  const byBand = new Map<number, typeof CORE_FACTS>()
  for (const f of CORE_FACTS) {
    const list = byBand.get(f.band) ?? []
    list.push(f)
    byBand.set(f.band, list)
  }

  const picks: PlacementItem[] = []
  const bands = [...byBand.keys()].sort((a, b) => a - b)
  let guard = 0
  while (picks.length < count && guard < count * 10) {
    guard++
    const band = bands[picks.length % bands.length]!
    const pool = byBand.get(band) ?? []
    if (pool.length === 0) continue
    const fact = pool[Math.floor(rng() * pool.length)]!
    if (picks.some((p) => p.factId === fact.factId)) continue
    picks.push({
      factId: fact.factId,
      a: fact.a,
      b: fact.b,
      product: fact.product,
    })
  }

  // Fill remaining from unused facts (deterministic scan — safe with fixed RNGs in tests).
  if (picks.length < count) {
    const taken = new Set(picks.map((p) => p.factId))
    for (const fact of CORE_FACTS) {
      if (picks.length >= count) break
      if (taken.has(fact.factId)) continue
      taken.add(fact.factId)
      picks.push({
        factId: fact.factId,
        a: fact.a,
        b: fact.b,
        product: fact.product,
      })
    }
  }

  return picks
}

/**
 * Apply a placement attempt with slightly higher weight on the first samples
 * so the model gets a usable prior without claiming high confidence.
 */
export function seedPlacementAttempt(
  profile: LearnerProfile,
  factId: string,
  correct: boolean,
  latencyMs: number,
  nowMs = Date.now(),
): LearnerProfile {
  const fact = getFact(factId)
  if (!fact) return profile

  if (!profile.facts[factId]) {
    profile.facts[factId] = emptyFactRecord(factId)
  }

  const attempt: FactAttempt = { correct, latencyMs, atMs: nowMs }
  profile.facts[factId] = applyAttempt(profile.facts[factId]!, attempt, nowMs)
  profile.updatedAtMs = nowMs
  return profile
}

export function completePlacement(
  profile: LearnerProfile,
  nowMs = Date.now(),
): LearnerProfile {
  profile.placementComplete = true
  profile.updatedAtMs = nowMs
  return profile
}

// ---- V2 placement staircase (D5) ---------------------------------------------------------
// The V1 exports above stay until T8. Everything below is pure: inputs are never mutated.

/** D5 staircase order while passing (L1 → L3 → L5 → L7 → L8). */
const STAIRS: readonly LevelId[] = SPEC_CONSTANTS.placementProbeLevelIndexes.map(
  (i) => levelIdOf(i),
)
/** First level above the staircase (start after passing L8). */
const ABOVE_STAIRS_LEVEL_ID: LevelId = levelIdOf(
  levelIndexOf(STAIRS[STAIRS.length - 1]!) + 1,
)

/**
 * Staircase state. T6 owns the shape; treat it as opaque outside placement and only
 * change it through `recordProbe`. JSON-serializable.
 */
export interface PlacementState {
  /** Probes asked so far with their outcome, in order. */
  asked: { probe: PlacementProbe; correct: boolean }[]
  /** Per probed level, once decided. */
  levelOutcomes: Record<LevelId, 'pass' | 'fail'>
  finished: boolean
  /** Level whose probe is in progress (null once finished). */
  probingLevelId: LevelId | null
  /** True while `probingLevelId` is a back-probe of a jumped-over level. */
  backProbe: boolean
  /** Set when finished. */
  startLevelId: LevelId | null
  /** Finished because `RULES.placementMaxQuestions` was reached before a decision. */
  hitQuestionCap: boolean
}

/** Fresh warm-up: probes L1 first. */
export function startPlacement(): PlacementState {
  return {
    asked: [],
    levelOutcomes: {},
    finished: false,
    probingLevelId: STAIRS[0]!,
    backProbe: false,
    startLevelId: null,
    hitQuestionCap: false,
  }
}

function productOf(factId: string): number {
  const { a, b } = parseFactId(factId)
  return a * b
}

/** Hardest gating fact of a level: largest product (ties → canonical ID order). */
function hardestGatingFact(level: LevelDef): string {
  let best = level.gatingFactIds[0]!
  for (const f of level.gatingFactIds) {
    const d = productOf(f) - productOf(best)
    if (d > 0 || (d === 0 && f < best)) best = f
  }
  return best
}

function answersFor(state: PlacementState, levelId: LevelId) {
  return state.asked.filter((x) => x.probe.levelId === levelId)
}

/** 2/2 pass · 0/2 fail · 1/2 → the tiebreaker decides. null = undecided. */
function decideLevel(answers: readonly boolean[]): 'pass' | 'fail' | null {
  if (answers.length < SPEC_CONSTANTS.placementProbeFacts) return null
  const [a1, a2, t] = answers
  if (a1 && a2) return 'pass'
  if (!a1 && !a2) return 'fail'
  if (t === undefined) return null
  return t ? 'pass' : 'fail'
}

/**
 * Next probe to ask, or null when the staircase has finished. Pure given `rng`: the
 * random gating fact comes from `rng`, so callers must keep the returned probe (e.g. in
 * UI state) and pass that same object to `recordProbe`, not call this again per render.
 */
export function nextProbe(
  state: PlacementState,
  rng: () => number = Math.random,
): PlacementProbe | null {
  if (state.finished || state.probingLevelId === null) return null
  if (state.asked.length >= RULES.placementMaxQuestions) return null
  const level = getLevel(state.probingLevelId)
  const asked = answersFor(state, level.id)
  const questionNumber = state.asked.length + 1
  if (asked.length === 0) {
    return {
      levelId: level.id,
      factId: hardestGatingFact(level),
      isTiebreaker: false,
      questionNumber,
    }
  }
  const used = new Set(asked.map((x) => x.probe.factId))
  const hardest = hardestGatingFact(level)
  const candidates = level.gatingFactIds.filter(
    (f) => f !== hardest && !used.has(f),
  )
  if (candidates.length === 0) return null
  const pick = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]!
  return {
    levelId: level.id,
    factId: pick,
    isTiebreaker: asked.length >= SPEC_CONSTANTS.placementProbeFacts,
    questionNumber,
  }
}

function highestPassedIndex(outcomes: Record<LevelId, 'pass' | 'fail'>): number {
  let max = 0
  for (const [id, o] of Object.entries(outcomes)) {
    if (o === 'pass') max = Math.max(max, levelIndexOf(id))
  }
  return max
}

function finish(
  state: PlacementState,
  startLevelId: LevelId,
  hitQuestionCap: boolean,
): PlacementState {
  return {
    ...state,
    finished: true,
    probingLevelId: null,
    backProbe: false,
    startLevelId,
    hitQuestionCap,
  }
}

/**
 * Record the answer to a probe. Pure: returns the new state. `correct` is correctness
 * only — slow-but-correct counts as correct (D5); latency is never read here.
 * Throws when the probe is not the one the staircase is waiting for.
 */
export function recordProbe(
  state: PlacementState,
  probe: PlacementProbe,
  correct: boolean,
): PlacementState {
  if (state.finished || state.probingLevelId === null) {
    throw new Error('placement already finished')
  }
  if (
    probe.levelId !== state.probingLevelId ||
    probe.questionNumber !== state.asked.length + 1
  ) {
    throw new Error(
      `unexpected probe ${probe.levelId}#${probe.questionNumber}; expected ${state.probingLevelId}#${state.asked.length + 1}`,
    )
  }
  let next: PlacementState = {
    ...state,
    asked: [...state.asked, { probe: { ...probe }, correct }],
    levelOutcomes: { ...state.levelOutcomes },
  }
  const k = probe.levelId
  const outcome = decideLevel(answersFor(next, k).map((x) => x.correct))

  if (outcome !== null) {
    next.levelOutcomes[k] = outcome
    const kIndex = levelIndexOf(k)
    if (next.backProbe) {
      // Back-probe of k−1 after a fail at k: start = k if it passes, else k − 1.
      return finish(next, outcome === 'pass' ? levelIdOf(kIndex + 1) : k, false)
    }
    if (outcome === 'pass') {
      const stair = STAIRS.indexOf(k)
      const following = STAIRS[stair + 1]
      if (following === undefined) return finish(next, ABOVE_STAIRS_LEVEL_ID, false)
      next = { ...next, probingLevelId: following }
    } else {
      if (kIndex === 1) return finish(next, FIRST_LEVEL_ID, false)
      const below = levelIdOf(kIndex - 1)
      if (next.levelOutcomes[below] !== undefined) return finish(next, k, false)
      next = { ...next, probingLevelId: below, backProbe: true }
    }
  }

  // Another question is needed: stop at the cap with start = lowest level not yet passed
  // (jumped-over levels below a passed probe count as passed).
  if (next.asked.length >= RULES.placementMaxQuestions) {
    return finish(next, levelIdOf(highestPassedIndex(next.levelOutcomes) + 1), true)
  }
  return next
}

/** Final result once finished (null while still running). */
export function placementResult(
  state: PlacementState,
): PlacementResult | null {
  if (!state.finished || state.startLevelId === null) return null
  const startIndex = levelIndexOf(state.startLevelId)
  const passedLevelIds: LevelId[] = []
  for (let i = 1; i < startIndex; i++) passedLevelIds.push(levelIdOf(i))

  const probedLevelIds: LevelId[] = []
  const askedFacts = new Set<string>()
  for (const { probe } of state.asked) {
    if (!probedLevelIds.includes(probe.levelId)) probedLevelIds.push(probe.levelId)
    askedFacts.add(probe.factId)
  }

  const likely = new Set<string>()
  for (const id of passedLevelIds) {
    for (const f of getLevel(id).gatingFactIds) {
      if (!askedFacts.has(f)) likely.add(f)
    }
  }
  for (const level of getCurriculum().levels) {
    for (const f of level.introFactIds) likely.add(f)
  }

  return {
    startLevelId: state.startLevelId,
    passedLevelIds,
    probedLevelIds,
    questionsAsked: state.asked.length,
    hitQuestionCap: state.hitQuestionCap,
    placementLikelyFactIds: [...likely],
  }
}

/** What T7/T8 know about one answered warm-up question. */
export interface PlacementAnswer {
  correct: boolean
  given: number | null
  latencyMs: number
  atMs: number
  /** Presented orientation (defaults to the canonical order). */
  a?: number
  b?: number
  mode?: SessionMode | null
}

/**
 * D5: a probed answer is a real raw attempt with source `placement` in a live
 * (non-inferred) placement session. T7/T8 append it to the raw log like any attempt.
 */
export function placementRawAttempt(
  probe: PlacementProbe,
  answer: PlacementAnswer,
  sessionId: string,
): RawAttempt {
  const canonical = parseFactId(probe.factId)
  return {
    factId: probe.factId,
    a: answer.a ?? canonical.a,
    b: answer.b ?? canonical.b,
    correct: answer.correct,
    given: answer.given,
    latencyMs: answer.latencyMs,
    atMs: answer.atMs,
    sessionId,
    sessionInferred: false,
    levelId: probe.levelId,
    mode: answer.mode ?? null,
    source: 'placement',
    isReplay: false,
  }
}

function unlockThrough(existing: readonly LevelId[], throughIndex: number): LevelId[] {
  const set = new Set(existing)
  for (let i = 1; i <= throughIndex; i++) set.add(levelIdOf(i))
  return [...set].sort((x, y) => levelIndexOf(x) - levelIndexOf(y))
}

/**
 * Apply a placement result: unlock (never complete) passed levels and the start level,
 * set current and placementStartLevelId, set placementLikely flags. No XP, badges or
 * records. Pure: returns a new profile.
 *
 * placementLikely is only set on facts with no counted attempts yet (the flag is
 * "cleared on the fact's first counted attempt", so it never overrides real evidence,
 * e.g. on a retake).
 */
export function applyPlacementResult(
  profile: LearnerProfile,
  result: PlacementResult,
  nowMs: number = Date.now(),
): LearnerProfile {
  const progress = profile.progress
  const factEvidence: Record<string, FactEvidence> = { ...progress.factEvidence }
  for (const f of result.placementLikelyFactIds) {
    const prev = factEvidence[f] ?? emptyFactEvidence(f)
    if (prev.countedAttempts > 0) continue
    factEvidence[f] = { ...prev, placementLikely: true }
  }
  return {
    ...profile,
    updatedAtMs: nowMs,
    placementComplete: true,
    progress: {
      ...progress,
      currentLevelId: result.startLevelId,
      unlockedLevelIds: unlockThrough(
        progress.unlockedLevelIds,
        levelIndexOf(result.startLevelId),
      ),
      placementStartLevelId: result.startLevelId,
      factEvidence,
    },
  }
}

// ---- D5b start-level inference -----------------------------------------------------------

const DAY_MS = 86_400_000

/** The part of a persistence load result inference needs (`store.lastLoad()`). */
export interface InferenceLoadContext {
  quarantine?: { evidenceStaleWithDamagedLog?: boolean } | null
}

/**
 * D5b start-level inference from raw-log attempts at most inferenceMaxAgeDays old at
 * `nowMs`, recomputed under D2 rules. Never reads v1 mastery scores. Pass
 * `store.lastLoad()` as `load`: a damaged raw log on a not-yet-rebuilt profile
 * (`evidenceStaleWithDamagedLog`) makes the result insufficient.
 */
export function inferStartLevel(
  profile: LearnerProfile,
  nowMs: number = Date.now(),
  load?: InferenceLoadContext | null,
): StartLevelInference {
  const cutoff = nowMs - RULES.inferenceMaxAgeDays * DAY_MS
  const attempts = profile.rawLog.attempts.filter(
    (x) => x.atMs >= cutoff && x.atMs <= nowMs,
  )

  if (load?.quarantine?.evidenceStaleWithDamagedLog) {
    return {
      outcome: 'insufficient',
      recommendedLevelId: null,
      verdicts: [],
      attemptsConsidered: attempts.length,
      masteredFactIds: [],
    }
  }

  // D2 recompute over the windowed raw log only (fast-track needs a live session; rule (b) does not).
  const rebuilt = rebuildEvidence(
    { attempts, sessions: profile.rawLog.sessions },
    { ...profile.progress, factEvidence: {}, evidence: {} },
  )
  const ev = rebuilt.factEvidence
  const flags = countedFlags(attempts)
  const counted = attempts.filter((_, i) => flags[i])

  const tableLevels = getCurriculum().levels.filter((l) => l.kind === 'table')
  const verdicts: LevelInferenceVerdict[] = tableLevels.map((level) => {
    const gating = new Set(level.gatingFactIds)
    const n = gating.size
    const needed = n - levelAllowance(n)
    let withEnough = 0
    for (const f of gating) {
      if ((ev[f]?.countedAttempts ?? 0) >= RULES.inferenceMinAttemptsPerFact) withEnough++
    }
    const evidenced = withEnough >= needed

    let total = 0
    let correct = 0
    for (const x of counted) {
      if (!gating.has(x.factId)) continue
      total++
      if (x.correct) correct++
    }
    const accuracy = total > 0 ? correct / total : 0
    const checks = evaluateTableLevel(level, ev, [], 0)
    const passes =
      evidenced &&
      checks.r1.pass &&
      checks.r2.pass &&
      checks.r3.pass &&
      accuracy >= SPEC_CONSTANTS.inferencePassAccuracy
    const clearlyFails =
      evidenced &&
      (checks.r2.strugglingGatingFactIds.length >=
        SPEC_CONSTANTS.clearFailMinStrugglingGating ||
        (total >= RULES.clearFailMinAttempts && accuracy < RULES.clearFailAccuracy))
    return { levelId: level.id, evidenced, passes, clearlyFails }
  })

  const masteredFactIds = Object.values(ev)
    .filter((e) => factStatus(e) === 'mastered')
    .map((e) => e.factId)
    .sort()
  const base = { verdicts, attemptsConsidered: attempts.length, masteredFactIds }

  const sIdx = verdicts.findIndex((v) => !v.passes)
  if (sIdx === -1) {
    return { ...base, outcome: 'recommend', recommendedLevelId: ABOVE_STAIRS_LEVEL_ID }
  }
  const s = verdicts[sIdx]!
  const laterPasses = verdicts.slice(sIdx + 1).some((v) => v.passes)
  if (!verdicts[0]!.evidenced || (!s.evidenced && laterPasses)) {
    return { ...base, outcome: 'insufficient', recommendedLevelId: null }
  }
  if (s.clearlyFails && laterPasses) {
    return { ...base, outcome: 'contradictory', recommendedLevelId: null }
  }
  return { ...base, outcome: 'recommend', recommendedLevelId: s.levelId }
}

/**
 * Apply a 'recommend' inference: unlock L1..s, current = s, inferredStartLevelId = s,
 * set everMastered silently. No XP, badges, records or celebrations. Other outcomes: no-op.
 * Pure: returns a new profile (the same object for a no-op).
 */
export function applyStartLevelInference(
  profile: LearnerProfile,
  inference: StartLevelInference,
): LearnerProfile {
  if (inference.outcome !== 'recommend' || inference.recommendedLevelId === null) {
    return profile
  }
  const s = inference.recommendedLevelId
  const progress = profile.progress
  const factEvidence: Record<string, FactEvidence> = { ...progress.factEvidence }
  for (const f of inference.masteredFactIds) {
    const prev = factEvidence[f] ?? emptyFactEvidence(f)
    if (!prev.everMastered) factEvidence[f] = { ...prev, everMastered: true }
  }
  return {
    ...profile,
    progress: {
      ...progress,
      currentLevelId: s,
      unlockedLevelIds: unlockThrough(progress.unlockedLevelIds, levelIndexOf(s)),
      inferredStartLevelId: s,
      factEvidence,
    },
  }
}

// ---- D4 drop-down offer ------------------------------------------------------------------

export interface DropDownOffer {
  /** Offer (never force) moving to `toLevelId`. */
  offer: boolean
  /** The placement- or inference-recommended start level evaluated (null if none). */
  fromLevelId: LevelId | null
  toLevelId: LevelId | null
  /** First sessions at the start level considered (≤ RULES.dropDownOfferSessions). */
  sessions: number
  /** Draw accuracy over those sessions (null when not yet enough sessions). */
  accuracy: number | null
}

/**
 * D4: if the first `RULES.dropDownOfferSessions` finished play sessions at a placement-
 * or inference-recommended start level have draw accuracy < `RULES.dropDownOfferAccuracy`,
 * offer (never force) the level below. Never at L1. Only while that level is current.
 * The placement start wins over the inferred start when both exist (the warm-up is the
 * later recalibration). Pure; the UI decides whether to show it and persists dismissal.
 */
export function dropDownOffer(profile: LearnerProfile): DropDownOffer {
  const progress = profile.progress
  const start = progress.placementStartLevelId ?? progress.inferredStartLevelId ?? null
  const none: DropDownOffer = {
    offer: false,
    fromLevelId: start,
    toLevelId: null,
    sessions: 0,
    accuracy: null,
  }
  if (start === null) return none
  const startIndex = levelIndexOf(start)
  if (startIndex <= 1 || progress.currentLevelId !== start) return none

  const first = profile.rawLog.sessions
    .filter(
      (s) => s.kind === 'play' && s.endReason === 'finished' && s.levelId === start,
    )
    .sort((x, y) => x.startedAtMs - y.startedAtMs)
    .slice(0, RULES.dropDownOfferSessions)
  if (first.length < RULES.dropDownOfferSessions) {
    return { ...none, sessions: first.length }
  }
  const ids = new Set(first.map((s) => s.id))
  let answers = 0
  let correct = 0
  for (const x of profile.rawLog.attempts) {
    if (x.source !== 'draw' || !ids.has(x.sessionId)) continue
    answers++
    if (x.correct) correct++
  }
  const accuracy = answers > 0 ? correct / answers : null
  const offer = accuracy !== null && accuracy < RULES.dropDownOfferAccuracy
  return {
    offer,
    fromLevelId: start,
    toLevelId: offer ? levelIdOf(startIndex - 1) : null,
    sessions: first.length,
    accuracy,
  }
}
