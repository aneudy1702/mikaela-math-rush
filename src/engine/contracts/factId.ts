/**
 * D9 — canonical fact identity (FROZEN in T0).
 *
 * factId = `${min(a,b)}x${max(a,b)}`, integer factors 1–12, base 10, no leading zeros,
 * lowercase `x`. Orientation (which factor was shown first) lives only in question
 * metadata / attempt analytics and never splits mastery. Every store and lookup uses
 * the canonical ID.
 */

export const MIN_FACTOR = 1
export const MAX_FACTOR = 12
/** Core V2 space (D0): factors 1–10. */
export const CORE_MAX_FACTOR = 10

const FACTOR = '(1[0-2]|[1-9])'
const CANONICAL_RE = new RegExp(`^${FACTOR}x${FACTOR}$`)

function isFactor(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_FACTOR && n <= MAX_FACTOR
}

/** Canonical ID for a × b (either orientation). Throws on factors outside 1–12. */
export function canonicalFactId(a: number, b: number): string {
  if (!isFactor(a) || !isFactor(b)) {
    throw new Error(`Invalid factors for factId: ${a}, ${b}`)
  }
  return `${Math.min(a, b)}x${Math.max(a, b)}`
}

/** Strict: true only for the canonical spelling ("7x8" yes; "8x7", "07x8", "7X8" no). */
export function isCanonicalFactId(factId: string): boolean {
  const m = CANONICAL_RE.exec(factId)
  if (!m) return false
  return Number(m[1]) <= Number(m[2])
}

/** Strict parse of a canonical fact ID. Throws on any non-canonical string. */
export function parseFactId(factId: string): { a: number; b: number } {
  const m = CANONICAL_RE.exec(factId)
  if (!m || Number(m[1]) > Number(m[2])) {
    throw new Error(`Invalid factId: ${factId}`)
  }
  return { a: Number(m[1]), b: Number(m[2]) }
}

/** True when a canonical ID is in the core 1–10 space. */
export function isCoreFactId(factId: string): boolean {
  if (!isCanonicalFactId(factId)) return false
  return parseFactId(factId).b <= CORE_MAX_FACTOR
}
