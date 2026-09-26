import type {
  AdvancementResult,
  EvidenceBufferEntry,
  EvidenceWindowEntry,
  FactComebackEvent,
  FactEvidence,
  FactMasteredEvent,
  FactStatus,
  LevelCompletionChecks,
  LevelDef,
  LevelId,
  MixedLevelChecks,
  ProgressionEvent,
  RawAttempt,
  RawLog,
  SkillProgress,
  TableLevelChecks,
} from '../contracts'
import { RULES, SPEC_CONSTANTS, levelIndexOf } from '../contracts'

/**
 * D2 fact status, counted attempts, level completion (R1–R5, L9 option B + V4),
 * D10 evidence marks and the D11 evidence view (rebuilt from the raw log).
 *
 * Every function is pure. `latencyMs` is read in exactly one place —
 * `recentCorrectLatenciesMs` (stage-2 fluency selection input) — and never by status,
 * counting, marks, buffers or completion (D12 exact invariant).
 */

/** How many S(C) session IDs a FactEvidence keeps (only `length ≥ minDistinctSessionsForMastery` is read). */
const CORRECT_SESSION_IDS_KEPT = Math.max(4, RULES.minDistinctSessionsForMastery)

/** Status value shown for a mastered fact (D10 clarification): distinct from any mark count. */
export const MASTERED_DISPLAY_VALUE = RULES.marksMax + 1

// ---- counted attempts ------------------------------------------------------------------

/** Counted flag per raw attempt (same order): no earlier miss of the same fact in the same session. */
export function countedFlags(rawLog: readonly RawAttempt[]): boolean[] {
  const missed = new Set<string>()
  const flags: boolean[] = []
  for (const a of rawLog) {
    const key = `${a.sessionId}\u0000${a.factId}`
    flags.push(!missed.has(key))
    if (!a.correct) missed.add(key)
  }
  return flags
}

/** The counted attempts of a raw log, chronological. */
export function countedAttempts(rawLog: readonly RawAttempt[]): RawAttempt[] {
  const flags = countedFlags(rawLog)
  return rawLog.filter((_, i) => flags[i])
}

// ---- per-fact evidence ------------------------------------------------------------------

/** Evidence for a fact with no attempts (status new). */
export function emptyFactEvidence(factId: string): FactEvidence {
  return {
    factId,
    countedAttempts: 0,
    countedCorrect: 0,
    window: [],
    correctSessionIds: [],
    liveCorrectSession: false,
    recentCorrectLatenciesMs: [],
    lastAttemptAtMs: null,
    everMastered: false,
    placementLikely: false,
  }
}

/**
 * Fold one raw attempt into a fact's evidence. `counted` comes from countedFlags.
 * Updates everMastered (never unsets) and clears placementLikely on the first counted attempt.
 */
export function applyAttemptToEvidence(
  evidence: FactEvidence,
  attempt: RawAttempt,
  counted: boolean,
): FactEvidence {
  const next: FactEvidence = {
    ...evidence,
    window: evidence.window.slice(),
    correctSessionIds: evidence.correctSessionIds.slice(),
    recentCorrectLatenciesMs: evidence.recentCorrectLatenciesMs.slice(),
    lastAttemptAtMs:
      evidence.lastAttemptAtMs === null
        ? attempt.atMs
        : Math.max(evidence.lastAttemptAtMs, attempt.atMs),
  }

  if (counted) {
    next.countedAttempts += 1
    if (attempt.correct) next.countedCorrect += 1
    const entry: EvidenceWindowEntry = {
      correct: attempt.correct,
      sessionId: attempt.sessionId,
      sessionInferred: attempt.sessionInferred,
      atMs: attempt.atMs,
    }
    next.window.push(entry)
    if (next.window.length > RULES.windowSize) {
      next.window.splice(0, next.window.length - RULES.windowSize)
    }
    if (attempt.correct) {
      if (!next.correctSessionIds.includes(attempt.sessionId)) {
        next.correctSessionIds.push(attempt.sessionId)
        if (next.correctSessionIds.length > CORRECT_SESSION_IDS_KEPT) {
          next.correctSessionIds.splice(
            0,
            next.correctSessionIds.length - CORRECT_SESSION_IDS_KEPT,
          )
        }
      }
      if (!attempt.sessionInferred) next.liveCorrectSession = true
    }
    next.placementLikely = false
  }

  // Stage-2 fluency input only (any source, counted or not). Never read by status.
  if (attempt.correct) {
    next.recentCorrectLatenciesMs.push(attempt.latencyMs)
    const max = RULES.fluencySlowness.sampleSize
    if (next.recentCorrectLatenciesMs.length > max) {
      next.recentCorrectLatenciesMs.splice(
        0,
        next.recentCorrectLatenciesMs.length - max,
      )
    }
  }

  if (!next.everMastered && factStatus(next) === 'mastered') {
    next.everMastered = true
  }
  return next
}

