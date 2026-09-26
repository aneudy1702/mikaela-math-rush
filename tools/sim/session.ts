// Plays one session (Quick 10 / Practice 25 / Rush 100). No-retype wrong-answer flow (D3): a miss ends the question,
// counts against accuracy, schedules a reintroduce; the clock is real elapsed time (latency + feedback time).
import type { Mode, Rules, Source, Status } from './rules.ts'
import { applyAttempt, cloneFact, newFact, type Attempt, type FactState } from './status.ts'
import { ALL_FACTS } from './curriculum.ts'
import { newSessionCtx, scheduleAfterAnswer, selectNext, type QueueItem } from './selection.ts'
import type { Learner } from './learners.ts'

/** Non-answer time per question (read, type, feedback/reveal) used for elapsed time. */
export const OVERHEAD_MS = 1500

/** D2 per-level evidence entry: counted attempts with source draw only. */
export interface EvidenceEntry {
  factId: string
  correct: boolean
  sessionId: number
  dayKey: number
}

export interface LearnerState {
  facts: Map<string, FactState>
  /** Carried queue, `due` relative to the next session's first question. */
  queue: QueueItem[]
  evidence: Map<number, EvidenceEntry[]>
  sessionCount: number
}

export function newLearnerState(): LearnerState {
  const facts = new Map<string, FactState>()
  for (const f of ALL_FACTS) facts.set(f, newFact(f))
  return { facts, queue: [], evidence: new Map(), sessionCount: 0 }
}

export function cloneState(s: LearnerState): LearnerState {
  const facts = new Map<string, FactState>()
  for (const [k, v] of s.facts) facts.set(k, cloneFact(v))
  const ev = new Map<number, EvidenceEntry[]>()
  for (const [k, v] of s.evidence) ev.set(k, v.slice())
  return { facts, queue: s.queue.map((q) => ({ ...q })), evidence: ev, sessionCount: s.sessionCount }
}

/** Shared by play and replay so the evidence view is defined once. */
export function pushEvidence(buf: EvidenceEntry[], e: EvidenceEntry, source: Source, counted: boolean, r: Rules): void {
  if (source !== 'draw' || !counted) return
  buf.push(e)
  if (buf.length > r.evidenceBufferMax) buf.shift()
}

export interface Rngs {
  sel: () => number
  ans: () => number
  lat: () => number
  fluency: () => number
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
  n: number
  correct: number
  draws: number
  drawsCorrect: number
  elapsedMs: number
  recordEligible: boolean
  perfect: boolean
  newlyMastered: number
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
  fluencyEnabled?: boolean
  keepLog?: boolean
}): SessionOutcome {
  const { state, learner, rules: r, rngs } = p
  const sessionId = ++state.sessionCount
  const ctx = newSessionCtx({ rules: r, mode: p.mode, levelId: p.levelId, sessionId, carriedQueue: state.queue, rng: rngs.sel, rngFluency: rngs.fluency, fluencyEnabled: p.fluencyEnabled ?? true })
  const buf = state.evidence.get(p.levelId) ?? []
  state.evidence.set(p.levelId, buf)

  let correctN = 0
  let draws = 0
  let drawsCorrect = 0
  let elapsed = 0
  let newlyMastered = 0
  let streak = 0
  let longestStreak = 0
  let comeback = false
  const seen = new Set<string>()
  const countedThisSession = new Set<string>()
  const log: QuestionLog[] = []

  for (ctx.q = 0; ctx.q < ctx.length; ctx.q++) {
    const pick = selectNext(ctx, state.facts)
    const f = state.facts.get(pick.factId)!
    const correct = rngs.ans() < learner.p(pick.factId)
    const latencyMs = learner.latencyMs(pick.factId, rngs.lat)
    const counted = !ctx.missed.has(pick.factId)
    seen.add(pick.factId)
    streak = correct ? streak + 1 : 0
    if (streak > longestStreak) longestStreak = streak
    if (counted && correct && !countedThisSession.has(pick.factId) && f.countedMisses > 0) comeback = true
    if (counted) countedThisSession.add(pick.factId)
    const a: Attempt = { correct, latencyMs, sessionId, q: ctx.q, counted, inferred: false, source: pick.source }
    if (applyAttempt(f, a, r)) newlyMastered++
    if (!correct) ctx.missed.add(pick.factId)
    learner.onAttempt(pick.factId, correct, counted, sessionId, pick.source)
    if (correct) correctN++
    if (pick.source === 'draw') {
      draws++
      if (correct) drawsCorrect++
    }
    pushEvidence(buf, { factId: pick.factId, correct, sessionId, dayKey: p.dayKey }, pick.source, counted, r)
    scheduleAfterAnswer(ctx, pick.factId, pick.source, correct)
    elapsed += latencyMs + OVERHEAD_MS
    if (p.keepLog) log.push({ factId: pick.factId, source: pick.source, correct, counted, latencyMs, q: ctx.q, statusAfter: f.status })
  }

  // Carry reintroduce / later-check items with their remaining relative delay.
  state.queue = ctx.queue.map((i) => ({ ...i, due: Math.max(0, i.due - ctx.length), waited: 0 }))

  return {
    mode: p.mode,
    levelId: p.levelId,
    sessionId,
    n: ctx.length,
    correct: correctN,
    draws,
    drawsCorrect,
    elapsedMs: elapsed,
    recordEligible: recordEligible(drawsCorrect, draws, r),
    perfect: draws > 0 && drawsCorrect === draws,
    newlyMastered,
    longestStreak,
    comeback,
    seen,
    log,
  }
}

/** D3 eligibility: completed run with accuracy ≥ recordMinAccuracy over draw answers. Latency-free. */
export function recordEligible(correct: number, n: number, r: Rules): boolean {
  return n > 0 && correct / n >= r.recordMinAccuracy
}
