/**
 * Multiplication fact space: products within 100 by default,
 * stretch to 12× when mastery supports higher bands.
 */

import { canonicalFactId } from '../../contracts'

export interface MultFact {
  factId: string
  a: number
  b: number
  product: number
  /** Cognitive band 1–6 for selection zoning. */
  band: number
}

/** D9: the single canonical fact ID implementation lives in contracts (strict). */
export { canonicalFactId }

export function parseFactId(factId: string): { a: number; b: number } {
  const match = /^(\d+)x(\d+)$/.exec(factId)
  if (!match) {
    throw new Error(`Invalid factId: ${factId}`)
  }
  return { a: Number(match[1]), b: Number(match[2]) }
}

/** Band by larger factor (tables). */
export function bandForFactors(a: number, b: number): number {
  const hi = Math.max(a, b)
  if (hi <= 2) return 1
  if (hi <= 4) return 2
  if (hi <= 6) return 3
  if (hi <= 8) return 4
  if (hi <= 10) return 5
  return 6
}

function buildFacts(maxFactor: number, maxProduct: number): MultFact[] {
  const facts: MultFact[] = []
  const seen = new Set<string>()
  for (let a = 1; a <= maxFactor; a++) {
    for (let b = 1; b <= maxFactor; b++) {
      const product = a * b
      if (product > maxProduct) continue
      const factId = canonicalFactId(a, b)
      if (seen.has(factId)) continue
      seen.add(factId)
      facts.push({
        factId,
        a: Math.min(a, b),
        b: Math.max(a, b),
        product,
        band: bandForFactors(a, b),
      })
    }
  }
  return facts
}

/** Core V1 space: factors 1–10, product ≤ 100. */
export const CORE_FACTS: MultFact[] = buildFacts(10, 100)

/** Stretch space: factors 1–12, product ≤ 144 (includes 12×12). */
export const STRETCH_FACTS: MultFact[] = buildFacts(12, 144)

export const ALL_FACT_IDS = CORE_FACTS.map((f) => f.factId)

export function getFact(factId: string): MultFact | undefined {
  return STRETCH_FACTS.find((f) => f.factId === factId)
}

export function factsInBands(bands: number[], stretch = false): MultFact[] {
  const pool = stretch ? STRETCH_FACTS : CORE_FACTS
  const set = new Set(bands)
  return pool.filter((f) => set.has(f.band))
}
