import type {
  AttemptSource,
  BadgeAward,
  FactEvidence,
  FactStatus,
  LearnerProfile,
  LevelDef,
  LevelId,
  MarksProgress,
  MathSkill,
  PendingReinforcement,
  ProgressionEvent,
  Question,
  RawAttempt,
  RecordEvaluation,
  SessionMode,
  SessionRecord,
  SessionResultSummaryV2,
  SkillCurriculum,
  SkillProgress,
  XpBreakdown,
} from '../contracts'
import { SESSION_LENGTHS, recordKeyId } from '../contracts'
import { getCurriculum, getLevel, nextLevel } from '../curriculum'
import {
  appendEvidenceBuffer,
  applyAttemptToEvidence,
  detectComebacks,
  emptyFactEvidence,
  evaluateAdvancement,
  evidenceBufferEntryFor,
  factDisplayValue,
  factStatus,
  levelMarksTotal,
  rebuildEvidence,
} from '../learning/advancement'
import { touchDailyStreak } from '../learning/selection'
import {
  LevelQuestionOrchestrator,
  type LevelPick,
  type SelectionRngs,
} from '../orchestrator'
import type {
  PersistenceNotice,
  ProfileLoadResult,
  SaveResult,
} from '../persistence'
import {
  evaluateBadges,
  isRecordXpAvailableToday,
  levelForXp,
  progressLevelId,
  xpForSession,
} from '../progression'
import {
  appendSessionLog,
  applyRecordEvaluation,
  buildSessionLogEntry,
  evaluateRecord,
  recordKey,
} from '../records'

/**
 * T7 — V2 level session engine (DECISIONS D2, D3, D4, D6, D10, D11).
 *
 * Built alongside the legacy `SessionEngine` (session.ts), which the current App keeps
 * using until T8. This engine is the integration seam of T1–T6: level-scoped selection
 * (T5), evidence + completion (T4), records + session log (T2), XP + badges (T3).
 *
 * Lifecycle (one instance per session; the clock starts at construction):
 *
 *   const engine = new LevelSessionEngine({ profile, skill, mode, levelId, load: store.lastLoad() })
 *   let q = engine.nextQuestion()                  // show q.question
 *   const out = engine.answer(q.question.id, value) // correct → next; wrong → out.reveal (UI card)
 *   if (out.saveRecommended) store.save(engine.checkpoint())
 *   q = engine.nextQuestion()                      // after the reveal card is dismissed
 *   …
 *   // visibilitychange: engine.hide() → store.save(engine.checkpoint()); later engine.resume()
 *   if (engine.isComplete()) { const summary = engine.finish(); store.save(engine.getProfile()) }
 *   // leaving early: engine.abandon(); store.save(engine.getProfile())
 *
 * T8 OBLIGATIONS
 * - Construct only for levels in `progress.unlockedLevelIds` and never for L10 (deferred,
 *   D7); use `canStartLevel` to decide what the ladder offers. The constructor throws otherwise.
 * - Pass `store.lastLoad()` as `load` so a damaged raw log on a not-yet-rebuilt profile is
 *   flagged (`startInfo.evidenceStaleWithDamagedLog`, alert `evidence-stale-damaged-log`)
 *   and load notices reach the UI.
 * - Persist at the save points only (see "Saving" below); never encode the profile per answer.
 * - Hand every `SaveResult` back through `reportSaveResult` and show every returned
 *   `PersistenceAlert` (D11 persistence invariant). `persistenceAlerts()` keeps them.
 * - Wrong answer: show `AnswerOutcome.reveal` until the kid taps it / "Got it" / Enter, then
 *   call `nextQuestion()`. The clock keeps running during the reveal (D3). Never ask for a retype.
 * - On `visibilitychange` hidden → `hide()`; visible → `resume()` (draws a fresh question).
 *   Answers for a discarded question are rejected (`answer` throws for a stale questionId).
 * - Results: render `SessionResultSummaryV2`. "Baseline set" when `record.isBaseline`
 *   (never "NEW RECORD!"); pace/best/record moments only when `recordVisible`.
 * - `player.xp` is the only XP source. This engine never writes the deprecated `gameXp`
 *   (the legacy engine still does until T8 removes it); UI must read `player.xp`.
 * - The engine copies the input profile and then mutates its own copy in place per answer.
 *   Treat `getProfile()` as engine-owned while the session runs: save it, but clone it before
 *   putting it into React state. After `finish()`/`abandon()` it is the new app profile.
 * - A v1-migrated profile keeps `evidenceStale: true` (empty caches) until its first V2
 *   session starts; this engine is the only rebuild path (D11 erratum), so screens shown
 *   before that session see empty fact evidence.
 *
 * Saving (D11: don't re-encode the raw log on every answer). Save the profile returned by
 * `checkpoint()` / `getProfile()` at exactly these points:
 * 1. session end — after `finish()` or `abandon()` (always);
 * 2. `hide()` — the app may be killed while hidden;
 * 3. every `SAVE_EVERY_ANSWERS` answers (`AnswerOutcome.saveRecommended`), so a long Rush
 *    run loses at most that many answers. A Quick run (10) therefore saves at its end only.
 * A mid-session save persists an open session record (endReason null). If the app dies,
 * the next engine start closes it as `abandoned` (raw attempts kept, nothing earned).
 */

