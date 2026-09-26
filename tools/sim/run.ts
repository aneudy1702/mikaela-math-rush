// T-SIM driver: runs every experiment and writes docs/v2/SIM-REPORT.md.
// Usage: node tools/sim/run.ts   (env SIM_N, SIM_NE, SIM_NV override learners per cell)
// Exit code 1 if a hard invariant fails: E(a) latency independence (any mode) or E(b) for the recommended
// slowness mode (option 2 budget-neutral). Rev-3 / naive E(b) failures are reported loudly but are findings.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RULES, withOverrides, type Mode, type Rules } from './rules.ts'
import { LEVELS, OWNER_LEVEL } from './curriculum.ts'
import { CLUSTER, LEARNER_SPECS, knowsUpToLearner, learnerLabel, uniformLearner, UNIFORM_PS, type Learner } from './learners.ts'
import { hashSeed, makeRngs, mulberry32, runJourney, type JourneyOpts, type JourneyResult, type Pattern } from './journey.ts'
import { cloneState, newLearnerState, playSession, type LearnerState } from './session.ts'
import { evaluateMixedLevel, evaluateTableLevel } from './completion.ts'
import { xpForSession } from './xp.ts'
import { runPlacement } from './placement.ts'
import { replayWithLatencyScale } from './invariance.ts'
import { fmtN, fmtPct, ksTest, max, mean, median, pct, table } from './stats.ts'
import { GAPS, LIMITS, RECOMMENDED, SUMMARY } from './notes.ts'

const N = Number(process.env.SIM_N ?? 400)
const NEREP = Number(process.env.SIM_NEREP ?? 4000)
const NE = Number(process.env.SIM_NE ?? 1000)
const NV = Number(process.env.SIM_NV ?? 200)
const PATTERNS: Pattern[] = ['quick', 'practice', 'mixed']
const THRESHOLDS = [0.85, 0.88, 0.9]
const CAP = 60
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const kindOf = (key: string) => LEARNER_SPECS.find((s) => s.key === key)!.kind

function runCell(rules: Rules, key: string, pattern: Pattern, n: number, extra: Partial<JourneyOpts> = {}): JourneyResult[] {
  const spec = LEARNER_SPECS.find((s) => s.key === key)!
  const out: JourneyResult[] = []
  for (let i = 0; i < n; i++) {
    out.push(runJourney({ rules, learner: spec.make(), pattern, seed: hashSeed(pattern, i), l9Thresholds: THRESHOLDS, maxSessionsPerLevel: CAP, ...extra }))
  }
  return out
}

// ---------- metric helpers ----------
const levelSessions = (rs: JourneyResult[], L: number) => rs.map((r) => r.sessions[L]).filter((x): x is number => x !== null && x !== undefined)
const medP90 = (xs: number[]) => (xs.length ? `${fmtN(median(xs))}/${fmtN(pct(xs, 0.9))}` : '—')
function stuck(rs: JourneyResult[], cap: number): { rate: number; level: string } {
  const hist = new Map<number, number>()
  let n = 0
  for (const r of rs) {
    for (let L = 1; L <= 9; L++) {
      const s = r.sessions[L]
      if (s !== null && s !== undefined && s > cap) {
        n++
        hist.set(L, (hist.get(L) ?? 0) + 1)
        break
      }
    }
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1])
  const level = top.length ? top.slice(0, 2).map(([L, c]) => `L${L} ${Math.round((100 * c) / rs.length)}%`).join(', ') : ''
  return { rate: n / rs.length, level }
}
const expStuck = (rs: JourneyResult[]) => ({
  ge3: rs.filter((r) => r.longestDrought >= 3).length / rs.length,
  ge5: rs.filter((r) => r.longestDrought >= 5).length / rs.length,
  med: median(rs.map((r) => r.longestDrought)),
})
const cum = (rs: JourneyResult[]) => rs.map((r) => r.cumulative)
const firstSession = (rs: JourneyResult[], L: number) => rs.map((r) => r.firstSessionProgress[L]).filter((x): x is number => x !== null)
const typicalLevelMedian = (rs: JourneyResult[]) => median(LEVELS.slice(0, 8).map((l) => median(levelSessions(rs, l.id))).filter((x) => !Number.isNaN(x)))

const lines: string[] = []
const out = (s = '') => lines.push(s)
const hardFailures: string[] = []
const softFailures: string[] = []

// ================= A. Baseline (rev-3) =================
log(`A: rev-3 baseline, ${N} learners/cell, ${LEARNER_SPECS.length} learners`)
const A = new Map<string, JourneyResult[]>()
for (const spec of LEARNER_SPECS) for (const p of PATTERNS) A.set(`${spec.key}|${p}`, runCell(RULES, spec.key, p, N))
log('A done')

// ================= L9 capstone (definition C) =================
log('CAP: L9 definition C (capstone)')
const RULES_CAP = withOverrides({ simL9Mode: 'capstone' })
const CAPR = new Map<string, JourneyResult[]>()
for (const spec of LEARNER_SPECS) for (const p of PATTERNS) CAPR.set(`${spec.key}|${p}`, runCell(RULES_CAP, spec.key, p, N, { keepSessionOutcomes: false }))
log('CAP done')

// ================= B / P1. Provisional off =================
log('B: provisional off')
const RULES_NOPROV = withOverrides({ provisionalEnabled: false })
const B = new Map<string, JourneyResult[]>()
for (const spec of LEARNER_SPECS) for (const p of PATTERNS) B.set(`${spec.key}|${p}`, runCell(RULES_NOPROV, spec.key, p, N, { keepSessionOutcomes: false }))
log('B done')

// ================= E(a). Latency-scaling replay (all slowness modes) =================
const SLOW_MODES: { label: string; mode: Rules['simSlownessMode']; asserted: boolean }[] = [
  { label: 'rev-3 (non-mastered only)', mode: 'rev3', asserted: false },
  { label: 'option 2 naive (mastered only, single stage)', mode: 'mastered-naive', asserted: false },
  { label: 'option 2 budget-neutral (two-stage)', mode: 'mastered-two-stage', asserted: true },
]
log('E(a): latency-scaling replay')
let invChecked = 0
let invSessions = 0
for (const m of SLOW_MODES) {
  const rules = withOverrides({ simSlownessMode: m.mode })
  const per = m.mode === 'rev3' ? 12 : 6
  for (const spec of LEARNER_SPECS) {
    for (const p of PATTERNS) {
      for (let i = 0; i < per; i++) {
        const j = runJourney({ rules, learner: spec.make(), pattern: p, seed: hashSeed('inv', p, i), l9Thresholds: THRESHOLDS, maxSessionsPerLevel: 25, keepRecords: true, keepSessionOutcomes: false })
        for (const scale of [1, 0.3, 3]) {
          const err = replayWithLatencyScale(j.records!, rules, scale)
          if (err) throw new Error(`HARD INVARIANT 1a FAILED (${m.mode} ${spec.key}/${p}/#${i}): ${err}`)
        }
        invChecked++
        invSessions += j.records!.length
      }
    }
  }
}
log(`E(a) ok: ${invChecked} journeys, ${invSessions} sessions × 3 scales`)