function correctInWindow(evidence: FactEvidence): number {
  let c = 0
  for (const e of evidence.window) if (e.correct) c++
  return c
}

/** D2 status (undefined evidence = new). Latency is never read. */
export function factStatus(evidence: FactEvidence | undefined): FactStatus {
  if (!evidence || evidence.countedAttempts === 0) return 'new'
  const w = evidence.window.length
  const cW = correctInWindow(evidence)
  const spaced =
    evidence.correctSessionIds.length >= RULES.minDistinctSessionsForMastery
  // (a) fast-track: every counted attempt correct, spaced, at least one live session.
  if (
    evidence.countedAttempts >= RULES.fastTrackMinAttempts &&
    evidence.countedCorrect === evidence.countedAttempts &&
    spaced &&
    evidence.liveCorrectSession
  ) {
    return 'mastered'
  }
  // (b) ≥ 3 correct in the last 4 counted, spacing over all counted correct attempts (V1).
  if (
    w >= RULES.masteredMinCorrectInWindow &&
    cW >= RULES.masteredMinCorrectInWindow &&
    spaced
  ) {
    return 'mastered'
  }
  if (w >= RULES.struggleMinAttempts && cW <= RULES.struggleMaxCorrectInWindow) {
    return 'struggling'
  }
  return 'learning'
}

/** D10 evidence marks: 0 if new/struggling, else min(RULES.marksMax, cW). Mastered facts render a distinct state. */
export function factMarks(evidence: FactEvidence | undefined): number {
  const status = factStatus(evidence)
  if (!evidence || status === 'new' || status === 'struggling') return 0
  return Math.min(RULES.marksMax, correctInWindow(evidence))
}

/**
 * D10 display value (owner clarification): MASTERED_DISPLAY_VALUE (4) if mastered, else
 * factMarks (0–3). Falls back to the marks when mastery drops.
 */
export function factDisplayValue(evidence: FactEvidence | undefined): number {
  return factStatus(evidence) === 'mastered'
    ? MASTERED_DISPLAY_VALUE
    : factMarks(evidence)
}

/** D2 step 5 likely-correct (success floor). */
export function isLikelyCorrect(evidence: FactEvidence | undefined): boolean {
  if (!evidence) return false
  if (evidence.placementLikely) return true
  if (factStatus(evidence) === 'mastered') return true
  if (evidence.countedAttempts < SPEC_CONSTANTS.likelyMinCountedAttempts) {
    return false
  }
  const w = evidence.window.length
  return w > 0 && correctInWindow(evidence) / w >= SPEC_CONSTANTS.likelyMinAccuracy
}

// ---- level completion ---------------------------------------------------------------------

/** a = max(RULES.allowanceMin, ⌊RULES.allowanceFraction · n⌋). */
export function levelAllowance(gatingCount: number): number {
  return Math.max(
    RULES.allowanceMin,
    Math.floor(RULES.allowanceFraction * gatingCount),
  )
}

function accuracyOf(entries: readonly EvidenceBufferEntry[]): number {
  let c = 0
  for (const e of entries) if (e.correct) c++
  return c / entries.length
}

