// Plays one session (Quick 10 / Practice 25 / Rush 100). No-retype wrong-answer flow (D3): a miss ends the question,
// counts against accuracy, schedules a reintroduce; the clock is real elapsed time (latency + feedback time).
import type { Mode, Rules, Source, Status } from './rules.ts'
import { applyAttempt, cloneFact, newFact, type Attempt, type FactState } from './status.ts'
import { ALL_FACTS } from './curriculum.ts'
import { newSessionCtx, scheduleAfterAnswer, selectNext, type CapstoneTrack, type QueueItem } from './selection.ts'
import type { Learner } from './learners.ts'

/** Non-answer time per question (read, type, feedback/reveal) used for elapsed time and XP/min. */
export const OVERHEAD_MS = 1500

export interface LevelAnswer {
  correct: boolean
  source: Source
  sessionId: number
  dayKey: number
}

export interface LearnerState {
  facts: Map<string, FactState>
  /** Carried queue, `due` relative to the next session's first question. */
  queue: QueueItem[]
  /** D2 per-level answer buffer (draw/confirm answers only — see spec gaps). */
  levelAnswers: Map<number, LevelAnswer[]>
  sessionCount: number
}

export function newLearnerState(): LearnerState {
  const facts = new Map<string, FactState>()
  for (const f of ALL_FACTS) facts.set(f, newFact(f))
  return { facts, queue: [], levelAnswers: new Map(), sessionCount: 0 }
}

export function cloneState(s: LearnerState): LearnerState {
  const facts = new Map<string, FactState>()
  for (const [k, v] of s.facts) facts.set(k, cloneFact(v))
  const la = new Map<number, LevelAnswer[]>()
  for (const [k, v] of s.levelAnswers) la.set(k, v.slice())
  return { facts, queue: s.queue.map((q) => ({ ...q })), levelAnswers: la, sessionCount: s.sessionCount }
}

export interface Rngs {
  sel: () => number
  ans: () => number
  lat: () => number
  fluency: () => number
}

/** L9 tracking (all L9 definitions): prior-mastered facts' first L9 appearances, carried facts answered correctly at L9. */
export interface L9Track extends CapstoneTrack {
  firstAppearances: boolean[]
  /** Sim-only C-rolling candidate: every draw/confirm answer on prior-mastered facts at L9. */
  prevAnswers: boolean[]
  carriedCorrect: Set<string>
}

export interface QuestionLog {
  factId: string
  source: Source
  correct: boolean
  counted: boolean
  latencyMs: number
  q: number
  statusAfter: Status
}

export interface SessionOutcome {
  mode: Mode
  levelId: number
  sessionId: number
  dayKey: number
  n: number
  correct: number
  drawConfirm: number
  drawConfirmCorrect: number
  accuracy: number
  elapsedMs: number
  recordEligible: boolean
  perfect: boolean
  newlyMastered: number
  /** Share of questions drawn while likely-correct. */
  likelyShare: number
  /** A likely candidate existed at every question with q ≥ 1 (floor enforceable throughout). */
  floorEnforceable: boolean
  /** Spec-D "hard": true p < 0.7 or status struggling/learning at draw time. */
  hardShare: number
  /** True p < 0.7 only. */
  trulyHardShare: number
  /** Draw-time mix: likely (mastered/provisional/likely-correct) · new · weak (learning/struggling not likely). */
  mixLikely: number
  mixNew: number
  mixWeak: number
  confirmShare: number
  /** Mean true p of the facts drawn (at draw time). */
  meanP: number
  /** Accuracy over all answers. */
  accuracyAll: number
  longestStreak: number
  comeback: boolean
  seen: Set<string>
  log: QuestionLog[]
}

