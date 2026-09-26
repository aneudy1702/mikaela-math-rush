// T7 product-code simulation: simulated learners played through the REAL LevelSessionEngine (not the
// tools/sim reimplementation).
//
//   node --import ./tools/product-sim/resolve-hooks.ts tools/product-sim/run.ts
//
// Env: PSIM_NPAIR (paired seeds per pattern for D12, default 4000), PSIM_N (learners per headline cell,
// default 400). Prints a markdown report to stdout. Exit code 1 if the D12 statistical check fails.
//
// 1. D12 statistical (DECISIONS D12, owner directive 14): fast (2–4 s) vs slow-accurate (7–10 s) static
//    p = 0.90, paired common seeds (pair i shares every RNG stream; only latency values differ). Per level
//    |Δmean sessions| ≤ 0.25 and |Δp90| ≤ 1; |Δstuck>20| ≤ 2 pp; KS on cumulative sessions to L9 p ≥ 0.05.
// 2. Headline sessions-to-level for static p = 0.90 and learning-typical vs docs/v2/SIM-REPORT.md rev-4 §4
//    and vs a fresh run of the reference sim (tools/sim) at the same N.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEARNER_SPECS } from '../sim/learners.ts'
import { hashSeed, runJourney, type Pattern } from '../sim/journey.ts'
import { RULES as SIM_RULES } from '../sim/rules.ts'
import { fmtN, fmtPct, ksTest, mean, median, pct, table } from '../sim/stats.ts'
import { runProductJourney, type ProductJourneyResult } from './journey.ts'

const NPAIR = Number(process.env.PSIM_NPAIR ?? 4000)
const N = Number(process.env.PSIM_N ?? 400)
const CAP = 60
const PATTERNS: Pattern[] = ['quick', 'practice', 'mixed']
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const t0 = Date.now()
const log = (m: string) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const lines: string[] = []
const out = (s = '') => lines.push(s)
const failures: string[] = []

type Result = Pick<ProductJourneyResult, 'sessions' | 'cumulative'>

function spec(key: string) {
  const s = LEARNER_SPECS.find((x) => x.key === key)
  if (!s) throw new Error(`unknown learner ${key}`)
  return s
}

function productCell(key: string, pattern: Pattern, n: number): Result[] {
  const s = spec(key)
  const res: Result[] = []
  for (let i = 0; i < n; i++) {
    res.push(runProductJourney({ learner: s.make(), pattern, seed: hashSeed(pattern, i), maxSessionsPerLevel: CAP }))
  }
  return res
}

function referenceCell(key: string, pattern: Pattern, n: number): Result[] {
  const s = spec(key)
  const res: Result[] = []
  for (let i = 0; i < n; i++) {
    res.push(runJourney({ rules: SIM_RULES, learner: s.make(), pattern, seed: hashSeed(pattern, i), maxSessionsPerLevel: CAP }))
  }
  return res
}

const levelSessions = (rs: Result[], L: number) =>
  rs.map((r) => r.sessions[L]).filter((x): x is number => x !== null && x !== undefined)
const medP90 = (xs: number[]) => (xs.length ? `${fmtN(median(xs))}/${fmtN(pct(xs, 0.9))}` : '—')
const cum = (rs: Result[]) => rs.map((r) => r.cumulative)
function stuckRate(rs: Result[], over: number): number {
  let n = 0
  for (const r of rs) {
    if (LEVELS.some((L) => (r.sessions[L] ?? 0) > over)) n++
  }
  return n / rs.length
}

