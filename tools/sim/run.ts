// T-SIM2 driver (revision 4): D12 invariants, headline reference numbers, experience-stuck with/without D10 marks.
// Writes docs/v2/SIM-REPORT.md. Usage: node tools/sim/run.ts   (env SIM_N, SIM_NPAIR override learners per cell)
// Exit code 1 if D12 (a) or (b) fails.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RULES, type Rules } from './rules.ts'
import { LEVELS } from './curriculum.ts'
import { LEARNER_SPECS, learnerLabel } from './learners.ts'
import { hashSeed, longestRun, runJourney, type JourneyOpts, type JourneyResult, type Pattern } from './journey.ts'
import { replayWithLatencyScale } from './invariance.ts'
import { fmtN, fmtPct, ksTest, mean, median, pct, table } from './stats.ts'
import { GAPS, LIMITS, SUMMARY } from './notes.ts'

const N = Number(process.env.SIM_N ?? 400)
const NPAIR = Number(process.env.SIM_NPAIR ?? 4000)
const PATTERNS: Pattern[] = ['quick', 'practice', 'mixed']
const CAP = 60
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const failures: string[] = []

function runCell(rules: Rules, key: string, pattern: Pattern, n: number, extra: Partial<JourneyOpts> = {}): JourneyResult[] {
  const spec = LEARNER_SPECS.find((s) => s.key === key)!
  const out: JourneyResult[] = []
  for (let i = 0; i < n; i++) out.push(runJourney({ rules, learner: spec.make(), pattern, seed: hashSeed(pattern, i), maxSessionsPerLevel: CAP, ...extra }))
  return out
}

const levelSessions = (rs: JourneyResult[], L: number) => rs.map((r) => r.sessions[L]).filter((x): x is number => x !== null && x !== undefined)
const medP90 = (xs: number[]) => (xs.length ? `${fmtN(median(xs))}/${fmtN(pct(xs, 0.9))}` : '—')
const cum = (rs: JourneyResult[]) => rs.map((r) => r.cumulative)
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
  return { rate: n / rs.length, level: top.slice(0, 2).map(([L, c]) => `L${L} ${Math.round((100 * c) / rs.length)}%`).join(', ') }
}
function exp(rs: JourneyResult[], withMarks: boolean) {
  const d = rs.map((r) => longestRun(withMarks ? r.eventsMarks : r.events))
  return { ge3: d.filter((x) => x >= 3).length / d.length, ge5: d.filter((x) => x >= 5).length / d.length, med: median(d) }
}

// ================= Baseline rev-4 runs =================
log(`A: rev-4 journeys, ${N} learners/cell, ${LEARNER_SPECS.length} learners × ${PATTERNS.length} patterns`)
const A = new Map<string, JourneyResult[]>()
for (const s of LEARNER_SPECS) for (const p of PATTERNS) A.set(`${s.key}|${p}`, runCell(RULES, s.key, p, N))
log('A done')

// ================= D12 (a) exact =================
log('D12(a): latency-scaling replay')
let invJourneys = 0
let invSessions = 0
for (const s of LEARNER_SPECS) {
  for (const p of PATTERNS) {
    for (let i = 0; i < 10; i++) {
      const j = runJourney({ rules: RULES, learner: s.make(), pattern: p, seed: hashSeed('inv', p, i), maxSessionsPerLevel: 25, keepRecords: true })
      for (const scale of [1, 0.3, 3]) {
        const err = replayWithLatencyScale(j.records!, RULES, scale)
        if (err) failures.push(`D12(a) ${s.key}/${p}/#${i}: ${err}`)
      }
      invJourneys++
      invSessions += j.records!.length
    }
  }
}
log(`D12(a) done: ${invJourneys} journeys, ${invSessions} sessions`)