/** D2 R1–R5 for a table level (L1–L8). */
export function evaluateTableLevel(
  level: LevelDef,
  factEvidence: Readonly<Record<string, FactEvidence>>,
  buffer: readonly EvidenceBufferEntry[],
  finishedSessionsAtLevel: number,
): TableLevelChecks {
  const gating = level.gatingFactIds
  const n = gating.length
  const allowance = levelAllowance(n)
  const required = Math.max(0, n - allowance)
  let mastered = 0
  const strugglingGatingFactIds: string[] = []
  for (const id of gating) {
    const s = factStatus(factEvidence[id])
    if (s === 'mastered') mastered++
    else if (s === 'struggling') strugglingGatingFactIds.push(id)
  }
  const strugglingTableFactIds = level.tableFactIds.filter(
    (id) => factStatus(factEvidence[id]) === 'struggling',
  )

  const r1 = { n, allowance, mastered, required, pass: mastered >= required }
  const r2 = {
    strugglingGatingFactIds,
    pass: strugglingGatingFactIds.length === 0,
  }
  const r3 = {
    strugglingTableFactIds,
    pass: strugglingTableFactIds.length <= RULES.maxStrugglingTableFacts,
  }
  let r4: TableLevelChecks['r4']
  if (buffer.length >= RULES.levelAccuracyWindow) {
    const window = buffer.slice(buffer.length - RULES.levelAccuracyWindow)
    const accuracy = accuracyOf(window)
    r4 = {
      answers: window.length,
      accuracy,
      pass: accuracy >= RULES.levelAccuracyMin,
    }
  } else {
    r4 = { answers: buffer.length, accuracy: null, pass: false }
  }
  const r5 = {
    sessions: finishedSessionsAtLevel,
    pass: finishedSessionsAtLevel >= RULES.minSessionsAtLevel,
  }
  return {
    kind: 'table',
    r1,
    r2,
    r3,
    r4,
    r5,
    pass: r1.pass && r2.pass && r3.pass && r4.pass && r5.pass,
  }
}

/** D2 L9 rule (option B + V4) over the L9 evidence buffer; `factIds` = all 55 core facts. */
export function evaluateMixedLevel(
  buffer: readonly EvidenceBufferEntry[],
  factEvidence: Readonly<Record<string, FactEvidence>>,
  factIds: readonly string[],
): MixedLevelChecks {
  const strugglingFactIds = factIds.filter(
    (id) => factStatus(factEvidence[id]) === 'struggling',
  )

  // V4: shortest suffix with ≥ mixedMinAnswers answers AND ≥ mixedMinSessions sessions.
  const sessions = new Set<string>()
  let start = -1
  for (let i = buffer.length - 1; i >= 0; i--) {
    sessions.add(buffer[i]!.sessionId)
    if (
      buffer.length - i >= RULES.mixedMinAnswers &&
      sessions.size >= RULES.mixedMinSessions
    ) {
      start = i
      break
    }
  }
  if (start < 0) {
    return { kind: 'mixed', window: null, strugglingFactIds, pass: false }
  }
  const suffix = buffer.slice(start)
  const accuracy = accuracyOf(suffix)
  const days = new Set(suffix.map((e) => e.dayKey)).size
  const window = {
    answers: suffix.length,
    sessions: sessions.size,
    days,
    accuracy,
  }
  const pass =
    accuracy >= RULES.mixedAccuracyMin &&
    days >= RULES.mixedMinDays &&
    strugglingFactIds.length <= RULES.mixedMaxStruggling
  return { kind: 'mixed', window, strugglingFactIds, pass }
}

// ---- evidence view (D11) -------------------------------------------------------------------

