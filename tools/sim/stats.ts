// Small statistics + formatting helpers.

export function sorted(xs: number[]): number[] {
  return xs.slice().sort((a, b) => a - b)
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = sorted(xs)
  const m = s.length >> 1
  if (s.length % 2) return s[m]!
  const a = s[m - 1]!
  const b = s[m]!
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b ? a : Infinity
  return (a + b) / 2
}

/** Nearest-rank percentile. */
export function pct(xs: number[], q: number): number {
  if (xs.length === 0) return NaN
  const s = sorted(xs)
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN
  let t = 0
  for (const x of xs) t += x
  return t / xs.length
}

export function max(xs: number[]): number {
  return xs.length ? Math.max(...xs) : NaN
}

/** Two-sample Kolmogorov–Smirnov: statistic D and asymptotic p-value. Infinity values are treated as ties at +∞. */
export function ksTest(a: number[], b: number[]): { d: number; p: number } {
  const A = sorted(a)
  const B = sorted(b)
  const vals = sorted([...new Set([...A, ...B])])
  let i = 0
  let j = 0
  let d = 0
  for (const v of vals) {
    while (i < A.length && A[i]! <= v) i++
    while (j < B.length && B[j]! <= v) j++
    d = Math.max(d, Math.abs(i / A.length - j / B.length))
  }
  const en = Math.sqrt((A.length * B.length) / (A.length + B.length))
  const lambda = (en + 0.12 + 0.11 / en) * d
  let p = 0
  for (let k = 1; k <= 100; k++) p += 2 * (k % 2 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda)
  return { d, p: Math.min(1, Math.max(0, lambda < 1e-9 ? 1 : p)) }
}

export function fmtN(x: number, digits = 1): string {
  if (Number.isNaN(x)) return '—'
  if (!Number.isFinite(x)) return '∞'
  return Number.isInteger(x) ? String(x) : x.toFixed(digits)
}

export function fmtPct(x: number, digits = 0): string {
  if (Number.isNaN(x)) return '—'
  return `${(x * 100).toFixed(digits)}%`
}

export function table(header: string[], rows: string[][]): string {
  const out = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`]
  for (const r of rows) out.push(`| ${r.join(' | ')} |`)
  return out.join('\n')
}