// ================= E(b). Fast vs slow p = 0.90 under each slowness mode =================
log(`E(b): fast vs slow p=0.90, ${NE} learners/cell, 3 slowness modes`)
const E = new Map<string, { fast: JourneyResult[]; slow: JourneyResult[]; fastNS: JourneyResult[]; slowNS: JourneyResult[] }>()
for (const m of SLOW_MODES) {
  const rules = withOverrides({ simSlownessMode: m.mode })
  for (const p of PATTERNS) {
    E.set(`${m.mode}|${p}`, {
      fast: runCell(rules, 'u0.90', p, NE, { keepSessionOutcomes: false }),
      slow: runCell(rules, 'slow0.90', p, NE, { keepSessionOutcomes: false }),
      fastNS: runCell(rules, 'u0.90', p, 200, { keepSessionOutcomes: false, slownessEnabled: false }),
      slowNS: runCell(rules, 'slow0.90', p, 200, { keepSessionOutcomes: false, slownessEnabled: false }),
    })
  }
}
log(`E(b) replication: two-stage, ${NEREP} learners/cell`)
const EREP = new Map<string, { fast: JourneyResult[]; slow: JourneyResult[] }>()
{
  const rules = withOverrides({ simSlownessMode: 'mastered-two-stage' })
  for (const p of PATTERNS) EREP.set(p, { fast: runCell(rules, 'u0.90', p, NEREP, { keepSessionOutcomes: false }), slow: runCell(rules, 'slow0.90', p, NEREP, { keepSessionOutcomes: false }) })
}
log('E(b) done')

// ================= Cluster recovery =================
log('CL: cluster recovery')
const CL_AT = [10, 20, 40, 60]
interface ClusterRun {
  at: Map<number, { meanP: number[]; mastered: number[] }>
  firstMastered: Map<string, number[]>
  never: Map<string, number>
}
const CL = new Map<string, ClusterRun>()
for (const key of ['L-clustered', 'clustered']) {
  for (const p of PATTERNS) {
    const run: ClusterRun = { at: new Map(CL_AT.map((k) => [k, { meanP: [], mastered: [] }])), firstMastered: new Map([...CLUSTER].map((f) => [f, []])), never: new Map([...CLUSTER].map((f) => [f, 0])) }
    const spec = LEARNER_SPECS.find((s) => s.key === key)!
    for (let i = 0; i < N; i++) {
      const firstM = new Map<string, number>()
      let last: { meanP: number; mastered: number } | null = null
      let lastIdx = 0
      const snap = (st: LearnerState, L: Learner) => {
        const ps = [...CLUSTER].map((f) => L.p(f))
        const m = [...CLUSTER].filter((f) => st.facts.get(f)!.status === 'mastered').length
        return { meanP: mean(ps), mastered: m / CLUSTER.size }
      }
      runJourney({
        rules: RULES,
        learner: spec.make(),
        pattern: p,
        seed: hashSeed(p, i),
        l9Thresholds: THRESHOLDS,
        maxSessionsPerLevel: CAP,
        keepSessionOutcomes: false,
        onSessionEnd: (idx, st, L) => {
          for (const f of CLUSTER) if (!firstM.has(f) && st.facts.get(f)!.everMastered) firstM.set(f, idx)
          last = snap(st, L)
          lastIdx = idx
          if (run.at.has(idx)) {
            run.at.get(idx)!.meanP.push(last.meanP)
            run.at.get(idx)!.mastered.push(last.mastered)
          }
        },
      })
      // Journeys that finished before a checkpoint carry their final values forward.
      for (const k of CL_AT) if (k > lastIdx && last) {
        run.at.get(k)!.meanP.push((last as { meanP: number }).meanP)
        run.at.get(k)!.mastered.push((last as { mastered: number }).mastered)
      }
      for (const f of CLUSTER) {
        const v = firstM.get(f)
        if (v === undefined) run.never.set(f, run.never.get(f)! + 1)
        else run.firstMastered.get(f)!.push(v)
      }
    }
    CL.set(`${key}|${p}`, run)
  }
}
log('CL done')

// ================= H. Sensitivity =================
log('H: sensitivity')
const H_CONFIGS: { label: string; rules: Rules }[] = [
  { label: 'baseline', rules: RULES },
  { label: 'masteredMinCorrectInWindow 2', rules: withOverrides({ masteredMinCorrectInWindow: 2 }) },
  { label: 'levelAccuracyMin 0.80', rules: withOverrides({ levelAccuracyMin: 0.8 }) },
  { label: 'levelAccuracyMin 0.90', rules: withOverrides({ levelAccuracyMin: 0.9 }) },
  { label: 'successFloor 0.3', rules: withOverrides({ successFloor: 0.3 }) },
  { label: 'successFloor 0.5', rules: withOverrides({ successFloor: 0.5 }) },
  { label: 'minDistinctSessionsForMastery 1', rules: withOverrides({ minDistinctSessionsForMastery: 1 }) },
]
const H_LEARNERS = ['u0.75', 'u0.90', 'L-typical', 'L-start75']
const H = new Map<string, JourneyResult[]>()
for (const c of H_CONFIGS) for (const k of H_LEARNERS) H.set(`${c.label}|${k}`, c.label === 'baseline' ? A.get(`${k}|quick`)! : runCell(c.rules, k, 'quick', N))
log('H done')

// ================= P2. R4 =================
log('P2: R4 window 30 / R4 off')
const P2_LEARNERS = ['u0.80', 'u0.85', 'L-start75', 'L-slow']
const P2 = new Map<string, JourneyResult[]>()
for (const k of P2_LEARNERS) {
  for (const p of PATTERNS) {
    P2.set(`w30|${k}|${p}`, runCell(withOverrides({ levelAccuracyWindow: 30 }), k, p, N, { keepSessionOutcomes: false }))
    P2.set(`off|${k}|${p}`, runCell(withOverrides({ levelAccuracyWindow: 0 }), k, p, N, { keepSessionOutcomes: false }))
  }
}
log('P2 done')

// ================= V. Candidate fixes =================
log(`V: candidate fixes, ${NV} learners/cell`)
const V_CONFIGS: { label: string; rules: Rules }[] = [
  { label: 'V1 span over C', rules: withOverrides({ simSpanOverC: true }) },
  { label: 'V2 confirm non-mastered only', rules: withOverrides({ simConfirmNonMasteredOnly: true }) },
  { label: 'V1+V2', rules: withOverrides({ simSpanOverC: true, simConfirmNonMasteredOnly: true }) },
  { label: 'V1 + provisional off', rules: withOverrides({ simSpanOverC: true, provisionalEnabled: false }) },
  { label: 'V3 mixedMinSessions 2', rules: withOverrides({ mixedMinSessions: 2 }) },
  { label: 'V4 extended L9 window', rules: withOverrides({ simMixedWindowExtends: true, levelAnswerBuffer: 400 }) },
]
const V_LEARNERS = ['u0.80', 'u0.85', 'u0.90', 'u0.95', 'u1.00', 'clustered', 'L-slow', 'L-typical', 'L-start75', 'L-clustered']
const V = new Map<string, JourneyResult[]>()
for (const c of V_CONFIGS) for (const k of V_LEARNERS) for (const p of PATTERNS) V.set(`${c.label}|${k}|${p}`, runCell(c.rules, k, p, NV, { keepSessionOutcomes: false }))
log('V done')