/** Local calendar day key YYYY-MM-DD (same format as the session/day streak key). */
function localDayKey(atMs: number): string {
  const d = new Date(atMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The per-level evidence buffer entry for a counted draw at a level; null when it does not belong in a buffer. */
export function evidenceBufferEntryFor(
  attempt: RawAttempt,
  counted: boolean,
): EvidenceBufferEntry | null {
  if (!counted || attempt.source !== 'draw' || attempt.levelId === null) {
    return null
  }
  return {
    factId: attempt.factId,
    correct: attempt.correct,
    sessionId: attempt.sessionId,
    dayKey: localDayKey(attempt.atMs),
  }
}

/** Append to a level buffer, keeping the last RULES.evidenceBufferMax entries. Returns a new array. */
export function appendEvidenceBuffer(
  buffer: readonly EvidenceBufferEntry[],
  entry: EvidenceBufferEntry,
): EvidenceBufferEntry[] {
  const next = [...buffer, entry]
  return next.length > RULES.evidenceBufferMax
    ? next.slice(next.length - RULES.evidenceBufferMax)
    : next
}

/**
 * Recompute the evidence view (factEvidence, evidence buffers, finishedSessionsByLevel)
 * from the raw log under current RULES. everMastered / placementLikely are carried from
 * `progress` (everMastered is also set by replay). Returns progress with evidenceStale false.
 *
 * placementLikely is carried verbatim: the cached flag already reflects every clearing
 * that happened after it was set, so replaying attempts older than the flag must not
 * clear it again.
 *
 * Must run ONLY when `evidenceStale` is true (v1 migration, where the raw log is complete).
 * Never after raw-log eviction, quota trimming or quarantine/salvage: the caches are then
 * authoritative and a rebuild would roll status back (DECISIONS D11 erratum).
 */
export function rebuildEvidence(
  rawLog: RawLog,
  progress: SkillProgress,
): SkillProgress {
  const flags = countedFlags(rawLog.attempts)
  const factEvidence: Record<string, FactEvidence> = {}
  const evidence: Record<LevelId, EvidenceBufferEntry[]> = {}

  rawLog.attempts.forEach((attempt, i) => {
    const counted = flags[i]!
    const prev =
      factEvidence[attempt.factId] ?? emptyFactEvidence(attempt.factId)
    factEvidence[attempt.factId] = applyAttemptToEvidence(prev, attempt, counted)
    const entry = evidenceBufferEntryFor(attempt, counted)
    if (entry && attempt.levelId !== null) {
      const buf = evidence[attempt.levelId] ?? []
      buf.push(entry)
      evidence[attempt.levelId] = buf
    }
  })
  for (const [levelId, buf] of Object.entries(evidence)) {
    if (buf.length > RULES.evidenceBufferMax) {
      evidence[levelId] = buf.slice(buf.length - RULES.evidenceBufferMax)
    }
  }

  // Carry the two non-recomputable flags.
  for (const [factId, prior] of Object.entries(progress.factEvidence)) {
    const rebuilt = factEvidence[factId] ?? emptyFactEvidence(factId)
    factEvidence[factId] = {
      ...rebuilt,
      everMastered: rebuilt.everMastered || prior.everMastered,
      placementLikely: prior.placementLikely,
    }
  }

  const finishedSessionsByLevel: Record<LevelId, number> = {}
  for (const s of rawLog.sessions) {
    if (s.kind !== 'play' || s.endReason !== 'finished' || s.levelId === null) {
      continue
    }
    finishedSessionsByLevel[s.levelId] =
      (finishedSessionsByLevel[s.levelId] ?? 0) + 1
  }

  return {
    ...progress,
    factEvidence,
    evidence,
    finishedSessionsByLevel,
    evidenceStale: false,
  }
}

/**
 * Comeback Kid events for one session (D6): a fact missed in an earlier session whose
 * first attempt in this session (always counted) is correct.
 */
export function detectComebacks(
  rawLog: readonly RawAttempt[],
  sessionId: string,
): FactComebackEvent[] {
  /** factId → most recent earlier session with a miss. */
  const lastMissSession = new Map<string, string>()
  const seenInSession = new Set<string>()
  const events: FactComebackEvent[] = []
  for (const a of rawLog) {
    if (a.sessionId === sessionId) {
      if (seenInSession.has(a.factId)) continue
      seenInSession.add(a.factId)
      const missedIn = lastMissSession.get(a.factId)
      if (a.correct && missedIn !== undefined) {
        events.push({
          type: 'fact-comeback',
          atMs: a.atMs,
          sessionId,
          factId: a.factId,
          missedInSessionId: missedIn,
        })
      }
    } else if (!a.correct) {
      lastMissSession.set(a.factId, a.sessionId)
    }
  }
  return events
}

/**
 * D10 session-level visible progress: Σ factDisplayValue over a level's table facts
 * (mastered = 4, else marks 0–3; DECISIONS D10 owner clarification).
 */
export function levelMarksTotal(
  level: LevelDef,
  factEvidence: Readonly<Record<string, FactEvidence>>,
): number {
  let total = 0
  for (const id of level.tableFactIds) total += factDisplayValue(factEvidence[id])
  return total
}

// ---- session-end advancement ----------------------------------------------------------------

export interface AdvancementInput {
  /** Progress at session start. */
  before: SkillProgress
  /** Progress after folding in the session's attempts (evidence up to date). */
  after: SkillProgress
  level: LevelDef
  /** Next level on the ladder (null at the top). */
  nextLevel: LevelDef | null
  /** All core fact IDs (L9 struggling guard). */
  allFactIds: readonly string[]
  sessionId: string
  atMs: number
}

/** Completion checks for any level kind (L10 speed never completes, D7). */
export function evaluateLevelCompletion(
  level: LevelDef,
  progress: SkillProgress,
  allFactIds: readonly string[],
): LevelCompletionChecks {
  const buffer = progress.evidence[level.id] ?? []
  switch (level.kind) {
    case 'table':
      return evaluateTableLevel(
        level,
        progress.factEvidence,
        buffer,
        progress.finishedSessionsByLevel[level.id] ?? 0,
      )
    case 'mixed':
      return evaluateMixedLevel(buffer, progress.factEvidence, allFactIds)
    default:
      return { kind: 'none', pass: false }
  }
}

/**
 * Session-end completion + level-up (D2, D4). Pure: returns the result; caller applies it.
 * Comeback events need the raw log and come from `detectComebacks` (not included here).
 */
export function evaluateAdvancement(input: AdvancementInput): AdvancementResult {
  const { before, after, level, nextLevel, sessionId, atMs } = input
  const checks = evaluateLevelCompletion(level, after, input.allFactIds)
  const wasCompleted = before.completedLevelIds.includes(level.id)
  const passed = checks.pass
  const newlyCompleted = passed && !wasCompleted

  let unlockedLevelId: LevelId | null = null
  let currentLevelId = before.currentLevelId
  if (newlyCompleted && nextLevel) {
    if (!before.unlockedLevelIds.includes(nextLevel.id)) {
      unlockedLevelId = nextLevel.id
    }
    // Level-up moves current forward only (never back below a placement/inference start).
    if (nextLevel.index > levelIndexOf(before.currentLevelId)) {
      currentLevelId = nextLevel.id
    }
  }

  const newlyMasteredFactIds = Object.values(after.factEvidence)
    .filter((e) => e.everMastered && !before.factEvidence[e.factId]?.everMastered)
    .map((e) => e.factId)
    .sort()
  const newlyMastered = new Set(newlyMasteredFactIds)

  const events: ProgressionEvent[] = []
  const masteredEvents: FactMasteredEvent[] = []
  for (const e of Object.values(after.factEvidence)) {
    const becameMastered =
      factStatus(e) === 'mastered' &&
      factStatus(before.factEvidence[e.factId]) !== 'mastered'
    if (becameMastered || newlyMastered.has(e.factId)) {
      masteredEvents.push({
        type: 'fact-mastered',
        atMs,
        sessionId,
        factId: e.factId,
        levelId: level.id,
        firstTime: newlyMastered.has(e.factId),
      })
    }
  }
  masteredEvents.sort((x, y) => (x.factId < y.factId ? -1 : x.factId > y.factId ? 1 : 0))
  events.push(...masteredEvents)
  if (newlyCompleted) {
    events.push({ type: 'level-completed', atMs, sessionId, levelId: level.id })
  }
  if (unlockedLevelId) {
    events.push({
      type: 'level-unlocked',
      atMs,
      sessionId,
      levelId: unlockedLevelId,
      reason: 'completion',
    })
  }

  return {
    skillId: after.skillId,
    levelId: level.id,
    evaluatedAtMs: atMs,
    wasCompleted,
    passed,
    newlyCompleted,
    unlockedLevelId,
    currentLevelId,
    checks,
    newlyMasteredFactIds,
    events,
  }
}