/** Save cadence inside a session (answers). See "Saving" above. */
export const SAVE_EVERY_ANSWERS = 10

/** Kinds of level this sprint can play (L10 speed challenge is DEFERRED, D7). */
function isDeferredLevel(level: LevelDef): boolean {
  return level.kind === 'speed'
}

/**
 * Question source the engine drives (the T5 orchestrator). Injectable only so tests can
 * replay a recorded pick sequence (D12 exact invariant); production uses the default.
 */
export interface SessionQuestionSource {
  seedPending(pending: readonly PendingReinforcement[]): number
  nextQuestion(factEvidence: Readonly<Record<string, FactEvidence>>): {
    question: Question
    pick: LevelPick
  }
  recordAnswer(factId: string, source: AttemptSource, correct: boolean): void
  discardLast(): boolean
  exportPending(): PendingReinforcement[]
}

export interface QuestionSourceContext {
  skill: MathSkill
  levelId: LevelId
  mode: SessionMode
  rngs: SelectionRngs
  curriculum: SkillCurriculum
}

export interface LevelSessionOptions {
  profile: LearnerProfile
  skill: MathSkill
  mode: SessionMode
  levelId: LevelId
  /** Wall clock (default Date.now). Read at every call; the session starts at construction. */
  clock?: () => number
  /** Selection RNG streams: `main` (stage 1, pool, queue delays) and `fluency` (stage 2 only). Default Math.random. */
  rngs?: Partial<SelectionRngs>
  /** Default: generated. Must be unique in the raw log and must not use the migration prefix. */
  sessionId?: string
  curriculum?: SkillCurriculum
  /** `store.lastLoad()`. With stale evidence its damaged-log flag still rebuilds from the salvaged log (D11 clarification); its notice is surfaced. */
  load?: Pick<ProfileLoadResult, 'quarantine' | 'notice' | 'pendingNotices' | 'readOnly'> | null
  /**
   * @internal Simulations only; production callers must not pass this.
   * Default false: the engine works on a structured clone and never mutates the caller's
   * object. true: the engine takes ownership of `profile` (simulations; avoids a copy).
   */
  adoptProfile?: boolean
  /**
   * @internal Test seam (D12 replay). Production callers must not pass this.
   * Default: `new LevelQuestionOrchestrator(ctx)`.
   */
  questionSource?: (ctx: QuestionSourceContext) => SessionQuestionSource
}

/** What happened when the session started (for T8 notices / diagnostics). */
export interface SessionStartInfo {
  /** `progress.evidenceStale` was set and the evidence view was rebuilt from the raw log (D11 erratum (a)). */
  rebuiltEvidence: boolean
  /**
   * The stored profile was not yet rebuilt (`evidenceStale`) and its raw log was damaged and
   * salvaged (`load.quarantine.evidenceStaleWithDamagedLog`). Lead ruling: the evidence IS
   * rebuilt from the salvaged log (the stale caches were never computed, so keeping them would
   * silently wipe the v1-derived evidence) and `evidenceStale` is cleared; history lost to the
   * damage cannot be recovered, so T8 must show the `evidence-stale-damaged-log` alert.
   * `rebuiltEvidence` is true in this case too. No XP/events come from rebuilt mastery (the
   * session's `before` snapshot is taken after the rebuild).
   */
  evidenceStaleWithDamagedLog: boolean
  /** Carried reinforcement items outside current + earlier levels (dropped, D2 step 2). */
  droppedPending: number
  /** Open sessions left by a crash after a mid-session save, closed as `abandoned`. */
  closedDanglingSessions: number
}

export interface CurrentQuestion {
  question: Question
  factId: string
  source: LevelPick['source']
  /** 0-based index among answered questions (= answers so far). */
  index: number
  total: number
  shownAtMs: number
}

/** D3 soft reveal card content (no retype). */
export interface MissReveal {
  factId: string
  /** e.g. "7 × 8 = 56" */
  text: string
  expected: unknown
  given: number | null
}