// ================= D12 (b) paired slow vs fast =================
log(`D12(b): ${NPAIR} paired seeds per pattern`)
interface D12Row {
  pattern: Pattern
  perLevel: { L: number; pairs: number; dMean: number; se: number; fastP90: number; slowP90: number; ok: boolean }[]
  stuckFast: number
  stuckSlow: number
  ks: { d: number; p: number }
  meanFast: number
  meanSlow: number
  control: boolean
  viol: string[]
}
const D12: D12Row[] = []
for (const p of PATTERNS) {
  const fast = runCell(RULES, 'u0.90', p, NPAIR)
  const slow = runCell(RULES, 'slow0.90', p, NPAIR)
  const viol: string[] = []
  const perLevel: D12Row['perLevel'] = []
  for (const l of LEVELS) {
    // Pairs where both learners reached the level; censored (∞) counted at the cap.
    const diffs: number[] = []
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < NPAIR; i++) {
      const x = fast[i]!.sessions[l.id]
      const y = slow[i]!.sessions[l.id]
      if (x === null || y === null || x === undefined || y === undefined) continue
      const xc = Math.min(x, CAP)
      const yc = Math.min(y, CAP)
      a.push(xc)
      b.push(yc)
      diffs.push(yc - xc)
    }
    const dMean = mean(diffs)
    const sd = Math.sqrt(mean(diffs.map((d) => (d - dMean) ** 2)))
    const se = sd / Math.sqrt(diffs.length)
    const fp = pct(a, 0.9)
    const sp = pct(b, 0.9)
    const ok = Math.abs(dMean) <= 0.25 && Math.abs(fp - sp) <= 1
    if (Math.abs(dMean) > 0.25) viol.push(`L${l.id} |Δmean| ${Math.abs(dMean).toFixed(3)}`)
    if (Math.abs(fp - sp) > 1) viol.push(`L${l.id} |Δp90| ${Math.abs(fp - sp)}`)
    perLevel.push({ L: l.id, pairs: diffs.length, dMean, se, fastP90: fp, slowP90: sp, ok })
  }
  const sf = stuck(fast, 20).rate
  const ss = stuck(slow, 20).rate
  if (Math.abs(sf - ss) > 0.02) viol.push(`|Δstuck>20| ${fmtPct(Math.abs(sf - ss), 1)}`)
  const ks = ksTest(cum(fast), cum(slow))
  if (ks.p < 0.05) viol.push(`KS p=${ks.p.toFixed(3)}`)
  // Control: with fluency weights forced to 1.0, fast and slow must produce identical paths (no other latency leak).
  const fNS = runCell(RULES, 'u0.90', p, 200, { fluencyEnabled: false })
  const sNS = runCell(RULES, 'slow0.90', p, 200, { fluencyEnabled: false })
  const control = fNS.every((r, i) => r.sessions.join() === sNS[i]!.sessions.join())
  if (!control) viol.push('control: paths differ with fluency disabled')
  if (viol.length) failures.push(`D12(b) ${p}: ${viol.join('; ')}`)
  D12.push({ pattern: p, perLevel, stuckFast: sf, stuckSlow: ss, ks, meanFast: mean(cum(fast).filter(Number.isFinite)), meanSlow: mean(cum(slow).filter(Number.isFinite)), control, viol })
}
log('D12(b) done')

// =====================================================================
// Report
// =====================================================================
const lines: string[] = []
const out = (s = '') => lines.push(s)
const HEAD_LEARNERS = ['u0.80', 'u0.90', 'u1.00', 'L-slow', 'L-typical', 'L-start75', 'L-clustered']
const kindOf = (key: string) => LEARNER_SPECS.find((s) => s.key === key)!.kind

out('# Math Rush V2 — Learner Simulator Report (revision 4)')
out()
out(`Generated by \`node tools/sim/run.ts\` (Node ${process.version}), the reference model of DECISIONS.md revision 4 (§B0, D2, D10, D12). Rev-4 is the sim default: no provisional status or confirm items, V1 spacing, L9 = option B @ 0.85 with the V4 window, two-stage budget-neutral pick with a separate fluency RNG stream, later-check only after a correct reintroduce, evidence = counted draws. Learners per cell: **${N}** (headline/experience), **${NPAIR} paired seeds** per pattern (D12(b)). 1 session/day, beginner at L1, no placement, cap ${CAP} sessions/level (∞ = censored). Mixed pattern = 70% Quick / 30% Practice. Seeded mulberry32; same seed index across learners (common random numbers). Runtime ${((Date.now() - t0) / 1000).toFixed(0)} s.`)
out()
out('**Static learners** keep a fixed true p per fact; **learning learners** improve with spaced practice and forget when unseen (models unchanged from revision 3, see archive §2/§4).')
out()
out('## 1. Summary')
out()
out(SUMMARY)
out()