// ================= D12 statistical =================
out('# T7 product-code simulation')
out()
out(
  `Real \`LevelSessionEngine\` (src/engine/session/levelSession.ts) driven by the tools/sim learner models. ` +
    `Beginner at L1, no placement, 1 session/day, current level every session, cap ${CAP} sessions/level ` +
    `(∞ = censored), mixed = 70% Quick / 30% Practice. Node ${process.version}.`,
)
out()
out(`## 1. D12 statistical — fast (2–4 s) vs slow-accurate (7–10 s), static p = 0.90`)
out()
out(
  `${NPAIR} paired common seeds per pattern (pair i shares every RNG stream: selection main + fluency, answers, ` +
    `question orientation, mode; only the latency values differ). Δmean = mean(slow − fast) ± paired SE over pairs ` +
    `where both reached the level (censored at the cap). Criteria: |Δmean| ≤ 0.25, |Δp90| ≤ 1, |Δstuck>20| ≤ 2 pp, ` +
    `KS on cumulative sessions to L9 p ≥ 0.05. Cells: \`Δmean ± SE (fast p90 / slow p90)\`.`,
)
out()
const d12Rows: string[][] = []
let maxAbsD = 0
let maxSe = 0
for (const p of PATTERNS) {
  log(`D12 ${p}: ${NPAIR} pairs`)
  const fast = productCell('u0.90', p, NPAIR)
  const slow = productCell('slow0.90', p, NPAIR)
  const viol: string[] = []
  const cells: string[] = []
  let identicalPairs = 0
  for (let i = 0; i < NPAIR; i++) if (fast[i]!.sessions.join() === slow[i]!.sessions.join()) identicalPairs++
  for (const L of LEVELS) {
    const diffs: number[] = []
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < NPAIR; i++) {
      const x = fast[i]!.sessions[L]
      const y = slow[i]!.sessions[L]
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
    maxAbsD = Math.max(maxAbsD, Math.abs(dMean))
    maxSe = Math.max(maxSe, se)
    if (!(Math.abs(dMean) <= 0.25)) viol.push(`L${L} |Δmean| ${Math.abs(dMean).toFixed(3)}`)
    if (!(Math.abs(fp - sp) <= 1)) viol.push(`L${L} |Δp90| ${Math.abs(fp - sp)}`)
    cells.push(`${dMean >= 0 ? '+' : ''}${dMean.toFixed(3)} ± ${se.toFixed(3)} (${fmtN(fp)}/${fmtN(sp)})`)
  }
  const sf = stuckRate(fast, 20)
  const ss = stuckRate(slow, 20)
  if (Math.abs(sf - ss) > 0.02) viol.push(`|Δstuck>20| ${fmtPct(Math.abs(sf - ss), 1)}`)
  const ks = ksTest(cum(fast), cum(slow))
  if (ks.p < 0.05) viol.push(`KS p=${ks.p.toFixed(3)}`)
  if (viol.length) failures.push(`D12 ${p}: ${viol.join('; ')}`)
  const mf = mean(cum(fast).filter(Number.isFinite))
  const ms = mean(cum(slow).filter(Number.isFinite))
  d12Rows.push([
    p,
    ...cells,
    `${fmtPct(sf, 1)} / ${fmtPct(ss, 1)}`,
    `D=${ks.d.toFixed(3)} p=${ks.p.toFixed(3)}`,
    `${mf.toFixed(2)} / ${ms.toFixed(2)}`,
    fmtPct(identicalPairs / NPAIR, 0),
    viol.length ? `**FAIL** (${viol.join('; ')})` : '**PASS**',
  ])
}
out(
  table(
    ['Pattern', ...LEVELS.map((L) => `L${L}`), 'stuck>20 fast / slow', 'KS cum→L9', 'mean cum fast / slow', 'identical pairs', 'verdict'],
    d12Rows,
  ),
)
out()
out(
  `Largest |Δmean| ${maxAbsD.toFixed(3)} (bound 0.25), largest paired SE ${maxSe.toFixed(3)}: the bound is ` +
    `${((0.25 - maxAbsD) / maxSe).toFixed(1)} SE from the worst cell. "Identical pairs" = share of pairs whose ` +
    `per-level session counts are identical (the only latency channel is stage-2 fluency among mastered facts).`,
)
out()
out(`**D12 statistical: ${failures.length ? 'FAIL' : 'PASS'}.**`)
out()

