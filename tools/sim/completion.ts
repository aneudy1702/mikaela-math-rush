// D2 level completion (revision 4): R1–R5 for table levels, option B + V4 for L9. Evaluated at session end. Latency-free.
import type { Rules } from './rules.ts'
import type { FactState } from './status.ts'
import { ALL_FACTS, getLevel } from './curriculum.ts'
import type { EvidenceEntry } from './session.ts'

export interface TableEval {
  pass: boolean
  r1: boolean
  r2: boolean
  r3: boolean
  r4: boolean
  r5: boolean
  mastered: number
  n: number
}

export function allowance(n: number, r: Rules): number {
  return Math.max(r.allowanceMin, Math.floor(r.allowanceFraction * n))
}

export function evaluateTableLevel(levelId: number, facts: Map<string, FactState>, evidence: EvidenceEntry[], sessionsAtLevel: number, r: Rules): TableEval {
  const lvl = getLevel(levelId)
  const G = lvl.gatingFactIds
  const n = G.length
  let M = 0
  let strugglingG = 0
  for (const id of G) {
    const s = facts.get(id)!.status
    if (s === 'mastered') M++
    else if (s === 'struggling') strugglingG++
  }
  let strugglingT = 0
  for (const id of lvl.tableFactIds) if (facts.get(id)!.status === 'struggling') strugglingT++
  const r1 = M >= n - allowance(n, r)
  const r2 = strugglingG === 0
  const r3 = strugglingT <= r.maxStrugglingTableFacts
  let r4 = false
  if (evidence.length >= r.levelAccuracyWindow) {
    const w = evidence.slice(evidence.length - r.levelAccuracyWindow)
    r4 = w.filter((x) => x.correct).length / w.length >= r.levelAccuracyMin
  }
  const r5 = sessionsAtLevel >= r.minSessionsAtLevel
  return { pass: r1 && r2 && r3 && r4 && r5, r1, r2, r3, r4, r5, mastered: M, n }
}

export interface MixedEval {
  pass: boolean
  accuracy: number
  answers: number
  sessions: number
  days: number
  struggling: number
}

/** Shortest suffix with ≥ mixedMinAnswers answers and ≥ mixedMinSessions sessions (V4); none → fail. */
export function evaluateMixedLevel(facts: Map<string, FactState>, evidence: EvidenceEntry[], r: Rules): MixedEval {
  let struggling = 0
  for (const id of ALL_FACTS) if (facts.get(id)!.status === 'struggling') struggling++
  const ids = new Set<number>()
  let start = -1
  for (let i = evidence.length - 1; i >= 0; i--) {
    ids.add(evidence[i]!.sessionId)
    if (evidence.length - i >= r.mixedMinAnswers && ids.size >= r.mixedMinSessions) {
      start = i
      break
    }
  }
  if (start < 0) return { pass: false, accuracy: NaN, answers: 0, sessions: ids.size, days: 0, struggling }
  const w = evidence.slice(start)
  const accuracy = w.filter((x) => x.correct).length / w.length
  const days = new Set(w.map((x) => x.dayKey)).size
  const pass = accuracy >= r.mixedAccuracyMin && days >= r.mixedMinDays && struggling <= r.mixedMaxStruggling
  return { pass, accuracy, answers: w.length, sessions: ids.size, days, struggling }
}