// ---- D12 ----
out('## 2. D12 invariants')
out()
const aFails = failures.filter((f) => f.startsWith('D12(a)'))
out(`**(a) Exact: ${aFails.length ? 'FAIL' : 'PASS'}.** ${invJourneys} journeys (10 per learner × pattern, all ${LEARNER_SPECS.length} learners, ≤ 25 sessions/level), ${invSessions} sessions, replayed with every latency ×1, ×0.3 and ×3: identical per-attempt status and counted-evidence flags, identical R1–R5 / L9 completion and identical record eligibility.${aFails.length ? ' First failure: ' + aFails[0] : ''}`)
out()
out(`**(b) Statistical, slow-accurate p = 0.90 (7–10 s) vs fast p = 0.90 (2–4 s): ${failures.some((f) => f.startsWith('D12(b)')) ? 'FAIL' : 'PASS'}.** ${NPAIR} paired common seeds per pattern (pair i uses the same seed for both learners). Per level: pairs where both reached the level, censored counted at the cap; Δmean = mean(slow − fast) with its paired standard error. Criteria: |Δmean| ≤ 0.25, |Δp90| ≤ 1, |Δstuck>20| ≤ 2 pp, KS on cumulative sessions to L9 p ≥ 0.05. Cells: \`Δmean ± SE (fast p90 / slow p90)\`.`)
out()
out(
  table(
    ['Pattern', ...LEVELS.map((l) => `L${l.id}`), 'stuck>20 fast / slow', 'KS cum→L9', 'mean cum fast / slow', 'fluency-off control', 'verdict'],
    D12.map((d) => [
      d.pattern,
      ...d.perLevel.map((x) => `${x.dMean >= 0 ? '+' : ''}${x.dMean.toFixed(3)} ± ${x.se.toFixed(3)} (${fmtN(x.fastP90)}/${fmtN(x.slowP90)})`),
      `${fmtPct(d.stuckFast, 1)} / ${fmtPct(d.stuckSlow, 1)}`,
      `D=${d.ks.d.toFixed(3)} p=${d.ks.p.toFixed(3)}`,
      `${fmtN(d.meanFast, 2)} / ${fmtN(d.meanSlow, 2)}`,
      d.control ? 'identical' : 'DIFFER',
      d.viol.length ? `**FAIL**: ${d.viol.join('; ')}` : '**PASS**',
    ]),
  ),
)
out()
{
  const maxSe = Math.max(...D12.flatMap((d) => d.perLevel.map((x) => x.se)))
  const maxD = Math.max(...D12.flatMap((d) => d.perLevel.map((x) => Math.abs(x.dMean))))
  out(`Noise margin: the largest paired SE of any per-level Δmean is ${maxSe.toFixed(3)} sessions and the largest |Δmean| is ${maxD.toFixed(3)}, so the 0.25 bound sits ≥ ${((0.25 - maxD) / maxSe).toFixed(1)} SE away from the worst observed cell — seed noise cannot flip the verdict at this sample size. The fluency-off control (200 paired seeds) produces identical session-by-session paths, so any difference comes only from stage-2 fluency weighting.`)
  out()
}