log('R: all-Rush')
const R_CONFIGS: { label: string; rules: Rules }[] = [
  { label: 'baseline', rules: RULES },
  { label: 'V1 span over C', rules: withOverrides({ simSpanOverC: true }) },
  { label: 'V1 + provisional off', rules: withOverrides({ simSpanOverC: true, provisionalEnabled: false }) },
  { label: 'V1 + V4', rules: withOverrides({ simSpanOverC: true, simMixedWindowExtends: true, levelAnswerBuffer: 400 }) },
]
const R_LEARNERS = ['u0.90', 'u0.95', 'u1.00', 'L-typical', 'L-fast']
const NR = 100
const RR = new Map<string, JourneyResult[]>()
for (const c of R_CONFIGS) for (const k of R_LEARNERS) RR.set(`${c.label}|${k}`, runCell(c.rules, k, 'rush', NR, { keepSessionOutcomes: false, maxSessionsPerLevel: 20 }))
log('R done')

// ================= F. Placement =================
log('F: placement')
const NP = 5000
const F: { label: string; ideal: number | null; qs: number[]; starts: number[]; capped: number }[] = []
const DROP: { k: number; over: number; overOffered: number; exact: number; exactOffered: number }[] = []
function placementTrials(L: Learner, seedKey: string): { qs: number[]; starts: number[]; capped: number } {
  const rng = mulberry32(hashSeed('placement', seedKey))
  const qs: number[] = []
  const starts: number[] = []
  let capped = 0
  for (let i = 0; i < NP; i++) {
    const res = runPlacement(L, RULES, rng)
    qs.push(res.questions)
    starts.push(res.start)
    if (res.capped) capped++
  }
  return { qs, starts, capped }
}
for (let k = 0; k <= 8; k++) {
  const known = new Set<string>()
  for (const [f, L] of OWNER_LEVEL) if (L <= k) known.add(f)
  const L = knowsUpToLearner(known)
  const t = placementTrials(L, `k${k}`)
  F.push({ label: k === 0 ? 'knows nothing' : `knows L1–L${k}`, ideal: k + 1, ...t })
  // Drop-down offer (D4): 2 Quick sessions at the placed level from a fresh state; offer if accuracy < 70%.
  let over = 0
  let overOffered = 0
  let exact = 0
  let exactOffered = 0
  for (let i = 0; i < 1000; i++) {
    const start = t.starts[i]!
    const st = newLearnerState()
    const rngs = makeRngs(hashSeed('drop', k, i))
    let c = 0
    let n = 0
    for (let s = 0; s < RULES.dropDownOfferSessions; s++) {
      const o = playSession({ state: st, learner: L, levelId: start, mode: 'quick', rules: RULES, rngs, dayKey: s + 1 })
      c += o.drawConfirmCorrect
      n += o.drawConfirm
    }
    const offered = c / n < RULES.dropDownOfferAccuracy
    if (start > k + 1) {
      over++
      if (offered) overOffered++
    } else if (start === k + 1) {
      exact++
      if (offered) exactOffered++
    }
  }
  DROP.push({ k, over, overOffered, exact, exactOffered })
}
for (const p of UNIFORM_PS) F.push({ label: `uniform ${p.toFixed(2)}`, ideal: null, ...placementTrials(uniformLearner(p), `u${p}`) })
log('F done')

// ================= G. XP =================
log('G: XP progress vs replay')
const NG = 100
const REPS = 3
interface GRow {
  learner: string
  kind: string
  mode: Mode
  checkpoint: number
  progTotal: number[]
  progRepeat: number[]
  replaySteady: number[]
  replayFirst: number[]
}
const G: GRow[] = []
function playXpSessions(state: LearnerState, learner: Learner, levelId: number, mode: Mode, completedBefore: boolean, seed: number): { xp: number; repeat: number; firstFinishXp: number; minutes: number } {
  const rngs = makeRngs(seed)
  let xp = 0
  let repeat = 0
  let minutes = 0
  let firstFinishXp = 0
  for (let s = 0; s < REPS; s++) {
    const o = playSession({ state, learner, levelId, mode, rules: RULES, rngs, dayKey: 10_000 + s })
    let completedNow = false
    if (!completedBefore) {
      if (levelId < 9) completedNow = evaluateTableLevel(levelId, state.facts, state.levelAnswers.get(levelId)!, s + 1, RULES).pass
      else completedNow = evaluateMixedLevel(state.facts, state.levelAnswers.get(9)!, RULES).pass
    }
    const base = { mode, levelCompletedBefore: completedBefore, isProgressLevel: !completedBefore, correct: o.correct, perfect: o.perfect, newlyMastered: o.newlyMastered, levelCompletedNow: completedNow, recordBeaten: false, recordXpAvailableToday: true }
    const x = xpForSession({ ...base, firstFinishLevelMode: !completedBefore && s === 0 }, RULES)
    if (completedBefore && s === 0) firstFinishXp = xpForSession({ ...base, firstFinishLevelMode: true }, RULES).total / (o.elapsedMs / 60000)
    xp += x.total
    repeat += x.repeatable
    minutes += o.elapsedMs / 60000
    if (completedNow) break
  }
  return { xp, repeat, firstFinishXp, minutes }
}
for (const key of ['u0.90', 'u1.00', 'slow0.90', 'L-typical', 'L-start75']) {
  for (const mode of ['quick', 'practice', 'rush'] as Mode[]) {
    for (const cp of [5, 9]) {
      const row: GRow = { learner: learnerLabel(key), kind: kindOf(key), mode, checkpoint: cp, progTotal: [], progRepeat: [], replaySteady: [], replayFirst: [] }
      const spec = LEARNER_SPECS.find((s) => s.key === key)!
      for (let i = 0; i < NG; i++) {
        const j = runJourney({ rules: RULES, learner: spec.make(), pattern: mode, seed: hashSeed('G', mode, i), maxSessionsPerLevel: 40, checkpointAtLevel: cp, cloneForCheckpoint: cloneState, stopAtCheckpoint: true, keepSessionOutcomes: false })
        if (!j.checkpoint) continue
        const cpS = j.checkpoint
        const prog = playXpSessions(cloneState(cpS.state), cpS.learner.clone(), cp, mode, false, hashSeed('Gp', i))
        row.progTotal.push(prog.xp / prog.minutes)
        row.progRepeat.push(prog.repeat / prog.minutes)
        let best = -1
        let bestFirst = -1
        for (let L = 1; L < cp; L++) {
          const rp = playXpSessions(cloneState(cpS.state), cpS.learner.clone(), L, mode, true, hashSeed('Gr', i, L))
          best = Math.max(best, rp.xp / rp.minutes)
          bestFirst = Math.max(bestFirst, rp.firstFinishXp)
        }
        row.replaySteady.push(best)
        row.replayFirst.push(bestFirst)
      }
      G.push(row)
    }
  }
}
log('G done')

// =====================================================================
// Report
// =====================================================================
const cells = LEARNER_SPECS.flatMap((s) => PATTERNS.map((p) => ({ key: s.key, kind: s.kind, p, label: learnerLabel(s.key) })))

