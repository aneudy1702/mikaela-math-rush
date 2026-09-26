// D12 exact invariant: replaying an attempt log with latencies scaled yields identical status, counted-evidence flags,
// level completion and record eligibility.
import type { Rules } from './rules.ts'
import { applyAttempt } from './status.ts'
import { newLearnerState, pushEvidence, recordEligible } from './session.ts'
import { evaluateMixedLevel, evaluateTableLevel } from './completion.ts'
import type { SessionRecord } from './journey.ts'

/** Returns a description of the first mismatch, or null if every decision matches. */
export function replayWithLatencyScale(records: SessionRecord[], r: Rules, scale: number): string | null {
  if (records.some((rec) => rec.log.length === 0)) throw new Error('invariance replay needs keepRecords logs')
  const state = newLearnerState()
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx]!
    const sessionId = idx + 1
    const missed = new Set<string>()
    const buf = state.evidence.get(rec.levelId) ?? []
    state.evidence.set(rec.levelId, buf)
    let draws = 0
    let drawsCorrect = 0
    for (const q of rec.log) {
      const f = state.facts.get(q.factId)!
      const counted = !missed.has(q.factId)
      if (counted !== q.counted) return `session ${sessionId} q${q.q} ${q.factId}: counted ${counted} vs ${q.counted}`
      applyAttempt(f, { correct: q.correct, latencyMs: q.latencyMs * scale, sessionId, q: q.q, counted, inferred: false, source: q.source }, r)
      if (!q.correct) missed.add(q.factId)
      if (f.status !== q.statusAfter) return `session ${sessionId} q${q.q} ${q.factId}: status ${f.status} vs ${q.statusAfter} (scale ${scale})`
      if (q.source === 'draw') {
        draws++
        if (q.correct) drawsCorrect++
      }
      pushEvidence(buf, { factId: q.factId, correct: q.correct, sessionId, dayKey: rec.dayKey }, q.source, counted, r)
    }
    if (recordEligible(drawsCorrect, draws, r) !== rec.recordEligible) return `session ${sessionId}: record eligibility differs (scale ${scale})`
    const pass = rec.levelId < 9 ? evaluateTableLevel(rec.levelId, state.facts, buf, rec.sessionsAtLevel, r).pass : evaluateMixedLevel(state.facts, buf, r).pass
    if (pass !== rec.pass) return `session ${sessionId} L${rec.levelId}: completion ${pass} vs ${rec.pass} (scale ${scale})`
  }
  return null
}
