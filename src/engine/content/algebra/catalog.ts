import type { LearningConcept } from '../../contracts'

export const ALGEBRA_SKILL_ID = 'algebra-one-step'

export interface AlgebraItem {
  conceptId: string
  instanceKey: string
  prompt: string
  solution: number
  reach: 'core' | 'wide'
  distractors: { value: number; misconceptionId: string }[]
}

export const ALGEBRA_CONCEPTS: readonly LearningConcept[] = [
  { id: 'algebra.one-step.addition', skillId: ALGEBRA_SKILL_ID, title: 'One-step addition' },
  { id: 'algebra.one-step.multiplication', skillId: ALGEBRA_SKILL_ID, title: 'One-step multiplication' },
  { id: 'algebra.one-step.subtraction', skillId: ALGEBRA_SKILL_ID, title: 'One-step subtraction' },
  { id: 'algebra.one-step.division', skillId: ALGEBRA_SKILL_ID, title: 'One-step division' },
]

function uniqueDistractors(
  solution: number,
  candidates: { value: number; misconceptionId: string }[],
): { value: number; misconceptionId: string }[] {
  const used = new Set<number>([solution])
  const distractors: { value: number; misconceptionId: string }[] = []
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.value) || candidate.value < 1 || used.has(candidate.value)) continue
    used.add(candidate.value)
    distractors.push(candidate)
  }
  return distractors
}

function addition(addend: number, solution: number, reach: 'core' | 'wide'): AlgebraItem {
  const sum = solution + addend
  return {
    conceptId: 'algebra.one-step.addition',
    instanceKey: `algebra.one-step.addition:x+${addend}=${sum}`,
    prompt: `x + ${addend} = ${sum}`,
    solution,
    reach,
    distractors: uniqueDistractors(solution, [
      { value: sum + addend, misconceptionId: 'algebra.added-instead-of-subtracted' },
      { value: sum, misconceptionId: 'algebra.answered-right-side' },
      { value: addend, misconceptionId: 'algebra.answered-operand' },
    ]),
  }
}

function multiplication(factor: number, solution: number, reach: 'core' | 'wide'): AlgebraItem {
  const product = factor * solution
  return {
    conceptId: 'algebra.one-step.multiplication',
    instanceKey: `algebra.one-step.multiplication:${factor}x=${product}`,
    prompt: `${factor}x = ${product}`,
    solution,
    reach,
    distractors: uniqueDistractors(solution, [
      { value: product * factor, misconceptionId: 'algebra.multiplied-instead-of-divided' },
      { value: product, misconceptionId: 'algebra.answered-right-side' },
      { value: factor, misconceptionId: 'algebra.answered-operand' },
    ]),
  }
}

function subtraction(subtrahend: number, solution: number, reach: 'core' | 'wide'): AlgebraItem {
  const result = solution - subtrahend
  return {
    conceptId: 'algebra.one-step.subtraction',
    instanceKey: `algebra.one-step.subtraction:x-${subtrahend}=${result}`,
    prompt: `x - ${subtrahend} = ${result}`,
    solution,
    reach,
    distractors: uniqueDistractors(solution, [
      { value: result - subtrahend, misconceptionId: 'algebra.subtracted-instead-of-added' },
      { value: result, misconceptionId: 'algebra.answered-right-side' },
      { value: subtrahend, misconceptionId: 'algebra.answered-operand' },
    ]),
  }
}

function division(divisor: number, solution: number, reach: 'core' | 'wide'): AlgebraItem {
  const quotient = solution / divisor
  const dividedInstead = Math.floor(quotient / divisor)
  return {
    conceptId: 'algebra.one-step.division',
    instanceKey: `algebra.one-step.division:x/${divisor}=${quotient}`,
    prompt: `x / ${divisor} = ${quotient}`,
    solution,
    reach,
    distractors: uniqueDistractors(solution, [
      { value: dividedInstead, misconceptionId: 'algebra.divided-instead-of-multiplied' },
      { value: quotient, misconceptionId: 'algebra.answered-right-side' },
      { value: divisor, misconceptionId: 'algebra.answered-operand' },
      { value: quotient - divisor, misconceptionId: 'algebra.subtracted-operands' },
    ]),
  }
}

export const ALGEBRA_ITEMS: readonly AlgebraItem[] = [
  addition(4, 7, 'core'),
  addition(8, 5, 'core'),
  addition(3, 9, 'core'),
  addition(6, 8, 'core'),
  addition(5, 7, 'core'),
  addition(2, 10, 'core'),
  addition(9, 6, 'core'),
  addition(7, 8, 'core'),
  addition(17, 22, 'wide'),
  addition(12, 15, 'wide'),
  multiplication(3, 6, 'core'),
  multiplication(4, 5, 'core'),
  multiplication(6, 4, 'core'),
  multiplication(5, 7, 'core'),
  multiplication(2, 9, 'core'),
  multiplication(7, 3, 'core'),
  multiplication(9, 2, 'core'),
  multiplication(8, 6, 'core'),
  multiplication(8, 9, 'wide'),
  multiplication(12, 7, 'wide'),
  subtraction(7, 19, 'core'),
  subtraction(4, 12, 'core'),
  subtraction(3, 11, 'core'),
  subtraction(6, 15, 'core'),
  subtraction(8, 20, 'core'),
  subtraction(5, 14, 'core'),
  subtraction(2, 9, 'core'),
  subtraction(9, 21, 'core'),
  subtraction(15, 40, 'wide'),
  subtraction(9, 30, 'wide'),
  division(4, 24, 'core'),
  division(3, 18, 'core'),
  division(2, 12, 'core'),
  division(5, 30, 'core'),
  division(4, 32, 'core'),
  division(3, 21, 'core'),
  division(6, 48, 'core'),
  division(7, 56, 'core'),
  division(8, 80, 'wide'),
  division(6, 42, 'wide'),
]

export function algebraItemsFor(conceptId: string, difficulty: number): AlgebraItem[] {
  const matched = ALGEBRA_ITEMS.filter((item) => item.conceptId === conceptId)
  if (matched.length === 0) throw new Error(`Unknown target concept: ${conceptId}`)
  if (difficulty >= 0.85) return matched
  const core = matched.filter((item) => item.reach === 'core')
  return core.length > 0 ? core : matched
}