out('# Math Rush V2 — Learner Simulator Report (T-SIM)')
out()
out(`Generated by \`node tools/sim/run.ts\` (Node ${process.version}). Reference implementation of DECISIONS.md §B (revision 3) in \`tools/sim/\`; owner follow-up variants are sim-only flags (default off), so the rev-3 baseline is what table A shows.`)
out(`Learners per cell: **${N}** (A, CAP, B, H, P2, cluster), **${NE}** (E(b)), **${NV}** (candidate fixes), ${NR} (Rush), ${NP} (placement), ${NG} (XP). 1 session per day, beginner at L1, no placement.`)
out(`Per-level session cap ${CAP} (hitting it = censored = ∞). Mixed pattern = 70% Quick / 30% Practice per session. Seeded (mulberry32), same seed index across learners and rule variants (paired comparisons). Runtime ${((Date.now() - t0) / 1000).toFixed(0)} s.`)
out()
out('**Static learners** have a fixed true p per fact (uniform p, clustered-weak, slow-accurate). A permanently-75% child may reasonably never certify mastery; a static learner failing to progress is not by itself a defect. **Learning learners** improve with spaced practice and forget when unseen (learning slow/typical/fast η = 0.08/0.15/0.25; learning clustered; learning start~75%; plus the rev-3 brief\'s "improving" model). Every recommendation below names the profiles it rests on.')
out()
out('Cell notation: `median/p90` sessions; ∞ = censored at the cap. **Academic stuck >N** = % of learners needing more than N sessions at some single level (most common levels in brackets). **Experience stuck** = % of learners with ≥ 3 (≥ 5) consecutive sessions without a visible-progress event (gating mastered+provisional count up, any fact moving up a status, level-up, badge, record beaten, player level-up; XP alone does not count); "drought" = median longest such run.')
out()
out('## 1. Summary')
out()
out(SUMMARY)
out()
out('## 2. Recommended rule set')
out()
out(RECOMMENDED)
out()

// ---- 3. Slowness option 2 ----
out('## 3. Slowness option 2 (speed only steers mastered-fact review) — E / P4 hard invariant')
out()
out(`**E(a) exact latency independence: PASS for all three slowness modes.** ${invChecked} journeys (every learner × pattern; 12 per cell for rev-3, 6 for each option-2 mode; ≤ 25 sessions/level), ${invSessions} sessions, replayed with every latency ×1, ×0.3 and ×3. Every per-attempt status and counted flag, every R1–R5 and L9 (0.85/0.88/0.90) decision and every record-eligibility decision was identical. The run throws on any mismatch.`)
out()
out(`**E(b) statistical equivalence**, slow-accurate p = 0.90 (7–10 s) vs fast p = 0.90 (2–4 s), ${NE} learners each. Criteria unchanged: per-level |Δmedian| ≤ 0.5, |Δp90| ≤ 1, |Δstuck>20| ≤ 2 pp, KS on cumulative sessions-to-L9 p ≥ 0.05. Cells: \`fast median/p90 vs slow median/p90\`.`)
out()
function equivalence(fast: JourneyResult[], slow: JourneyResult[]): { perLevel: string[]; stuckS: string; ksS: string; viol: string[] } {
  const viol: string[] = []
  const perLevel: string[] = []
  for (const l of LEVELS) {
    const a = levelSessions(fast, l.id)
    const b = levelSessions(slow, l.id)
    const dm = Math.abs(median(a) - median(b))
    const d9 = Math.abs(pct(a, 0.9) - pct(b, 0.9))
    if (!(dm <= 0.5 || median(a) === median(b))) viol.push(`L${l.id} Δmedian ${fmtN(dm)}`)
    if (!(d9 <= 1 || pct(a, 0.9) === pct(b, 0.9))) viol.push(`L${l.id} Δp90 ${fmtN(d9)}`)
    perLevel.push(`${fmtN(median(a))}/${fmtN(pct(a, 0.9))} vs ${fmtN(median(b))}/${fmtN(pct(b, 0.9))}`)
  }
  const sf = stuck(fast, 20).rate
  const ss = stuck(slow, 20).rate
  if (Math.abs(sf - ss) > 0.02) viol.push(`stuck Δ ${fmtPct(Math.abs(sf - ss), 1)}`)
  const ks = ksTest(cum(fast), cum(slow))
  if (ks.p < 0.05) viol.push(`KS p=${ks.p.toFixed(3)}`)
  const mf = mean(cum(fast).filter(Number.isFinite))
  const ms = mean(cum(slow).filter(Number.isFinite))
  return { perLevel, stuckS: `${fmtPct(sf, 1)} vs ${fmtPct(ss, 1)}`, ksS: `D=${ks.d.toFixed(3)} p=${ks.p.toFixed(3)}; mean ${fmtN(mf, 1)} vs ${fmtN(ms, 1)}`, viol }
}
const eRows: string[][] = []
for (const m of SLOW_MODES) {
  for (const p of PATTERNS) {
    const e = E.get(`${m.mode}|${p}`)!
    const eq = equivalence(e.fast, e.slow)
    let identical = true
    for (let i = 0; i < e.fastNS.length; i++) if (e.fastNS[i]!.sessions.join() !== e.slowNS[i]!.sessions.join()) identical = false
    if (!identical) hardFailures.push(`E control (${m.mode}, ${p}): with slowness disabled, fast and slow paths differ — a latency leak outside the slowness multiplier`)
    if (eq.viol.length) (m.asserted ? hardFailures : softFailures).push(`E(b) ${m.label} / ${p}: ${eq.viol.join('; ')}`)
    eRows.push([m.label, p, ...eq.perLevel, eq.stuckS, eq.ksS, identical ? 'identical' : 'DIFFER', eq.viol.length ? `**FAIL**: ${eq.viol.join('; ')}` : '**PASS**'])
  }
}
out(table(['Slowness mode', 'Pattern', ...LEVELS.map((l) => `L${l.id}`), 'stuck>20', 'KS cum→L9 (mean)', 'slowness off: 200 paired paths', 'verdict'], eRows))
out()
out(`Replication of the recommended mode (option 2 budget-neutral) with ${NEREP} learners per side (same criteria; informational — the asserted check is the ${NE}-learner row above). For every level the cell also gives P(sessions ≤ fast median) for fast vs slow, to show whether a median difference is a distribution shift or an integer-median boundary tie.`)
out()
out(
  table(
    ['Pattern', ...LEVELS.map((l) => `L${l.id}`), 'stuck>20', 'KS cum→L9 (mean)', 'verdict'],
    PATTERNS.map((p) => {
      const e = EREP.get(p)!
      const eq = equivalence(e.fast, e.slow)
      const cellsL = LEVELS.map((l, i) => {
        const a = levelSessions(e.fast, l.id)
        const b = levelSessions(e.slow, l.id)
        const m = median(a)
        return `${eq.perLevel[i]} (P≤${fmtN(m)}: ${fmtPct(a.filter((x) => x <= m).length / a.length, 1)} vs ${fmtPct(b.filter((x) => x <= m).length / b.length, 1)})`
      })
      return [p, ...cellsL, eq.stuckS, eq.ksS, eq.viol.length ? `FAIL: ${eq.viol.join('; ')}` : 'PASS']
    }),
  ),
)
out()
out('"slowness off" re-runs 200 paired seeds with every slowness factor forced to 1.0: fast and slow learners then produce identical session-by-session paths in every mode, so any remaining difference is caused by the slowness multiplier alone.')
out()

