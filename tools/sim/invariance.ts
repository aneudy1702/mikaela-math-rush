// Hard invariant (owner requirement 1a): status, completion (R1–R5, L9) and record eligibility are latency-independent.
// Replays recorded attempt sequences with latencies scaled and asserts every decision is identical.
import type { Rules } from './rules.ts'
import { applyAttempt } from './status.ts'
import { newLearnerState, recordEligible } from './session.ts'
import { evaluateMixedLevel, evaluateTableLevel } from './completion.ts'
import type { SessionRecord } from './journey.ts'

/** Returns a description of the first mismatch, or null if every decision matches. */
export function replayWithLatencyScale(records: SessionRecord[], r: Rules, scale: number): string | null {
  const state = newLearnerState()
  if (records.some((rec) => rec.log.length === 0)) throw new Error('invariance replay needs keepRecords logs')
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx]!
    const sessionId = idx + 1
    const missed = new Set<string>()
    const buf = state.levelAnswers.get(rec.levelId) ?? []
    state.levelAnswers.set(rec.levelId, buf)
    const bufCap = Math.max(r.levelAnswerBuffer, r.levelAccuracyWindow, r.mixedWindow)
    let dc = 0
    let dcCorrect = 0
    for (const q of rec.log) {
      const f = state.facts.get(q.factId)!
      const counted = !missed.has(q.factId)
      if (counted !== q.counted) return `session ${sessionId} q${q.q} ${q.factId}: counted ${counted} vs ${q.counted}`
      applyAttempt(f, { correct: q.correct, latencyMs: q.latencyMs * scale, sessionId, q: q.q, atMs: 0, counted, inferred: false, source: q.source }, r)
      if (!q.correct) missed.add(q.factId)
      if (f.status !== q.statusAfter) return `session ${sessionId} q${q.q} ${q.factId}: status ${f.status} vs ${q.statusAfter} (scale ${scale})`
      if (q.source === 'draw' || q.source === 'confirm') {
        dc++
        if (q.correct) dcCorrect++
        buf.push({ correct: q.correct, source: q.source, sessionId, dayKey: rec.dayKey })
        if (buf.length > bufCap) buf.shift()
      }
    }
    if (recordEligible(dcCorrect, dc, r) !== rec.recordEligible) return `session ${sessionId}: record eligibility differs (scale ${scale})`
    if (rec.tablePass !== null) {
      const ev = evaluateTableLevel(rec.levelId, state.facts, buf, rec.sessionsAtLevel, r)
      if (ev.pass !== rec.tablePass) return `session ${sessionId} L${rec.levelId}: completion ${ev.pass} vs ${rec.tablePass} (scale ${scale})`
    }
    if (rec.mixedPass) {
      for (const [t, pass] of Object.entries(rec.mixedPass)) {
        const ev = evaluateMixedLevel(state.facts, buf, r, Number(t))
        if (ev.pass !== pass) return `session ${sessionId} L9@${t}: completion ${ev.pass} vs ${pass} (scale ${scale})`
      }
    }
  }
  return null
}
