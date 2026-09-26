// D2 fact status (revision 4) and D10 evidence marks. Latency is stored (for stage-2 fluency) but never read here.
import type { Rules, Source, Status } from './rules.ts'

export interface Attempt {
  correct: boolean
  latencyMs: number
  sessionId: number
  /** Question index within the session (0-based). */
  q: number
  counted: boolean
  inferred: boolean
  source: Source
}

export interface FactState {
  id: string
  /** Counted attempts, chronological (C). */
  counted: Attempt[]
  countedMisses: number
  /** S(C): distinct sessions containing a correct counted attempt. */
  correctSessions: Set<number>
  /** A correct counted attempt exists in a non-inferred session. */
  liveCorrect: boolean
  /** Last ≤ sampleSize correct latencies (any attempt, counted or not) — stage-2 fluency only. */
  correctLatencies: number[]
  status: Status
  everMastered: boolean
  placementLikely: boolean
  /** Cached: likely-correct for the success floor (D2 step 5). */
  likely: boolean
}

export function newFact(id: string): FactState {
  return { id, counted: [], countedMisses: 0, correctSessions: new Set(), liveCorrect: false, correctLatencies: [], status: 'new', everMastered: false, placementLikely: false, likely: false }
}

export function cloneFact(f: FactState): FactState {
  return { ...f, counted: f.counted.slice(), correctSessions: new Set(f.correctSessions), correctLatencies: f.correctLatencies.slice() }
}

function windowOf(f: FactState, r: Rules): Attempt[] {
  const C = f.counted
  return C.length > r.windowSize ? C.slice(C.length - r.windowSize) : C
}

export function correctInWindow(f: FactState, r: Rules): number {
  let c = 0
  for (const a of windowOf(f, r)) if (a.correct) c++
  return c
}

export function computeStatus(f: FactState, r: Rules): Status {
  const C = f.counted
  if (C.length === 0) return 'new'
  const W = windowOf(f, r)
  const cW = correctInWindow(f, r)
  const spaced = f.correctSessions.size >= r.minDistinctSessionsForMastery
  // (a) fast-track: all counted correct, spaced, at least one live session.
  if (C.length >= r.fastTrackMinAttempts && f.countedMisses === 0 && spaced && f.liveCorrect) return 'mastered'
  // (b) 3 of the last 4, spacing over all counted correct attempts (V1).
  if (W.length >= r.masteredMinCorrectInWindow && cW >= r.masteredMinCorrectInWindow && spaced) return 'mastered'
  if (W.length >= r.struggleMinAttempts && cW <= r.struggleMaxCorrectInWindow) return 'struggling'
  return 'learning'
}

/** D2 step 5 "likely-correct": mastered, placement-likely, or ≥ 2 counted attempts with ≥ 75% correct in W. */
export function computeLikely(f: FactState, r: Rules): boolean {
  if (f.status === 'mastered' || f.placementLikely) return true
  if (f.counted.length < r.likelyMinCountedAttempts) return false
  const W = windowOf(f, r)
  return correctInWindow(f, r) / W.length >= r.likelyMinAccuracy
}

/** D10: marks(f) = 0 if new or struggling, else min(marksMax, cW). */
export function marks(f: FactState, r: Rules): number {
  if (f.status === 'new' || f.status === 'struggling') return 0
  return Math.min(r.marksMax, correctInWindow(f, r))
}

/** Records one attempt and refreshes cached fields. Returns true if the fact became everMastered now. */
export function applyAttempt(f: FactState, a: Attempt, r: Rules): boolean {
  if (a.counted) {
    f.counted.push(a)
    if (!a.correct) f.countedMisses++
    else {
      f.correctSessions.add(a.sessionId)
      if (!a.inferred) f.liveCorrect = true
    }
    f.placementLikely = false
  }
  if (a.correct) {
    f.correctLatencies.push(a.latencyMs)
    if (f.correctLatencies.length > r.fluencySlowness.sampleSize) f.correctLatencies.shift()
  }
  f.status = computeStatus(f, r)
  f.likely = computeLikely(f, r)
  if (f.status === 'mastered' && !f.everMastered) {
    f.everMastered = true
    return true
  }
  return false
}