// ---- 4. Static vs learning ----
out('## 4. Static vs learning learners — progression and both stuck metrics (rev-3 rules)')
out()
for (const kind of ['static', 'learning'] as const) {
  out(`### 4${kind === 'static' ? 'a' : 'b'}. ${kind === 'static' ? 'Static' : 'Learning'} learners`)
  out()
  out(
    table(
      ['Learner', 'Pattern', 'L1–L9 medians', 'Cum → L9', 'Acad. stuck >12', 'Acad. stuck >20 (level)', 'Exp. stuck ≥3', 'Exp. stuck ≥5', 'drought (median longest)'],
      cells.filter((c) => c.kind === kind).map(({ key, p, label }) => {
        const rs = A.get(`${key}|${p}`)!
        const s20 = stuck(rs, 20)
        const ex = expStuck(rs)
        return [label, p, LEVELS.map((l) => fmtN(median(levelSessions(rs, l.id)))).join(' '), medP90(cum(rs)), fmtPct(stuck(rs, 12).rate), `${fmtPct(s20.rate)}${s20.level ? ` (${s20.level})` : ''}`, fmtPct(ex.ge3), fmtPct(ex.ge5), fmtN(ex.med)]
      }),
    ),
  )
  out()
}
out('### 4c. Learning learners — accuracy growth')
out()
out('Mean true p of the facts drawn / observed session accuracy (all answers), at session index k (learners still playing; n in brackets).')
out()
const GROW_AT = [1, 5, 10, 20, 30, 40, 60]
out(
  table(
    ['Learner', 'Pattern', ...GROW_AT.map((k) => `s${k}`)],
    cells.filter((c) => c.kind === 'learning').map(({ key, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      return [label, p, ...GROW_AT.map((k) => {
        const os = rs.map((r) => r.sessionOutcomes[k - 1]).filter((o) => o !== undefined)
        return os.length ? `${fmtN(mean(os.map((o) => o!.meanP)), 2)} / ${fmtN(mean(os.map((o) => o!.accuracyAll)), 2)} (${os.length})` : '—'
      })]
    }),
  ),
)
out()
out('### 4d. Weak-cluster recovery ({6x7, 6x8, 7x7, 7x8, 7x9, 8x8, 8x9})')
out()
out('Cluster mean true p · % of cluster facts currently mastered, at session index k (journeys that already finished carry their final values). Static clustered-weak (p fixed 0.5) shown for reference.')
out()
out(
  table(
    ['Learner', 'Pattern', ...CL_AT.map((k) => `s${k}`)],
    [...CL.entries()].map(([k, run]) => {
      const [key, p] = k.split('|')
      return [learnerLabel(key!), p!, ...CL_AT.map((a) => {
        const v = run.at.get(a)!
        return v.meanP.length ? `${fmtN(mean(v.meanP), 2)} · ${fmtPct(mean(v.mastered))}` : '—'
      })]
    }),
  ),
)
out()
out('Sessions (journey index) until each cluster fact is first mastered: `median/p90`, and % never mastered before the journey ended.')
out()
out(
  table(
    ['Learner', 'Pattern', ...[...CLUSTER]],
    [...CL.entries()].map(([k, run]) => {
      const [key, p] = k.split('|')
      return [learnerLabel(key!), p!, ...[...CLUSTER].map((f) => `${medP90(run.firstMastered.get(f)!)} (${fmtPct(run.never.get(f)! / N)} never)`)]
    }),
  ),
)
out()

// ---- 5. Stuck metrics pivot ----
out('## 5. Stuck metrics — academic vs experience by pattern')
out()
out('Cell: `academic >20 · experience ≥3` (rev-3 rules). Academic stuck measures certification; experience stuck measures how often a child plays 3+ sessions in a row without seeing anything move.')
out()
out(
  table(
    ['Learner', 'kind', ...PATTERNS],
    LEARNER_SPECS.map((s) => [learnerLabel(s.key), s.kind, ...PATTERNS.map((p) => {
      const rs = A.get(`${s.key}|${p}`)!
      return `${fmtPct(stuck(rs, 20).rate)} · ${fmtPct(expStuck(rs).ge3)}`
    })]),
  ),
)
out()

// ---- 6. L9 A/B/C ----
out('## 6. Mixed 1–10 (L9): A (accuracy only) vs B (rev-3: + ≤ 2 struggling) vs C (capstone)')
out()
out('**Cr** (sim-only candidate, not in the brief) = C with a rolling retention measure: accuracy over the last 20 answers on prior-mastered facts at L9 (any appearance, draw/confirm), same other conditions — tested because C as written has a frozen-measure trap (table at the end of this section).')
out()
out('A and B are evaluated on the same rev-3 L9 play; C uses capstone selection (50% of pool draws to carried not-yet-mastered facts while any remain, the rest a spread sample of prior-mastered facts, unseen first) and the C completion rule (≥ 2 sessions on ≥ 2 days; first-L9-appearance accuracy of prior-mastered facts ≥ 0.85 (or 0.80) over ≥ 20 first appearances; every carried fact at least learning with a correct counted L9 attempt). L1–L8 play is identical across A/B/C (same seeds). Learners keep playing L9 until every definition has passed or the cap (60).')
out()
const DEFS_AB = THRESHOLDS.flatMap((t) => [`A@${t.toFixed(2)}`, `B@${t.toFixed(2)}`])
const DEFS_C = ['C@0.85', 'C@0.80', 'Cr@0.85', 'Cr@0.80']
const defRuns = (key: string, p: Pattern, d: string) => (d.startsWith('C') ? CAPR : A).get(`${key}|${p}`)!.filter((r) => r.sessions[9] !== null)
const defSessions = (rs: JourneyResult[], d: string) => rs.map((r) => r.l9Defs[d]?.first ?? Infinity)
for (const p of PATTERNS) {
  out(`#### L9 definitions — ${p}: \`median/p90 sessions at L9 · stuck>20 · ×typical level\``)
  out()
  out(
    table(
      ['Learner', 'kind', ...DEFS_AB, ...DEFS_C],
      LEARNER_SPECS.map((s) => [learnerLabel(s.key), s.kind, ...[...DEFS_AB, ...DEFS_C].map((d) => {
        const rs = defRuns(s.key, p, d)
        if (!rs.length) return '—'
        const xs = defSessions(rs, d)
        const typ = typicalLevelMedian(A.get(`${s.key}|${p}`)!)
        return `${medP90(xs)} · ${fmtPct(xs.filter((x) => x > 20).length / xs.length)} · ×${fmtN(median(xs) / typ, 1)}`
      })]),
    ),
  )
  out()
}
out('#### L9 experience and re-testing (mixed pattern): `experience stuck ≥3 within L9 · prior-mastered facts re-tested at L9 (median) / prior-mastered at L9 entry (median) · academic stuck >12`')
out()
out(
  table(
    ['Learner', 'kind', ...DEFS_AB, ...DEFS_C],
    LEARNER_SPECS.map((s) => [learnerLabel(s.key), s.kind, ...[...DEFS_AB, ...DEFS_C].map((d) => {
      const rs = defRuns(s.key, 'mixed', d)
      if (!rs.length) return '—'
      const xs = defSessions(rs, d)
      const dr = rs.filter((r) => (r.l9Defs[d]?.drought ?? 0) >= 3).length / rs.length
      return `${fmtPct(dr)} · ${fmtN(median(rs.map((r) => r.l9Defs[d]?.retested ?? 0)))}/${fmtN(median(rs.map((r) => r.l9PrevMastered)))} · ${fmtPct(xs.filter((x) => x > 12).length / xs.length)}`
    })]),
  ),
)
out()
{
  // C trap: all prior-mastered facts have appeared (first-appearance accuracy frozen) and C still not passed.
  const rows: string[][] = []
  for (const s of LEARNER_SPECS) {
    const rs = CAPR.get(`${s.key}|mixed`)!.filter((r) => r.sessions[9] !== null)
    if (!rs.length) continue
    const trapped = rs.filter((r) => r.l9Defs['C@0.85']!.first === null && r.l9Defs['C@0.85']!.retested >= r.l9PrevMastered).length
    const trapped80 = rs.filter((r) => r.l9Defs['C@0.80']!.first === null && r.l9Defs['C@0.80']!.retested >= r.l9PrevMastered).length
    const few = rs.filter((r) => r.l9PrevMastered < RULES.simCapstoneMinFirstAppearances).length
    rows.push([learnerLabel(s.key), s.kind, fmtPct(trapped / rs.length), fmtPct(trapped80 / rs.length), fmtPct(few / rs.length)])
  }
  out('C "frozen measure" trap (mixed pattern): once every prior-mastered fact has made its first L9 appearance the retention accuracy can never change, so a learner below the threshold at that point can never complete L9. Also shown: learners with < 20 prior-mastered facts at L9 entry (C unreachable as written).')
  out()
  out(table(['Learner', 'kind', 'trapped C@0.85', 'trapped C@0.80', '< 20 prior-mastered at entry'], rows))
  out()
}

// ================= 7. Detailed tables =================
out('## 7. Detailed tables')
out()
out('### A. Baseline rules — sessions to complete each level')
out()
out(
  table(
    ['Learner', 'kind', 'Pattern', ...LEVELS.map((l) => `L${l.id}`), 'Cum → L9', 'Stuck >12', 'Stuck >20 (level)'],
    cells.map(({ key, kind, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      const s20 = stuck(rs, 20)
      return [label, kind, p, ...LEVELS.map((l) => medP90(levelSessions(rs, l.id))), medP90(cum(rs)), fmtPct(stuck(rs, 12).rate), `${fmtPct(s20.rate)}${s20.level ? ` (${s20.level})` : ''}`]
    }),
  ),
)
out()
out('#### A2. At level-up: share of gating facts mastered vs provisional (avg %, `M·P`)')
out()
const levelUps = (rs: JourneyResult[], L: number) => rs.map((r) => r.levelUp[L]).filter((x) => x !== null) as NonNullable<JourneyResult['levelUp'][number]>[]
out(
  table(
    ['Learner', 'Pattern', ...LEVELS.slice(0, 8).map((l) => `L${l.id}`)],
    cells.map(({ key, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      return [label, p, ...LEVELS.slice(0, 8).map((l) => {
        const u = levelUps(rs, l.id)
        return u.length ? `${Math.round(100 * mean(u.map((x) => x.masteredShare)))}·${Math.round(100 * mean(u.map((x) => x.provisionalShare)))}` : '—'
      })]
    }),
  ),
)
out()
out('#### A3. At level-up: struggling facts remaining (avg, `level table / all 55`)')
out()
out(
  table(
    ['Learner', 'Pattern', ...LEVELS.slice(0, 8).map((l) => `L${l.id}`)],
    cells.map(({ key, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      return [label, p, ...LEVELS.slice(0, 8).map((l) => {
        const u = levelUps(rs, l.id)
        return u.length ? `${fmtN(mean(u.map((x) => x.strugglingTable)), 2)} / ${fmtN(mean(u.map((x) => x.strugglingAll)), 2)}` : '—'
      })]
    }),
  ),
)
out()
out('#### A4. Question difficulty per session: share with true p < 0.7 (`avg/p90` %)')
out()
out(
  table(
    ['Learner', 'Pattern', ...LEVELS.map((l) => `L${l.id}`)],
    cells.map(({ key, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      return [label, p, ...LEVELS.map((l) => {
        const xs = rs.flatMap((r) => r.sessionOutcomes.filter((o) => o.levelId === l.id).map((o) => o.trulyHardShare))
        return xs.length ? `${Math.round(100 * mean(xs))}/${Math.round(100 * pct(xs, 0.9))}` : '—'
      })]
    }),
  ),
)
out()
out('#### A5. Draw mix per session (avg %, `likely · new · weak`) — likely = mastered/provisional/likely-correct at draw time, weak = learning/struggling and not likely')
out()
out(
  table(
    ['Learner', 'Pattern', ...LEVELS.map((l) => `L${l.id}`)],
    cells.map(({ key, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      return [label, p, ...LEVELS.map((l) => {
        const os = rs.flatMap((r) => r.sessionOutcomes.filter((o) => o.levelId === l.id))
        return os.length ? `${Math.round(100 * mean(os.map((o) => o.mixLikely)))}·${Math.round(100 * mean(os.map((o) => o.mixNew)))}·${Math.round(100 * mean(os.map((o) => o.mixWeak)))}` : '—'
      })]
    }),
  ),
)
out()

// ---- B ----
out('### B. Provisional mastery on vs off')
out()
out('Quick sessions cannot produce provisional and schedule no confirms, so all-Quick is identical by construction (the table shows equal numbers).')
out()
out(
  table(
    ['Learner', 'kind', 'Pattern', 'Cum → L9 on', 'Cum → L9 off', 'Stuck >20 on', 'Stuck >20 off', 'Exp. stuck ≥3 on/off', 'L1 on', 'L1 off', '1st-session progress L1 on/off', '1st-session progress avg L1–L8 on/off'],
    cells.map(({ key, kind, p, label }) => {
      const on = A.get(`${key}|${p}`)!
      const off = B.get(`${key}|${p}`)!
      const fsAvg = (rs: JourneyResult[]) => mean(LEVELS.slice(0, 8).map((l) => mean(firstSession(rs, l.id).map((v) => v / l.gatingFactIds.length))).filter((x) => !Number.isNaN(x)))
      return [label, kind, p, medP90(cum(on)), medP90(cum(off)), fmtPct(stuck(on, 20).rate), fmtPct(stuck(off, 20).rate), `${fmtPct(expStuck(on).ge3)} / ${fmtPct(expStuck(off).ge3)}`, medP90(levelSessions(on, 1)), medP90(levelSessions(off, 1)), `${fmtN(mean(firstSession(on, 1)), 2)} / ${fmtN(mean(firstSession(off, 1)), 2)}`, `${fmtPct(fsAvg(on))} / ${fmtPct(fsAvg(off))}`]
    }),
  ),
)
out()
out('"1st-session progress L1" = avg number of the 9 gating facts mastered or provisional after the first session at L1; the last column is that share of gating facts averaged over L1–L8.')
out()

// ---- P1 ----
out('### P1. Does provisional mastery let 75–80% learners advance too easily?')
out()
const p1Rows: string[][] = []
for (const k of ['u0.75', 'u0.80', 'u0.90', 'L-start75', 'L-typical']) {
  for (const p of ['practice', 'mixed'] as Pattern[]) {
    const on = A.get(`${k}|${p}`)!
    const off = B.get(`${k}|${p}`)!
    const provShare = mean(on.flatMap((r) => r.levelUp.filter((x) => x !== null).map((x) => x!.provisionalShare)))
    const rev = on.reduce((s, r) => s + r.provisionalRevoked, 0)
    const conf = on.reduce((s, r) => s + r.provisionalConfirmed, 0)
    const lvlMed = (rs: JourneyResult[]) => LEVELS.slice(0, 8).map((l) => fmtN(median(levelSessions(rs, l.id)))).join(' ')
    p1Rows.push([learnerLabel(k), kindOf(k), p, medP90(cum(on)), medP90(cum(off)), lvlMed(on), lvlMed(off), fmtPct(provShare, 1), `${fmtPct(rev / Math.max(1, rev + conf))} (${rev}/${rev + conf})`])
  }
}
out(table(['Learner', 'kind', 'Pattern', 'Cum → L9 on', 'Cum → L9 off', 'L1–L8 medians on', 'L1–L8 medians off', 'provisional share of gating at level-up', 'provisional-at-level-up revoked'], p1Rows))
out()

// ---- C ----
out('### C. L9 threshold 0.85 / 0.88 / 0.90 under the rev-3 rule (B)')
out()
out('Sessions at L9 among learners who reached it. Stuck = > 20 sessions or never.')
out()
const l9 = (rs: JourneyResult[], t: number) => rs.filter((r) => r.sessions[9] !== null).map((r) => r.l9First[t.toFixed(2)] ?? Infinity)
out(
  table(
    ['Learner', 'kind', 'Pattern', 'reached L9', ...THRESHOLDS.map((t) => `${t.toFixed(2)} med/p90`), ...THRESHOLDS.map((t) => `stuck ${t.toFixed(2)}`)],
    cells.map(({ key, kind, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      const reached = rs.filter((r) => r.sessions[9] !== null).length
      return [label, kind, p, fmtPct(reached / rs.length), ...THRESHOLDS.map((t) => medP90(l9(rs, t))), ...THRESHOLDS.map((t) => { const xs = l9(rs, t); return xs.length ? fmtPct(xs.filter((x) => x > 20).length / xs.length) : '—' })]
    }),
  ),
)
out()
out('### P3. Is Mixed 1–10 (L9) the grind point? (rev-3 rule B)')
out()
out(
  table(
    ['Learner', 'kind', 'Pattern', 'L1–L8 per-level median (median / max of medians)', ...THRESHOLDS.map((t) => `L9 median @${t.toFixed(2)}`), 'L9 ÷ typical level @0.88'],
    cells.map(({ key, kind, p, label }) => {
      const rs = A.get(`${key}|${p}`)!
      const meds = LEVELS.slice(0, 8).map((l) => median(levelSessions(rs, l.id))).filter((x) => !Number.isNaN(x))
      const typ = median(meds)
      return [label, kind, p, meds.length ? `${fmtN(typ)} / ${fmtN(max(meds))}` : '—', ...THRESHOLDS.map((t) => fmtN(median(l9(rs, t)))), meds.length ? fmtN(median(l9(rs, 0.88)) / typ, 1) : '—']
    }),
  ),
)
out()

// ---- D ----
out('### D. Difficulty experience')
out()
out('Spec-D "hard" = true p < 0.7 for that learner and fact, **or** status struggling/learning at draw time. "learning" includes every fact with 1 counted attempt, so early sessions at a level read as mostly hard by this definition; A4 gives the p-only view.')
out()
const D_LEARNERS = ['u0.75', 'u0.90', 'clustered', 'L-slow', 'L-typical', 'L-clustered', 'L-start75']
for (const p of ['quick', 'practice'] as Pattern[]) {
  out(`#### D1 (${p}): hard share per session, \`p90 / max\` %`)
  out()
  out(
    table(
      ['Level', ...D_LEARNERS.map(learnerLabel)],
      LEVELS.map((l) => [`L${l.id}`, ...D_LEARNERS.map((k) => {
        const xs = A.get(`${k}|${p}`)!.flatMap((r) => r.sessionOutcomes.filter((o) => o.levelId === l.id).map((o) => o.hardShare))
        return xs.length ? `${Math.round(100 * pct(xs, 0.9))} / ${Math.round(100 * max(xs))}` : '—'
      })]),
    ),
  )
  out()
}
out('#### D2. Success-floor compliance')
out()
out('Enforceable session = a likely-correct candidate existed in the allowed pools at every question from the 2nd on. Compliance = % of enforceable sessions whose likely-correct share ≥ successFloor (0.40).')
out()
out(
  table(
    ['Learner', 'kind', ...PATTERNS.flatMap((p) => [`${p} enforceable`, `${p} compliant`, `${p} min share`])],
    LEARNER_SPECS.map((s) => [learnerLabel(s.key), s.kind, ...PATTERNS.flatMap((p) => {
      const os = A.get(`${s.key}|${p}`)!.flatMap((r) => r.sessionOutcomes)
      const enf = os.filter((o) => o.floorEnforceable)
      return [fmtPct(enf.length / os.length), fmtPct(enf.filter((o) => o.likelyShare >= RULES.successFloor - 1e-9).length / Math.max(1, enf.length), 1), enf.length ? fmtPct(Math.min(...enf.map((o) => o.likelyShare))) : '—']
    })]),
  ),
)
out()

// ---- P2 ----
out('### P2. Does R4 (85% over the last 20) cause bouncing?')
out()
out('Per level run: "sole blocker" = at ≥ 1 session-end check R1, R2, R3, R5 passed but R4 failed; "bounce" = R4 had passed at an earlier check at that level and later was the sole blocker; flips = R4 pass→fail transitions between consecutive checks.')
out()
const p2Rows: string[][] = []
for (const k of P2_LEARNERS) {
  for (const p of PATTERNS) {
    const base = A.get(`${k}|${p}`)!
    const w30 = P2.get(`w30|${k}|${p}`)!
    const off = P2.get(`off|${k}|${p}`)!
    let runs = 0
    let sole = 0
    let bounce = 0
    let flips = 0
    for (const r of base) for (let L = 1; L <= 8; L++) {
      const st = r.r4[L]!
      if (st.checks === 0) continue
      runs++
      if (st.soleBlocker > 0) sole++
      if (st.bounceBlocked > 0) bounce++
      flips += st.r4Flips
    }
    const fin = (rs: JourneyResult[]) => cum(rs).filter(Number.isFinite)
    p2Rows.push([learnerLabel(k), kindOf(k), p, fmtPct(sole / runs), fmtPct(bounce / runs), fmtN(flips / runs, 2), medP90(cum(base)), medP90(cum(w30)), medP90(cum(off)), `${fmtPct(stuck(base, 20).rate)} / ${fmtPct(stuck(w30, 20).rate)} / ${fmtPct(stuck(off, 20).rate)}`, fmtN(mean(fin(base)) - mean(fin(off)), 1)])
  }
}
out(table(['Learner', 'kind', 'Pattern', 'R4 sole blocker', 'R4 bounce', 'R4 flips / level', 'Cum → L9 (R4 w20)', 'Cum (w30)', 'Cum (no R4)', 'Stuck>20 w20/w30/none', 'mean extra sessions from R4 (finishers)'], p2Rows))
out()

// ---- F ----
out('### F. Placement staircase')
out()
out(`${NP} trials per learner. "knows L1–Lk": p = 0.95 on facts owned by L1..Lk, 0.30 elsewhere; ideal start = k + 1. Error = placed − ideal. Placement is only tested on static learners (one short warm-up; learning during it is negligible).`)
out()
out(
  table(
    ['Learner', 'questions mean', 'questions max', 'hit cap (12)', 'start mean', 'error mean', 'exact', 'over-placed', 'under-placed', 'start distribution'],
    F.map((f) => {
      const errs = f.ideal === null ? [] : f.starts.map((s) => s - f.ideal!)
      const dist = new Map<number, number>()
      for (const s of f.starts) dist.set(s, (dist.get(s) ?? 0) + 1)
      const distS = [...dist.entries()].sort((a, b) => a[0] - b[0]).filter(([, c]) => c / f.starts.length >= 0.02).map(([s, c]) => `L${s} ${Math.round((100 * c) / f.starts.length)}%`).join(', ')
      return [f.label, fmtN(mean(f.qs), 2), String(max(f.qs)), fmtPct(f.capped / f.qs.length, 1), fmtN(mean(f.starts), 2), f.ideal === null ? 'n/a' : fmtN(mean(errs), 2), f.ideal === null ? 'n/a' : fmtPct(errs.filter((e) => e === 0).length / errs.length), f.ideal === null ? 'n/a' : fmtPct(errs.filter((e) => e > 0).length / errs.length), f.ideal === null ? 'n/a' : fmtPct(errs.filter((e) => e < 0).length / errs.length), distS]
    }),
  ),
)
out()
out('Drop-down offer (D4, `dropDownOfferAccuracy` 0.70 over the first 2 sessions): 2 Quick sessions at the placed level from a fresh state (placement attempts and `placementLikely` not carried — see limitations); first 1000 placements per k.')
out()
out(table(['Learner', 'over-placed', 'offered when over-placed', 'exact', 'offered when exact (false alarm)'], DROP.map((d) => [d.k === 0 ? 'knows nothing' : `knows L1–L${d.k}`, String(d.over), fmtPct(d.overOffered / Math.max(1, d.over)), String(d.exact), fmtPct(d.exactOffered / Math.max(1, d.exact))])))
out()

// ---- G ----
out('### G. XP per minute: progress level vs replaying completed levels')
out()
out(`Elapsed = answer latency + 1.5 s per question. At a checkpoint (entering L5 or L9), state is cloned; ${REPS} sessions are played on the progress level and ${REPS} on each completed level (same mode); the best replay level is reported. "steady" = repeat replays (bonus ×0.2); "first finish" = the one-time first finish of a level+mode on a completed level (full bonus). Progress "repeatable" excludes one-time events. Record-beaten XP is ignored (it only adds to progress). "—" = no learner reached the checkpoint within 40 sessions/level.`)
out()
out(
  table(
    ['Learner', 'kind', 'Mode', 'Progress level', 'progress XP/min (all)', 'progress XP/min (repeatable)', 'best replay XP/min (steady)', 'best replay XP/min (first finish)', 'learners where steady replay > progress repeatable', 'flag'],
    G.map((g) => {
      const pt = mean(g.progTotal)
      const pr = mean(g.progRepeat)
      const rs = mean(g.replaySteady)
      const rf = mean(g.replayFirst)
      const flags: string[] = []
      if (rs > pr) flags.push('steady replay > progress (repeatable)')
      if (rf > pt) flags.push('first-finish replay > progress')
      const worst = g.replaySteady.filter((x, i) => x > g.progRepeat[i]!).length / Math.max(1, g.replaySteady.length)
      return [g.learner, g.kind, g.mode, `L${g.checkpoint}`, fmtN(pt, 1), fmtN(pr, 1), fmtN(rs, 1), fmtN(rf, 1), fmtPct(worst), g.progTotal.length === 0 ? 'n/a' : flags.length ? `**${flags.join('; ')}**` : 'ok']
    }),
  ),
)
out()

// ---- H ----
out('### H. Sensitivity (all-Quick)')
out()
const hRows: string[][] = []
for (const c of H_CONFIGS) {
  for (const k of H_LEARNERS) {
    const rs = H.get(`${c.label}|${k}`)!
    const os = rs.flatMap((r) => r.sessionOutcomes)
    const enf = os.filter((o) => o.floorEnforceable)
    const ex = expStuck(rs)
    hRows.push([c.label, learnerLabel(k), kindOf(k), medP90(cum(rs)), medP90(levelSessions(rs, 1)), medP90(levelSessions(rs, 9)), fmtPct(stuck(rs, 12).rate), fmtPct(stuck(rs, 20).rate), fmtPct(ex.ge3), fmtPct(mean(os.map((o) => o.hardShare))), fmtPct(mean(os.map((o) => o.likelyShare))), fmtPct(enf.filter((o) => o.likelyShare >= 0.4 - 1e-9).length / Math.max(1, enf.length))])
  }
}
out(table(['Variant', 'Learner', 'kind', 'Cum → L9', 'L1', 'L9', 'Stuck >12', 'Stuck >20', 'Exp. stuck ≥3', 'avg hard share (spec D)', 'avg likely share', 'sessions with likely ≥ 40%'], hRows))
out()

// ---- V ----
out('### V. Candidate fixes for structural problems (sim-only flags, not DECISIONS rules)')
out()
out('V1 `simSpanOverC`: rule (b) keeps "cW ≥ 3 of the last 4" but checks the ≥ 2-distinct-sessions condition over all correct counted attempts instead of only those in W. V2 `simConfirmNonMasteredOnly`: confirms only for facts not yet mastered. V3: `mixedMinSessions` 2. V4 `simMixedWindowExtends`: the L9 window is the shortest suffix with ≥ 50 answers **and** ≥ 3 sessions. Cells: `cum → L9 median/p90 (academic stuck >20 · experience stuck ≥3)`.')
out()
const vRows: string[][] = []
const vCell = (rs: JourneyResult[]) => `${medP90(cum(rs))} (${fmtPct(stuck(rs, 20).rate)} · ${fmtPct(expStuck(rs).ge3)})`
for (const k of V_LEARNERS) for (const p of PATTERNS) vRows.push([learnerLabel(k), kindOf(k), p, vCell(A.get(`${k}|${p}`)!), ...V_CONFIGS.map((c) => vCell(V.get(`${c.label}|${k}|${p}`)!))])
out(table(['Learner', 'kind', 'Pattern', 'rev-3 baseline', ...V_CONFIGS.map((c) => c.label)], vRows))
out()
out(`#### V-Rush. All-Rush players (100 questions/session; ${NR} learners/cell, cap 20 sessions/level). Cell: \`cum → L9 · L1 sessions · % reaching L9\``)
out()
out(table(['Learner', 'kind', ...R_CONFIGS.map((c) => c.label)], R_LEARNERS.map((k) => [learnerLabel(k), kindOf(k), ...R_CONFIGS.map((c) => { const rs = RR.get(`${c.label}|${k}`)!; const reached = rs.filter((r) => r.sessions[9] !== null).length; return `${medP90(cum(rs))} · L1 ${medP90(levelSessions(rs, 1))} · ${fmtPct(reached / rs.length)}` })])))
out()

out('## 8. Spec gaps')
out()
out(GAPS)
out()
out('## 9. Model limitations')
out()
out(LIMITS)
out()
if (hardFailures.length || softFailures.length) {
  out('## Assertion results')
  out()
  for (const f of hardFailures) out(`- **HARD FAIL** ${f}`)
  for (const f of softFailures) out(`- FAIL (reported finding, not the recommended rule) ${f}`)
  out()
}

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '../../docs/v2/SIM-REPORT.md')
writeFileSync(target, lines.join('\n'))
log(`wrote ${target}`)
if (softFailures.length) {
  console.error('\nE(b) FAILURES in non-recommended slowness modes (findings, reported):')
  for (const f of softFailures) console.error(' - ' + f)
}
if (hardFailures.length) {
  console.error('\nHARD INVARIANT FAILURES:')
  for (const f of hardFailures) console.error(' - ' + f)
  process.exitCode = 1
}
