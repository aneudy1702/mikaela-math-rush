import type { Question } from '../../contracts'

export const CHOICE_COUNT = 4

function factorsOf(question: Question): { a: number; b: number } | null {
  const a = question.metadata?.a
  const b = question.metadata?.b
  if (typeof a === 'number' && typeof b === 'number' && a >= 1 && b >= 1) {
    return { a, b }
  }
  if (question.prompt.type !== 'expression') return null
  const match = question.prompt.expression.match(/(\d+)\s*[×x*]\s*(\d+)/)
  if (!match) return null
  return { a: Number(match[1]), b: Number(match[2]) }
}

function hashSeed(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffle(values: number[], seedText: string): number[] {
  const ordered = values.slice()
  let state = hashSeed(seedText) || 1
  for (let i = ordered.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    const current = ordered[i]!
    ordered[i] = ordered[j]!
    ordered[j] = current
  }
  return ordered
}

function takeWrong(product: number, candidates: number[]): number[] {
  const used = new Set<number>([product])
  const wrong: number[] = []
  for (const value of candidates) {
    if (!Number.isInteger(value) || value < 1 || value > 200 || used.has(value)) continue
    used.add(value)
    wrong.push(value)
    if (wrong.length === CHOICE_COUNT - 1) return wrong
  }
  let pad = product + 1
  while (wrong.length < CHOICE_COUNT - 1 && pad <= product + 40) {
    if (!used.has(pad)) {
      used.add(pad)
      wrong.push(pad)
    }
    pad += 1
  }
  return wrong
}

/**
 * Four positive integers for a multiplication question. One is the product.
 * The other three prefer nearby factor mistakes (off-by-one tables, an extra
 * or missing group) so a guess still has to know the fact. Order is stable
 * for a question id, so a re-render does not move the right answer.
 */
export function multiplicationChoices(question: Question): number[] {
  const product = Number(question.correctAnswer)
  if (!Number.isInteger(product) || product < 1) return []

  const factors = factorsOf(question)
  const candidates: number[] = []
  if (factors) {
    const { a, b } = factors
    candidates.push(
      (a + 1) * b,
      a * (b + 1),
      (a - 1) * b,
      a * (b - 1),
      product + a,
      product + b,
      product - a,
      product - b,
      product + 1,
      product - 1,
      a + b,
    )
  } else {
    candidates.push(product + 1, product - 1, product + 2, product + 10)
  }

  return shuffle([product, ...takeWrong(product, candidates)], question.id || String(product))
}
