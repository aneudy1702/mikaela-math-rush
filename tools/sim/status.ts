// D2 fact status. Latency is stored (for selection slowness) but never read here.
import type { Rules, Source, Status } from './rules.ts'

export interface Attempt {
  correct: boolean
  latencyMs: number
  sessionId: number
  /** Question index within the session (0-based). */
  q: number
  atMs: number
  counted: boolean
  inferred: boolean
  source: Source
}

export interface FactState {
  id: string
  /** Counted attempts, chronological (C). */
  counted: Attempt[]
  countedMisses: number
  /** Last ≤ sampleSize correct latencies (any attempt, counted or not) — selection only. */
  correctLatencies: number[]
  status: Status
  everMastered: boolean
  placementLikely: boolean
  /** Cached: likely-correct for the success floor (D2 step 5). */
  likely: boolean
}

export function newFact(id: string): FactState {
  return { id, counted: [], countedMisses: 0, correctLatencies: [], status: 'new', everMastered: false, placementLikely: false, likely: false }
}

export function cloneFact(f: FactState): FactState {
  return { ...f, counted: f.counted.slice(), correctLatencies: f.correctLatencies.slice() }
}

export function computeStatus(f: FactState, r: Rules): Status {
  const C = f.counted
  if (C.length === 0) return 'new'
  const W = C.length > r.windowSize ? C.slice(C.length - r.windowSize) : C
  let cW = 0
  for (const a of W) if (a.correct) cW++

  // (a) fast-track
  if (C.length >= r.fastTrackMinAttempts && f.countedMisses === 0) {
    const sessions = new Set<number>()
    let live = false
    for (const a of C) {
      sessions.add(a.sessionId)
      if (!a.inferred) live = true
    }
    if (sessions.size >= r.minDistinctSessionsForMastery && live) return 'mastered'
  }
  // (b) window rule
  if (W.length >= r.masteredMinCorrectInWindow && cW >= r.masteredMinCorrectInWindow) {
    const sessions = new Set<number>()
    for (const a of r.simSpanOverC ? C : W) if (a.correct) sessions.add(a.sessionId)
    if (sessions.size >= r.minDistinctSessionsForMastery) return 'mastered'
  }
  // struggling
  if (W.length >= r.struggleMinAttempts && cW <= r.struggleMaxCorrectInWindow) return 'struggling'
  // provisional
  if (r.provisionalEnabled) {
    const last = C[C.length - 1]!
    const S: Attempt[] = []
    for (let i = C.length - 1; i >= 0 && C[i]!.sessionId === last.sessionId; i--) S.unshift(C[i]!)
    if (!last.inferred && S.every((a) => a.correct) && S.length >= r.provisionalMinCorrect) {
      let ok = true
      for (let i = 1; i < S.length; i++) {
        if (S[i]!.q - S[i - 1]!.q - 1 < r.provisionalMinGapQuestions) {
          ok = false
          break
        }
      }
      if (ok) return 'provisional'
    }
  }
  return 'learning'
}

/** D2 step 5 "likely-correct": mastered, provisional, placement-likely, or ≥ 2 counted attempts with ≥ 75% correct (over W — see spec gaps). */
export function computeLikely(f: FactState, r: Rules): boolean {
  if (f.status === 'mastered' || f.status === 'provisional' || f.placementLikely) return true
  const C = f.counted
  if (C.length < r.likelyMinCountedAttempts) return false
  const W = C.length > r.windowSize ? C.slice(C.length - r.windowSize) : C
  let c = 0
  for (const a of W) if (a.correct) c++
  return c / W.length >= r.likelyMinAccuracy
}

/** Records one attempt and refreshes cached fields. Returns true if the fact became everMastered now. */
export function applyAttempt(f: FactState, a: Attempt, r: Rules): boolean {
  if (a.counted) {
    f.counted.push(a)
    if (!a.correct) f.countedMisses++
    f.placementLikely = false
  }
  if (a.correct) {
    f.correctLatencies.push(a.latencyMs)
    if (f.correctLatencies.length > r.slowness.sampleSize) f.correctLatencies.shift()
  }
  f.status = computeStatus(f, r)
  f.likely = computeLikely(f, r)
  if (f.status === 'mastered' && !f.everMastered) {
    f.everMastered = true
    return true
  }
  return false
}
