// D2 level completion: R1–R5 for table levels, rolling rule for L9. Evaluated at session end. Latency-free.
import type { Rules } from './rules.ts'
import type { FactState } from './status.ts'
import { ALL_FACTS, getLevel } from './curriculum.ts'
import type { LevelAnswer } from './session.ts'

export interface TableEval {
  pass: boolean
  r1: boolean
  r2: boolean
  r3: boolean
  r4: boolean
  r5: boolean
  mastered: number
  provisional: number
  n: number
}

export function allowance(n: number, r: Rules): number {
  return Math.max(r.allowanceMin, Math.floor(r.allowanceFraction * n))
}

export function evaluateTableLevel(levelId: number, facts: Map<string, FactState>, answers: LevelAnswer[], sessionsAtLevel: number, r: Rules): TableEval {
  const lvl = getLevel(levelId)
  const G = lvl.gatingFactIds
  const n = G.length
  const a = allowance(n, r)
  let M = 0
  let P = 0
  let strugglingG = 0
  for (const id of G) {
    const s = facts.get(id)!.status
    if (s === 'mastered') M++
    else if (s === 'provisional') P++
    else if (s === 'struggling') strugglingG++
  }
  let strugglingT = 0
  for (const id of lvl.tableFactIds) if (facts.get(id)!.status === 'struggling') strugglingT++
  const r1 = M + P >= n - a && M >= Math.ceil((n - a) / 2)
  const r2 = strugglingG === 0
  const r3 = strugglingT <= r.maxStrugglingTableFacts
  let r4: boolean
  if (r.levelAccuracyWindow <= 0) r4 = true // sim-only: R4 disabled
  else {
    const dc = answers.filter((x) => x.source === 'draw' || x.source === 'confirm')
    if (dc.length < r.levelAccuracyWindow) r4 = false
    else {
      const w = dc.slice(dc.length - r.levelAccuracyWindow)
      r4 = w.filter((x) => x.correct).length / w.length >= r.levelAccuracyMin
    }
  }
  const r5 = sessionsAtLevel >= r.minSessionsAtLevel
  return { pass: r1 && r2 && r3 && r4 && r5, r1, r2, r3, r4, r5, mastered: M, provisional: P, n }
}

export interface MixedEval {
  pass: boolean
  accuracy: number
  sessions: number
  days: number
  struggling: number
}

export function evaluateMixedLevel(facts: Map<string, FactState>, answers: LevelAnswer[], r: Rules, threshold = r.mixedAccuracyMin): MixedEval {
  const dc = answers.filter((x) => x.source === 'draw' || x.source === 'confirm')
  let struggling = 0
  for (const id of ALL_FACTS) if (facts.get(id)!.status === 'struggling') struggling++
  if (dc.length < r.mixedWindow) return { pass: false, accuracy: NaN, sessions: 0, days: 0, struggling }
  let start = dc.length - r.mixedWindow
  if (r.simMixedWindowExtends) {
    // extend backwards until the suffix spans mixedMinSessions sessions (or the buffer is exhausted)
    const ids = new Set<number>()
    for (let i = dc.length - 1; i >= 0; i--) {
      ids.add(dc[i]!.sessionId)
      if (i <= start && ids.size >= r.mixedMinSessions) {
        start = i
        break
      }
      if (i === 0) start = 0
    }
  }
  const w = dc.slice(start)
  const accuracy = w.filter((x) => x.correct).length / w.length
  const sessions = new Set(w.map((x) => x.sessionId)).size
  const days = new Set(w.map((x) => x.dayKey)).size
  const pass = accuracy >= threshold && sessions >= r.mixedMinSessions && days >= r.mixedMinDays && struggling <= r.mixedMaxStruggling
  return { pass, accuracy, sessions, days, struggling }
}