export interface AnswerOutcome {
  correct: boolean
  attempt: RawAttempt
  /** D2 counted attempt (no earlier miss of this fact in this session). */
  counted: boolean
  statusAfter: FactStatus
  /** D10 display value after the answer (4 = mastered, else marks 0–3). */
  displayValueAfter: number
  /** Present on a wrong answer: show until tapped, then call `nextQuestion()`. */
  reveal: MissReveal | null
  streak: number
  answered: number
  total: number
  /** Every question answered: call `finish()` (after the reveal, if any). */
  sessionComplete: boolean
  /** Save point 3 (every SAVE_EVERY_ANSWERS answers). */
  saveRecommended: boolean
}

export interface LevelSessionSnapshot {
  sessionId: string
  levelId: LevelId
  mode: SessionMode
  total: number
  answered: number
  correct: number
  streak: number
  longestStreak: number
  /** Real elapsed time so far, visibility pauses excluded. */
  elapsedMs: number
  hidden: boolean
  state: 'playing' | 'finished' | 'abandoned'
  current: CurrentQuestion | null
  /** The last answer's reveal until the next question is drawn. */
  reveal: MissReveal | null
}

export interface AbandonResult {
  sessionId: string
  answered: number
  elapsedMs: number
}

/** A persistence outcome T8 must show (D11 persistence invariant). */
export type PersistenceAlert =
  | { kind: 'save-failed'; reason: Extract<SaveResult, { status: 'failed' }>['reason'] }
  | { kind: 'save-trimmed'; droppedAttempts: number; droppedSessions: number }
  | { kind: 'notice'; notice: PersistenceNotice }
  | { kind: 'read-only' }
  | { kind: 'evidence-stale-damaged-log' }

export interface LevelProgressFact {
  factId: string
  status: FactStatus
  /** D10: 4 = mastered, else marks 0–3. */
  displayValue: number
  gating: boolean
}

/** Whether a V2 play session may start at `levelId` (unlocked, not deferred L10). */
export function canStartLevel(
  profile: LearnerProfile,
  levelId: LevelId,
  curriculum: SkillCurriculum = getCurriculum(profile.progress.skillId),
): boolean {
  let level: LevelDef
  try {
    level = getLevel(levelId, curriculum)
  } catch {
    return false
  }
  return !isDeferredLevel(level) && profile.progress.unlockedLevelIds.includes(levelId)
}