export function playSession(p: {
  state: LearnerState
  learner: Learner
  levelId: number
  mode: Mode
  rules: Rules
  rngs: Rngs
  dayKey: number
  slownessEnabled?: boolean
  keepLog?: boolean
  l9?: L9Track | null
}): SessionOutcome {
  const { state, learner, rules: r, rngs } = p
  const sessionId = ++state.sessionCount
  const ctx = newSessionCtx({
    rules: r,
    mode: p.mode,
    levelId: p.levelId,
    sessionId,
    carriedQueue: state.queue,
    rng: rngs.sel,
    rngFluency: rngs.fluency,
    slownessEnabled: p.slownessEnabled ?? true,
    capstone: p.levelId === 9 ? p.l9 : null,
  })
  const l9 = p.levelId === 9 ? (p.l9 ?? null) : null
  const prevSet = l9 ? new Set(l9.prev) : null
  const carriedSet = l9 ? new Set(l9.carried) : null
  const seen = new Set<string>()
  const countedThisSession = new Set<string>()
  let sumP = 0
  let streak = 0
  let longestStreak = 0
  let comeback = false
  const buf = state.levelAnswers.get(p.levelId) ?? []
  state.levelAnswers.set(p.levelId, buf)
  const bufCap = Math.max(r.levelAnswerBuffer, r.levelAccuracyWindow, r.mixedWindow)

  let correctN = 0
  let dc = 0
  let dcCorrect = 0
  let elapsed = 0
  let newlyMastered = 0
  let hard = 0
  let trulyHard = 0
  let enforceable = true
  let mixLikely = 0
  let mixNew = 0
  let mixWeak = 0
  let confirms = 0
  const log: QuestionLog[] = []

  for (ctx.q = 0; ctx.q < ctx.length; ctx.q++) {
    const pick = selectNext(ctx, state.facts)
    if (ctx.q > 0 && !pick.likelyAvailable) enforceable = false
    const f = state.facts.get(pick.factId)!
    const pc = learner.p(pick.factId)
    const statusBefore = f.status
    if (pc < 0.7) trulyHard++
    if (pc < 0.7 || statusBefore === 'struggling' || statusBefore === 'learning') hard++
    if (pick.likely) mixLikely++
    else if (statusBefore === 'new') mixNew++
    else mixWeak++
    if (pick.source === 'confirm') confirms++

    const correct = rngs.ans() < pc
    const latencyMs = learner.latencyMs(pick.factId, rngs.lat)
    const counted = !ctx.missed.has(pick.factId)
    sumP += pc
    seen.add(pick.factId)
    streak = correct ? streak + 1 : 0
    if (streak > longestStreak) longestStreak = streak
    if (counted && correct && !countedThisSession.has(pick.factId) && f.countedMisses > 0) comeback = true
    if (counted) countedThisSession.add(pick.factId)
    if (l9 && prevSet!.has(pick.factId) && !l9.seen.has(pick.factId)) {
      l9.seen.add(pick.factId)
      l9.firstAppearances.push(correct)
    }
    if (l9 && carriedSet!.has(pick.factId) && counted && correct) l9.carriedCorrect.add(pick.factId)
    if (l9 && prevSet!.has(pick.factId) && (pick.source === 'draw' || pick.source === 'confirm')) l9.prevAnswers.push(correct)
    const a: Attempt = { correct, latencyMs, sessionId, q: ctx.q, atMs: 0, counted, inferred: false, source: pick.source }
    if (applyAttempt(f, a, r)) newlyMastered++
    if (!correct) ctx.missed.add(pick.factId)
    learner.onAttempt(pick.factId, correct, counted, sessionId, pick.source)
    if (correct) correctN++
    if (pick.source === 'draw' || pick.source === 'confirm') {
      dc++
      if (correct) dcCorrect++
      buf.push({ correct, source: pick.source, sessionId, dayKey: p.dayKey })
      if (buf.length > bufCap) buf.shift()
    }
    scheduleAfterAnswer(ctx, pick.factId, pick.source, correct, counted, statusBefore === 'mastered')
    elapsed += latencyMs + OVERHEAD_MS
    if (p.keepLog) log.push({ factId: pick.factId, source: pick.source, correct, counted, latencyMs, q: ctx.q, statusAfter: f.status })
  }

  // Carry reintroduce / later-check items (relative delays); confirms are in-session only.
  state.queue = ctx.queue.filter((i) => i.kind !== 'confirm').map((i) => ({ ...i, due: Math.max(0, i.due - ctx.length), waited: 0 }))

  const n = ctx.length
  const accuracy = dc === 0 ? 0 : dcCorrect / dc
  return {
    mode: p.mode,
    levelId: p.levelId,
    sessionId,
    dayKey: p.dayKey,
    n,
    correct: correctN,
    drawConfirm: dc,
    drawConfirmCorrect: dcCorrect,
    accuracy,
    elapsedMs: elapsed,
    recordEligible: recordEligible(dcCorrect, dc, r),
    perfect: dc > 0 && dcCorrect === dc,
    newlyMastered,
    likelyShare: ctx.likelyDrawn / n,
    floorEnforceable: enforceable,
    hardShare: hard / n,
    trulyHardShare: trulyHard / n,
    mixLikely: mixLikely / n,
    mixNew: mixNew / n,
    mixWeak: mixWeak / n,
    confirmShare: confirms / n,
    meanP: sumP / n,
    accuracyAll: correctN / n,
    longestStreak,
    comeback,
    seen,
    log,
  }
}

/** D3 eligibility: completed run with accuracy ≥ recordMinAccuracy over draw/confirm answers. Latency-free. */
export function recordEligible(dcCorrect: number, dc: number, r: Rules): boolean {
  return dc > 0 && dcCorrect / dc >= r.recordMinAccuracy
}