// ================= Headline vs SIM-REPORT =================
log('headline')
const here = dirname(fileURLToPath(import.meta.url))
const reportText = (() => {
  try {
    return readFileSync(resolve(here, '../../docs/v2/SIM-REPORT.md'), 'utf8')
  } catch {
    return ''
  }
})()

/** Parse a SIM-REPORT §4.x row: cells L1..L9, cum, stuck>12, stuck>20. */
function reportRow(pattern: Pattern, label: string): string[] | null {
  const start = reportText.indexOf(`### 4.${PATTERNS.indexOf(pattern) + 1} ${pattern}`)
  if (start < 0) return null
  const section = reportText.slice(start, reportText.indexOf('\n### ', start + 5))
  const row = section.split('\n').find((l) => l.startsWith(`| ${label} |`))
  if (!row) return null
  return row.split('|').slice(3, -1).map((c) => c.trim())
}

const HEAD: { key: string; label: string }[] = [
  { key: 'u0.90', label: 'uniform 0.90' },
  { key: 'L-typical', label: 'learning typical' },
]
out(`## 2. Headline sessions-to-level vs SIM-REPORT rev-4 (§4)`)
out()
out(
  `${N} learners per cell, same seeds for product and reference (not paired draw-for-draw: the two implementations ` +
    `consume RNG differently). Cells: \`median/p90\` sessions to complete each level. Rows: **product** = this run; ` +
    `**ref-sim** = tools/sim reference run now at the same N; **report** = docs/v2/SIM-REPORT.md §4 (400 learners). ` +
    `KS compares product vs ref-sim cumulative sessions to L9.`,
)
out()
const headRows: string[][] = []
const divergences: string[] = []
for (const p of PATTERNS) {
  for (const h of HEAD) {
    log(`headline ${h.key} ${p}`)
    const prod = productCell(h.key, p, N)
    const ref = referenceCell(h.key, p, N)
    const ks = ksTest(cum(prod), cum(ref))
    const row = (name: string, rs: Result[], extra: string) => [
      `${h.label} · ${p}`,
      name,
      ...LEVELS.map((L) => medP90(levelSessions(rs, L))),
      medP90(cum(rs)),
      fmtPct(stuckRate(rs, 20)),
      extra,
    ]
    headRows.push(row('product', prod, `KS vs ref D=${ks.d.toFixed(3)} p=${ks.p.toFixed(3)}`))
    headRows.push(row('ref-sim', ref, ''))
    const rep = reportRow(p, h.label)
    if (rep) headRows.push([`${h.label} · ${p}`, 'report', ...rep.slice(0, 10), rep[11] ?? '—', ''])
    const mp = median(cum(prod))
    const mr = median(cum(ref))
    const rel = Math.abs(mp - mr) / mr
    if (rel > 0.1 || ks.p < 0.01) {
      divergences.push(`${h.label} · ${p}: product median cum ${fmtN(mp)} vs ref-sim ${fmtN(mr)} (KS p=${ks.p.toFixed(3)})`)
    }
  }
}
out(table(['Learner · pattern', 'source', ...LEVELS.map((L) => `L${L}`), 'Cum → L9', 'Stuck >20', 'note'], headRows))
out()
out(
  divergences.length
    ? `Material divergences (median cum → L9 off by > 10% or KS p < 0.01):\n${divergences.map((d) => `- ${d}`).join('\n')}`
    : 'No material divergence (every cell: median cumulative sessions to L9 within 10% of the reference sim and KS p ≥ 0.01).',
)
out()
out(`Runtime ${((Date.now() - t0) / 1000).toFixed(0)} s.`)

console.log(lines.join('\n'))
if (failures.length) {
  console.error('\nD12 FAILURES:')
  for (const f of failures) console.error(`- ${f}`)
  process.exit(1)
}