function presentedFactor(question: Question, key: 'a' | 'b'): number | null {
  const v = question.metadata?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function numericGiven(given: unknown): number | null {
  const n = typeof given === 'number' ? given : Number(given)
  return typeof given !== 'boolean' && given !== null && given !== '' && Number.isFinite(n) ? n : null
}

/** "7 × 8 = 56" in the presented orientation. */
function revealText(question: Question, expected: unknown): string {
  const prompt = question.prompt
  const lhs = prompt.type === 'expression' ? prompt.expression : prompt.type === 'text' ? prompt.text : prompt.alt
  return `${lhs} = ${String(expected)}`
}

function defaultSessionId(nowMs: number): string {
  return `s-${nowMs.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/** Snapshot of the progress fields settlement compares against (fact evidence objects are immutable). */
function snapshotProgress(p: SkillProgress): SkillProgress {
  return {
    ...p,
    unlockedLevelIds: p.unlockedLevelIds.slice(),
    completedLevelIds: p.completedLevelIds.slice(),
    factEvidence: { ...p.factEvidence },
    evidence: { ...p.evidence },
    finishedSessionsByLevel: { ...p.finishedSessionsByLevel },
  }
}

/** Close open sessions left behind by a crash after a mid-session save (→ abandoned). */
function closeDanglingSessions(profile: LearnerProfile): number {
  let closed = 0
  for (const s of profile.rawLog.sessions) {
    if (s.endReason !== null || s.inferred || s.kind !== 'play') continue
    let end = s.startedAtMs
    for (const a of profile.rawLog.attempts) {
      if (a.sessionId === s.id && a.atMs > end) end = a.atMs
    }
    s.endedAtMs = end
    s.endReason = 'abandoned'
    for (const p of s.pauses) if (p.endedAtMs === null) p.endedAtMs = Math.max(p.startedAtMs, end)
    closed++
  }
  return closed
}

// ---- session-end settlement -------------------------------------------------------------

export interface SettleInput {
  sessionId: string
  skillId: string
  level: LevelDef
  curriculum: SkillCurriculum
  /** Progress snapshot taken when the session started (after any evidence rebuild). */
  before: SkillProgress
  longestStreak: number
  /** Selection queue to carry over (orchestrator.exportPending()). */
  pendingAfter: PendingReinforcement[]
}

export interface SettleResult {
  summary: SessionResultSummaryV2
}

/**
 * D2/D3/D4/D6/D10 session-end pipeline for a finished play session. Mutates `profile`.
 * The session record must already be closed (`endReason 'finished'`) and every attempt
 * applied to the evidence view.
 *
 * Idempotent by sessionId: returns null (and changes nothing) when the session was already
 * applied (its log entry exists) or is not eligible — only `kind 'play'`, non-inferred,
 * `finished` sessions earn anything (placement / inferred / abandoned never do).
 */
export function settleFinishedSession(
  profile: LearnerProfile,
  input: SettleInput,
): SettleResult | null {
  const { sessionId, level, before } = input
  const session = profile.rawLog.sessions.find((s) => s.id === sessionId)
  if (!session || session.kind !== 'play' || session.inferred || session.endReason !== 'finished') {
    return null
  }
  if (profile.sessionLog.some((e) => e.sessionId === sessionId)) return null
  if (session.levelId !== level.id || session.mode === null) return null
  const mode = session.mode
  const progress = profile.progress
  const endMs = session.endedAtMs ?? session.startedAtMs
  const isReplay = before.completedLevelIds.includes(level.id)

  // R5 counts this finished session.
  progress.finishedSessionsByLevel = {
    ...progress.finishedSessionsByLevel,
    [level.id]: (progress.finishedSessionsByLevel[level.id] ?? 0) + 1,
  }

  // D3 session log (raw session answers).
  const entry = buildSessionLogEntry(session, profile.rawLog.attempts, {
    skillId: input.skillId,
    longestStreak: input.longestStreak,
  })
  profile.sessionLog = appendSessionLog(profile.sessionLog, entry)

  // D3 records: key skill + level + mode + rulesVersion; baseline first; strict less-than.
  const events: ProgressionEvent[] = []
  const progressLevel = progressLevelId(before)
  const isProgressLevel = progressLevel === level.id
  const keyId = recordKeyId(recordKey(entry.skillId, entry.levelId, entry.mode, entry.rulesVersion))
  const existing = profile.records[keyId]
  const record: RecordEvaluation = evaluateRecord(existing, entry)
  const updated = applyRecordEvaluation(existing, entry, record)
  if (updated) profile.records = { ...profile.records, [keyId]: updated }
  if (record.isBaseline) {
    events.push({ type: 'baseline-set', atMs: endMs, sessionId, key: record.key, baselineMs: entry.elapsedMs })
  } else if (record.isNewRecord && record.previousBestMs !== null) {
    events.push({
      type: 'record-beaten',
      atMs: endMs,
      sessionId,
      key: record.key,
      previousBestMs: record.previousBestMs,
      newBestMs: entry.elapsedMs,
      levelCompleted: isReplay,
      isProgressLevel,
    })
  }

  // D2 completion + D4 level-up (never into the deferred L10).
  const next = nextLevel(level.id, input.curriculum)
  const allFactIds = input.curriculum.levels.find((l) => l.kind === 'mixed')?.tableFactIds
    ?? input.curriculum.levels[input.curriculum.levels.length - 1]!.tableFactIds
  const advancement = evaluateAdvancement({
    before,
    after: progress,
    level,
    nextLevel: next && !isDeferredLevel(next) ? next : null,
    allFactIds,
    sessionId,
    atMs: endMs,
  })
  if (advancement.newlyCompleted && !progress.completedLevelIds.includes(level.id)) {
    progress.completedLevelIds = [...progress.completedLevelIds, level.id]
  }
  if (advancement.unlockedLevelId && !progress.unlockedLevelIds.includes(advancement.unlockedLevelId)) {
    progress.unlockedLevelIds = [...progress.unlockedLevelIds, advancement.unlockedLevelId]
  }
  progress.currentLevelId = advancement.currentLevelId
  events.push(...advancement.events)

  // D6 Comeback Kid input.
  events.push(...detectComebacks(profile.rawLog.attempts, sessionId))

  // D6 XP (player.xp is the single source of truth).
  const playerBefore = profile.player
  const levelMode = `${level.id}:${mode}`
  const xp: XpBreakdown = xpForSession(entry, {
    levelCompletedBefore: isReplay,
    isProgressLevel,
    firstFinishLevelMode: !playerBefore.finishedLevelModes.includes(levelMode),
    newlyMasteredFacts: advancement.newlyMasteredFactIds.length,
    levelCompletedNow: advancement.newlyCompleted,
    recordBeaten: record.isNewRecord,
    recordXpAvailableToday: isRecordXpAvailableToday(playerBefore, entry.dayKey),
  })

  // D6 badges, evaluated against the PRE-session player (and pre-session streak).
  const badgesEarned: BadgeAward[] = evaluateBadges(profile, entry, events)

  const xpBefore = playerBefore.xp
  const xpAfter = xpBefore + xp.total
  const playerLevelBefore = levelForXp(xpBefore)
  const playerLevelAfter = levelForXp(xpAfter)
  profile.player = {
    ...playerBefore,
    xp: xpAfter,
    level: playerLevelAfter,
    badges: [...playerBefore.badges, ...badgesEarned],
    finishedLevelModes: playerBefore.finishedLevelModes.includes(levelMode)
      ? playerBefore.finishedLevelModes
      : [...playerBefore.finishedLevelModes, levelMode],
    recordsBeaten: playerBefore.recordsBeaten + (record.isNewRecord ? 1 : 0),
    lastRecordXpDayKey: xp.recordBeaten > 0 ? entry.dayKey : playerBefore.lastRecordXpDayKey,
  }
  for (const award of badgesEarned) {
    events.push({ type: 'badge-earned', atMs: endMs, sessionId, award })
  }
  if (playerLevelAfter > playerLevelBefore) {
    events.push({
      type: 'player-level-up',
      atMs: endMs,
      sessionId,
      fromLevel: playerLevelBefore,
      toLevel: playerLevelAfter,
    })
  }

  touchDailyStreak(profile, endMs)
  profile.pendingReinforcements = input.pendingAfter.map((p) => ({ ...p }))
  profile.updatedAtMs = Math.max(profile.updatedAtMs, endMs)

  const marks: MarksProgress = {
    before: levelMarksTotal(level, before.factEvidence),
    after: levelMarksTotal(level, progress.factEvidence),
    advanced: false,
  }
  marks.advanced = marks.after > marks.before

  const factsMasteredThisSession: string[] = []
  for (const e of events) if (e.type === 'fact-mastered') factsMasteredThisSession.push(e.factId)
  factsMasteredThisSession.sort()

  const summary: SessionResultSummaryV2 = {
    sessionId,
    skillId: input.skillId,
    levelId: level.id,
    mode,
    completed: entry.completed,
    elapsedMs: entry.elapsedMs,
    answered: entry.answered,
    correct: entry.correct,
    drawAnswers: entry.drawAnswers,
    drawCorrect: entry.drawCorrect,
    accuracy: entry.drawAnswers > 0 ? entry.drawCorrect / entry.drawAnswers : 0,
    longestStreak: entry.longestStreak,
    isReplay,
    record,
    recordVisible: isReplay,
    advancement,
    xp,
    xpBefore,
    xpAfter,
    playerLevelBefore,
    playerLevelAfter,
    badgesEarned,
    factsMasteredThisSession,
    marks,
    events,
  }
  return { summary }
}

// ---- the engine ------------------------------------------------------------------------

type EngineState = 'playing' | 'finished' | 'abandoned'

export class LevelSessionEngine {
  readonly sessionId: string
  readonly level: LevelDef
  readonly mode: SessionMode
  readonly total: number
  readonly isReplay: boolean
  readonly startInfo: SessionStartInfo

  private profile: LearnerProfile
  private readonly skill: MathSkill
  private readonly curriculum: SkillCurriculum
  private readonly clock: () => number
  private readonly source: SessionQuestionSource
  private readonly before: SkillProgress
  private readonly session: SessionRecord
  private readonly missedThisSession = new Set<string>()
  private lastPick: LevelPick | null = null

  private state: EngineState = 'playing'
  private current: CurrentQuestion | null = null
  private reveal: MissReveal | null = null
  private answered = 0
  private correctCount = 0
  private streak = 0
  private longestStreak = 0
  private summary: SessionResultSummaryV2 | null = null
  private abandonResult: AbandonResult | null = null
  private readonly alerts: PersistenceAlert[] = []

  constructor(options: LevelSessionOptions) {
    const curriculum = options.curriculum ?? getCurriculum(options.skill.id)
    const level = getLevel(options.levelId, curriculum)
    const input = options.profile
    if (input.progress.skillId !== options.skill.id) {
      throw new Error(`Profile skill ${input.progress.skillId} does not match ${options.skill.id}`)
    }
    if (isDeferredLevel(level)) {
      throw new Error(`Level ${level.id} is deferred (D7) and cannot be played`)
    }
    if (!input.progress.unlockedLevelIds.includes(level.id)) {
      throw new Error(`Level ${level.id} is not unlocked`)
    }

    this.clock = options.clock ?? (() => Date.now())
    const startMs = this.clock()
    const profile = options.adoptProfile ? input : structuredClone(input)
    const sessionId = options.sessionId ?? defaultSessionId(startMs)
    if (sessionId.startsWith('v1-inferred-')) throw new Error('Reserved session ID prefix')
    if (profile.rawLog.sessions.some((s) => s.id === sessionId)) {
      throw new Error(`Duplicate session ID ${sessionId}`)
    }

    const closedDanglingSessions = closeDanglingSessions(profile)

    // D11 erratum: rebuild ONLY when evidenceStale (including a salvaged log, whose caches were never computed).
    let rebuiltEvidence = false
    const damaged = Boolean(options.load?.quarantine?.evidenceStaleWithDamagedLog) && profile.progress.evidenceStale
    if (profile.progress.evidenceStale) {
      // Also for a salvaged (damaged) log: best-effort rebuild, surfaced below (lead ruling).
      profile.progress = rebuildEvidence(profile.rawLog, profile.progress)
      rebuiltEvidence = true
    }

    this.profile = profile
    this.skill = options.skill
    this.curriculum = curriculum
    this.level = level
    this.mode = options.mode
    this.total = SESSION_LENGTHS[options.mode]
    this.sessionId = sessionId
    this.isReplay = profile.progress.completedLevelIds.includes(level.id)
    this.before = snapshotProgress(profile.progress)

    const rngs: SelectionRngs = {
      main: options.rngs?.main ?? Math.random,
      fluency: options.rngs?.fluency ?? Math.random,
    }
    const ctx: QuestionSourceContext = { skill: options.skill, levelId: level.id, mode: options.mode, rngs, curriculum }
    this.source = options.questionSource
      ? options.questionSource(ctx)
      : new LevelQuestionOrchestrator({ ...ctx })
    const droppedPending = this.source.seedPending(profile.pendingReinforcements ?? [])

    this.session = {
      id: sessionId,
      kind: 'play',
      startedAtMs: startMs,
      endedAtMs: null,
      mode: options.mode,
      levelId: level.id,
      inferred: false,
      endReason: null,
      isReplay: this.isReplay,
      pauses: [],
      discardedOnHide: [],
    }
    profile.rawLog.sessions.push(this.session)
    profile.pendingReinforcements = this.source.exportPending()

    this.startInfo = {
      rebuiltEvidence,
      evidenceStaleWithDamagedLog: damaged,
      droppedPending,
      closedDanglingSessions,
    }
    if (damaged) this.alerts.push({ kind: 'evidence-stale-damaged-log' })
    if (options.load?.readOnly) this.alerts.push({ kind: 'read-only' })
    const notices = new Set<PersistenceNotice>()
    if (options.load?.notice) notices.add(options.load.notice)
    for (const n of options.load?.pendingNotices ?? []) notices.add(n.notice)
    for (const notice of notices) this.alerts.push({ kind: 'notice', notice })
  }

  // ---- read side -----------------------------------------------------------------------

  /** The working profile (current pending queue synced). Save this at the save points. */
  getProfile(): LearnerProfile {
    if (this.state === 'playing') {
      this.profile.pendingReinforcements = this.source.exportPending()
    }
    return this.profile
  }

  /** Save-point helper: sync and return the profile to persist (same object as getProfile). */
  checkpoint(): LearnerProfile {
    this.profile.updatedAtMs = Math.max(this.profile.updatedAtMs, this.clock())
    return this.getProfile()
  }

  getSummary(): SessionResultSummaryV2 | null {
    return this.summary
  }

  isComplete(): boolean {
    return this.answered >= this.total
  }

  isHidden(): boolean {
    const last = this.session.pauses[this.session.pauses.length - 1]
    return last !== undefined && last.endedAtMs === null
  }

  /** Real elapsed time so far (visibility pauses excluded). */
  elapsedMs(nowMs: number = this.clock()): number {
    const end = this.session.endedAtMs ?? nowMs
    let paused = 0
    for (const p of this.session.pauses) {
      const to = Math.min(p.endedAtMs ?? end, end)
      if (to > p.startedAtMs) paused += to - p.startedAtMs
    }
    return Math.max(0, end - this.session.startedAtMs - paused)
  }

  snapshot(): LevelSessionSnapshot {
    return {
      sessionId: this.sessionId,
      levelId: this.level.id,
      mode: this.mode,
      total: this.total,
      answered: this.answered,
      correct: this.correctCount,
      streak: this.streak,
      longestStreak: this.longestStreak,
      elapsedMs: this.elapsedMs(),
      hidden: this.isHidden(),
      state: this.state,
      current: this.current,
      reveal: this.reveal,
    }
  }

  /** D10 in-level fact progress for the play screen (table facts of this level). */
  levelProgress(): LevelProgressFact[] {
    const ev = this.profile.progress.factEvidence
    const gating = new Set(this.level.gatingFactIds)
    return this.level.tableFactIds.map((factId) => ({
      factId,
      status: factStatus(ev[factId]),
      displayValue: factDisplayValue(ev[factId]),
      gating: gating.has(factId),
    }))
  }

  // ---- play ----------------------------------------------------------------------------

  /**
   * The question to show: the current unanswered one, or a new draw (evidence as of the
   * previous answer). null when the session is complete, ended or hidden. Clears the reveal.
   */
  nextQuestion(): CurrentQuestion | null {
    if (this.state !== 'playing' || this.isHidden() || this.isComplete()) return null
    if (this.current) return this.current
    this.reveal = null
    const { question, pick } = this.source.nextQuestion(this.profile.progress.factEvidence)
    this.current = {
      question,
      factId: pick.factId,
      source: pick.source,
      index: this.answered,
      total: this.total,
      shownAtMs: this.clock(),
    }
    this.lastPick = pick
    return this.current
  }

  /**
   * Answer the current question (no retype, D3). Throws unless `questionId` is the current,
   * non-discarded question. Appends the raw attempt (D11), updates the evidence view (D2),
   * the level evidence buffer (counted draws only) and the reinforcement queue.
   */
  answer(questionId: string, value: unknown): AnswerOutcome {
    const cur = this.current
    const pick = this.lastPick
    if (this.state !== 'playing' || this.isHidden() || !cur || !pick || cur.question.id !== questionId) {
      throw new Error('No such question on screen (answered, discarded or session ended)')
    }
    const atMs = this.clock()
    const latencyMs = Math.max(0, atMs - cur.shownAtMs)
    const result = this.skill.evaluateAnswer(cur.question, { value, respondedAtMs: atMs, latencyMs })
    const correct = result.correct
    const given = numericGiven(result.given)
    const attempt: RawAttempt = {
      factId: cur.factId,
      a: presentedFactor(cur.question, 'a'),
      b: presentedFactor(cur.question, 'b'),
      correct,
      given,
      latencyMs,
      atMs,
      sessionId: this.sessionId,
      sessionInferred: false,
      levelId: this.level.id,
      mode: this.mode,
      source: cur.source,
      isReplay: this.isReplay,
    }
    const counted = !this.missedThisSession.has(cur.factId)
    if (!correct) this.missedThisSession.add(cur.factId)

    const profile = this.profile
    profile.rawLog.attempts.push(attempt)
    const progress = profile.progress
    const prev = progress.factEvidence[cur.factId] ?? emptyFactEvidence(cur.factId)
    const nextEv = applyAttemptToEvidence(prev, attempt, counted)
    progress.factEvidence = { ...progress.factEvidence, [cur.factId]: nextEv }
    const bufferEntry = evidenceBufferEntryFor(attempt, counted)
    if (bufferEntry) {
      progress.evidence = {
        ...progress.evidence,
        [this.level.id]: appendEvidenceBuffer(progress.evidence[this.level.id] ?? [], bufferEntry),
      }
    }
    this.source.recordAnswer(cur.factId, cur.source, correct)

    this.answered += 1
    if (correct) {
      this.correctCount += 1
      this.streak += 1
      if (this.streak > this.longestStreak) this.longestStreak = this.streak
    } else {
      this.streak = 0
    }
    this.reveal = correct
      ? null
      : {
          factId: cur.factId,
          text: revealText(cur.question, result.expected),
          expected: result.expected,
          given,
        }
    this.current = null
    this.lastPick = null

    return {
      correct,
      attempt,
      counted,
      statusAfter: factStatus(nextEv),
      displayValueAfter: factDisplayValue(nextEv),
      reveal: this.reveal,
      streak: this.streak,
      answered: this.answered,
      total: this.total,
      sessionComplete: this.isComplete(),
      saveRecommended: this.answered % SAVE_EVERY_ANSWERS === 0 && !this.isComplete(),
    }
  }

  // ---- visibility (D3) -------------------------------------------------------------------

  /**
   * App hidden: pause the clock; an unanswered on-screen question is discarded (not counted,
   * not logged as an attempt; selection state restored, T5 `discardLast`) and recorded in
   * `discardedOnHide`. Save point 2: persist `checkpoint()` right after. No-op when already
   * hidden or ended. Returns whether a question was discarded.
   */
  hide(): { discarded: boolean } {
    if (this.state !== 'playing' || this.isHidden()) return { discarded: false }
    const now = this.clock()
    this.session.pauses.push({ startedAtMs: now, endedAtMs: null })
    let discarded = false
    if (this.current) {
      this.source.discardLast()
      this.session.discardedOnHide.push({
        factId: this.current.factId,
        shownAtMs: this.current.shownAtMs,
        discardedAtMs: now,
      })
      this.current = null
      this.lastPick = null
      discarded = true
    }
    return { discarded }
  }

  /**
   * App visible again: restart the clock and draw a fresh question. If a miss reveal was on
   * screen when hidden it is kept (`snapshot().reveal`) and null is returned: call
   * `nextQuestion()` once it is dismissed. null also when complete/ended.
   */
  resume(): CurrentQuestion | null {
    if (this.state !== 'playing') return null
    this.closeOpenPause(this.clock())
    // A miss reveal shown when the app was hidden stays up (the question already ended; the
    // reveal is feedback). The next question is drawn when the kid dismisses it.
    if (this.reveal) return null
    return this.nextQuestion()
  }

  private closeOpenPause(now: number): void {
    const last = this.session.pauses[this.session.pauses.length - 1]
    if (last && last.endedAtMs === null) last.endedAtMs = Math.max(last.startedAtMs, now)
  }

  // ---- end -------------------------------------------------------------------------------

  /**
   * Finish a complete session and apply it exactly once (idempotent: a second call returns
   * the same summary). Throws if questions remain (use `abandon`). Save point 1.
   */
  finish(): SessionResultSummaryV2 {
    if (this.summary) return this.summary
    if (this.state !== 'playing') throw new Error('Session already ended')
    if (!this.isComplete()) throw new Error('Session is not complete; use abandon()')
    const now = this.clock()
    this.closeOpenPause(now)
    this.session.endedAtMs = now
    this.session.endReason = 'finished'
    this.state = 'finished'
    this.reveal = null
    const result = settleFinishedSession(this.profile, {
      sessionId: this.sessionId,
      skillId: this.skill.id,
      level: this.level,
      curriculum: this.curriculum,
      before: this.before,
      longestStreak: this.longestStreak,
      pendingAfter: this.source.exportPending(),
    })
    if (!result) throw new Error(`Session ${this.sessionId} could not be settled`)
    this.summary = result.summary
    return this.summary
  }

  /**
   * Leave early. Raw attempts stay in the log and in the evidence view; the session earns
   * nothing (no log entry, record, completion, XP, badges or streak) and does not count
   * toward R5. The carried queue is kept. Idempotent. Save point 1.
   */
  abandon(): AbandonResult {
    if (this.abandonResult) return this.abandonResult
    if (this.state !== 'playing') throw new Error('Session already ended')
    const now = this.clock()
    if (this.current) {
      this.source.discardLast()
      this.current = null
      this.lastPick = null
    }
    this.closeOpenPause(now)
    this.session.endedAtMs = now
    this.session.endReason = 'abandoned'
    this.profile.pendingReinforcements = this.source.exportPending()
    this.profile.updatedAtMs = Math.max(this.profile.updatedAtMs, now)
    this.state = 'abandoned'
    this.reveal = null
    this.abandonResult = { sessionId: this.sessionId, answered: this.answered, elapsedMs: this.elapsedMs(now) }
    return this.abandonResult
  }

  // ---- persistence pass-through (T8 shows these) ---------------------------------------

  /**
   * Hand back the `SaveResult` of every save. Returns EVERY alert this result produced (e.g.
   * `save-trimmed` plus a `notice`), empty for a clean save; T8 must show each. Never changes
   * learner state (D11 persistence invariant). `persistenceAlerts()` accumulates them all.
   */
  reportSaveResult(result: SaveResult): PersistenceAlert[] {
    const produced: PersistenceAlert[] = []
    if (result.status === 'failed') {
      produced.push({ kind: 'save-failed', reason: result.reason })
    } else {
      if (result.status === 'saved-trimmed') {
        produced.push({
          kind: 'save-trimmed',
          droppedAttempts: result.droppedAttempts,
          droppedSessions: result.droppedSessions,
        })
      }
      if (result.notice) produced.push({ kind: 'notice', notice: result.notice })
    }
    this.alerts.push(...produced)
    return produced
  }

  /** Every persistence alert of this session (load + saves), oldest first. */
  persistenceAlerts(): readonly PersistenceAlert[] {
    return this.alerts.slice()
  }
}