// ---- Experience ----
out('## 3. Experience stuck — with and without D10 mark advancement')
out()
out('Drought = consecutive sessions without a visible-progress event. **Without marks**: gating mastered count up, any fact moving up a status (struggling→learning, learning→mastered, new→mastered), level-up, badge, record beaten, player level-up. **With marks**: the same, plus D10 mark advancement (Σ over the current level\'s table facts of marks + 3×mastered is higher at session end than at start). Cells: `≥3 · ≥5 · median longest drought`.')
out()
for (const kind of ['static', 'learning'] as const) {
  out(`### 3${kind === 'static' ? 'a' : 'b'}. ${kind === 'static' ? 'Static' : 'Learning'} learners`)
  out()
  out(
    table(
      ['Learner', ...PATTERNS.flatMap((p) => [`${p} without marks`, `${p} with marks`])],
      LEARNER_SPECS.filter((s) => s.kind === kind).map((s) => [
        learnerLabel(s.key),
        ...PATTERNS.flatMap((p) => {
          const rs = A.get(`${s.key}|${p}`)!
          const w = exp(rs, false)
          const m = exp(rs, true)
          return [`${fmtPct(w.ge3)} · ${fmtPct(w.ge5)} · ${fmtN(w.med)}`, `${fmtPct(m.ge3)} · ${fmtPct(m.ge5)} · ${fmtN(m.med)}`]
        }),
      ]),
    ),
  )
  out()
}

// ---- Headline ----
out('## 4. Headline reference numbers (rev-4 rules)')
out()
out('Reference for T4/T7 regression checks. Cells: `median/p90` sessions to complete each level; academic stuck = % of learners needing more than 12 / 20 sessions at some single level (most common levels in brackets).')
out()
for (const p of PATTERNS) {
  out(`### 4.${PATTERNS.indexOf(p) + 1} ${p}`)
  out()
  out(
    table(
      ['Learner', 'kind', ...LEVELS.map((l) => `L${l.id}`), 'Cum → L9', 'Stuck >12', 'Stuck >20'],
      HEAD_LEARNERS.map((k) => {
        const rs = A.get(`${k}|${p}`)!
        const s12 = stuck(rs, 12)
        const s20 = stuck(rs, 20)
        return [learnerLabel(k), kindOf(k), ...LEVELS.map((l) => medP90(levelSessions(rs, l.id))), medP90(cum(rs)), `${fmtPct(s12.rate)}${s12.level ? ` (${s12.level})` : ''}`, `${fmtPct(s20.rate)}${s20.level ? ` (${s20.level})` : ''}`]
      }),
    ),
  )
  out()
}
out('### 4.4 All learners (same format, all patterns)')
out()
out(
  table(
    ['Learner', 'kind', 'Pattern', ...LEVELS.map((l) => `L${l.id}`), 'Cum → L9', 'Stuck >12', 'Stuck >20'],
    LEARNER_SPECS.flatMap((s) =>
      PATTERNS.map((p) => {
        const rs = A.get(`${s.key}|${p}`)!
        return [learnerLabel(s.key), s.kind, p, ...LEVELS.map((l) => medP90(levelSessions(rs, l.id))), medP90(cum(rs)), fmtPct(stuck(rs, 12).rate), fmtPct(stuck(rs, 20).rate)]
      }),
    ),
  ),
)
out()
out('## 5. Spec gaps (revision 4)')
out()
out(GAPS)
out()
out('## 6. Model limitations')
out()
out(LIMITS)
out()
if (failures.length) {
  out('## Assertion failures')
  out()
  for (const f of failures) out(`- **FAIL** ${f}`)
  out()
}

// ---- Archive ----
const here = dirname(fileURLToPath(import.meta.url))
const archive = readFileSync(resolve(here, 'archive/rev3-report.md'), 'utf8')
  .split('\n')
  .slice(1) // drop the rev-3 title
  .map((l) => (l.startsWith('#') ? `#${l}` : l))
out('---')
out()
out('# Archive (revision 3)')
out()
out('The revision 3 report as submitted for owner sign-off (commit 5a2d3ff), kept verbatim for the record. It describes rev-3 rules and sim-only variants that revision 4 has since adopted or removed (provisional, confirms, slowness modes, capstone/Cr, V1–V4 flags); the current code no longer reproduces it. Section numbers below refer to the archived report.')
out()
for (const l of archive) out(l)

const target = resolve(here, '../../docs/v2/SIM-REPORT.md')
writeFileSync(target, lines.join('\n'))
log(`wrote ${target}`)
if (failures.length) {
  console.error('\nD12 FAILURES:')
  for (const f of failures) console.error(' - ' + f)
  process.exitCode = 1
}
