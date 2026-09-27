import type { AnswerType, LearningConcept, QuestionPrompt } from '../../contracts'

export const FRACTIONS_SKILL_ID = 'fractions'

export interface FractionValue {
  numerator: number
  denominator: number
}

export interface FractionItem {
  conceptId: string
  instanceKey: string
  prompt: QuestionPrompt
  answerType: AnswerType
  correct: FractionValue | number
  distractors: { value: FractionValue | number; misconceptionId: string }[]
  reach: 'core' | 'wide'
}

export const FRACTION_CONCEPTS: readonly LearningConcept[] = [
  { id: 'fractions.identify.visual', skillId: FRACTIONS_SKILL_ID, title: 'Identify a fraction visually' },
  { id: 'fractions.parts.numerator-denominator', skillId: FRACTIONS_SKILL_ID, title: 'Numerator and denominator' },
  { id: 'fractions.number-line', skillId: FRACTIONS_SKILL_ID, title: 'Fractions on a number line' },
  { id: 'fractions.compare.same-denominator', skillId: FRACTIONS_SKILL_ID, title: 'Compare, same denominator' },
  { id: 'fractions.compare.same-numerator', skillId: FRACTIONS_SKILL_ID, title: 'Compare, same numerator' },
  { id: 'fractions.equivalent', skillId: FRACTIONS_SKILL_ID, title: 'Equivalent fractions' },
  { id: 'fractions.compare.mixed', skillId: FRACTIONS_SKILL_ID, title: 'Mixed comparison' },
]

export function fractionKey(value: FractionValue): string {
  return `${value.numerator}/${value.denominator}`
}

function fraction(numerator: number, denominator: number): FractionValue {
  return { numerator, denominator }
}

function pairKey(conceptId: string, left: FractionValue, right: FractionValue): string {
  const ordered = [left, right].toSorted(
    (a, b) => a.numerator / a.denominator - b.numerator / b.denominator,
  )
  return `${conceptId}:${fractionKey(ordered[0]!)}|${fractionKey(ordered[1]!)}`
}

function identify(value: FractionValue, reach: 'core' | 'wide'): FractionItem {
  const shaded = value.numerator
  const rest = value.denominator - value.numerator
  return {
    conceptId: 'fractions.identify.visual',
    instanceKey: `fractions.identify.visual:${fractionKey(value)}`,
    prompt: {
      type: 'visual',
      asset: `fraction-bar:${fractionKey(value)}`,
      alt: `${shaded} of ${value.denominator} equal parts shaded`,
    },
    answerType: 'visual-selection',
    correct: value,
    reach,
    distractors: [
      { value: fraction(rest, value.denominator), misconceptionId: 'fractions.unshaded-as-numerator' },
      { value: fraction(value.denominator, value.numerator), misconceptionId: 'fractions.inverted' },
      { value: fraction(value.numerator, value.numerator + value.denominator), misconceptionId: 'fractions.parts-added' },
    ],
  }
}

function parts(value: FractionValue, ask: 'numerator' | 'denominator'): FractionItem {
  const correct = ask === 'numerator' ? value.numerator : value.denominator
  const swapped = ask === 'numerator' ? value.denominator : value.numerator
  return {
    conceptId: 'fractions.parts.numerator-denominator',
    instanceKey: `fractions.parts.numerator-denominator:${ask}:${fractionKey(value)}`,
    prompt: { type: 'text', text: `What is the ${ask} of ${fractionKey(value)}?` },
    answerType: 'numeric',
    correct,
    reach: value.denominator > 8 ? 'wide' : 'core',
    distractors: [
      {
        value: swapped,
        misconceptionId: ask === 'numerator' ? 'fractions.denominator-as-numerator' : 'fractions.numerator-as-denominator',
      },
    ],
  }
}

function numberLine(value: FractionValue): FractionItem {
  return {
    conceptId: 'fractions.number-line',
    instanceKey: `fractions.number-line:${fractionKey(value)}`,
    prompt: {
      type: 'visual',
      asset: `number-line:${fractionKey(value)}`,
      alt: `a point at ${fractionKey(value)} on a number line from 0 to 1`,
    },
    answerType: 'visual-selection',
    correct: value,
    reach: value.denominator > 8 ? 'wide' : 'core',
    distractors: [
      { value: fraction(value.denominator - value.numerator, value.denominator), misconceptionId: 'fractions.unshaded-as-numerator' },
      { value: fraction(value.numerator, value.denominator - 1), misconceptionId: 'fractions.wrong-partition' },
    ],
  }
}

function compareSameDenominator(left: FractionValue, right: FractionValue, reach: 'core' | 'wide'): FractionItem {
  const greater = left.numerator > right.numerator ? left : right
  const lesser = greater === left ? right : left
  return {
    conceptId: 'fractions.compare.same-denominator',
    instanceKey: pairKey('fractions.compare.same-denominator', left, right),
    prompt: {
      type: 'text',
      text: `Which is greater, ${fractionKey(left)} or ${fractionKey(right)}?`,
    },
    answerType: 'fraction',
    correct: greater,
    reach,
    distractors: [{ value: lesser, misconceptionId: 'fractions.chose-smaller' }],
  }
}

function compareSameNumerator(left: FractionValue, right: FractionValue): FractionItem {
  const greater = left.denominator < right.denominator ? left : right
  const lesser = greater === left ? right : left
  return {
    conceptId: 'fractions.compare.same-numerator',
    instanceKey: pairKey('fractions.compare.same-numerator', left, right),
    prompt: {
      type: 'text',
      text: `Which is greater, ${fractionKey(left)} or ${fractionKey(right)}?`,
    },
    answerType: 'fraction',
    correct: greater,
    reach: Math.max(left.denominator, right.denominator) > 8 ? 'wide' : 'core',
    distractors: [{ value: lesser, misconceptionId: 'fractions.larger-denominator-is-larger' }],
  }
}

function equivalent(source: FractionValue, match: FractionValue, miss: FractionValue): FractionItem {
  return {
    conceptId: 'fractions.equivalent',
    instanceKey: `fractions.equivalent:${fractionKey(source)}=${fractionKey(match)}`,
    prompt: { type: 'text', text: `Which fraction equals ${fractionKey(source)}?` },
    answerType: 'fraction',
    correct: match,
    reach: source.denominator > 4 ? 'wide' : 'core',
    distractors: [{ value: miss, misconceptionId: 'fractions.not-equivalent' }],
  }
}

function mixed(left: FractionValue, right: FractionValue): FractionItem {
  const leftValue = left.numerator / left.denominator
  const rightValue = right.numerator / right.denominator
  const greater = leftValue > rightValue ? left : right
  const lesser = greater === left ? right : left
  return {
    conceptId: 'fractions.compare.mixed',
    instanceKey: pairKey('fractions.compare.mixed', left, right),
    prompt: {
      type: 'text',
      text: `Which is greater, ${fractionKey(left)} or ${fractionKey(right)}?`,
    },
    answerType: 'fraction',
    correct: greater,
    reach: 'wide',
    distractors: [{ value: lesser, misconceptionId: 'fractions.wrong-cross-compare' }],
  }
}

export const FRACTION_ITEMS: readonly FractionItem[] = [
  identify(fraction(3, 8), 'core'),
  identify(fraction(1, 2), 'core'),
  identify(fraction(5, 6), 'core'),
  identify(fraction(7, 12), 'wide'),
  parts(fraction(3, 8), 'numerator'),
  parts(fraction(3, 8), 'denominator'),
  parts(fraction(7, 12), 'numerator'),
  parts(fraction(7, 12), 'denominator'),
  numberLine(fraction(3, 8)),
  numberLine(fraction(1, 4)),
  numberLine(fraction(5, 6)),
  numberLine(fraction(7, 12)),
  compareSameDenominator(fraction(3, 8), fraction(5, 8), 'core'),
  compareSameDenominator(fraction(7, 12), fraction(11, 12), 'wide'),
  compareSameDenominator(fraction(1, 6), fraction(5, 6), 'core'),
  compareSameDenominator(fraction(2, 9), fraction(7, 9), 'wide'),
  compareSameNumerator(fraction(3, 8), fraction(3, 5)),
  compareSameNumerator(fraction(2, 7), fraction(2, 3)),
  compareSameNumerator(fraction(4, 6), fraction(4, 5)),
  compareSameNumerator(fraction(2, 9), fraction(2, 3)),
  compareSameNumerator(fraction(4, 10), fraction(4, 5)),
  equivalent(fraction(1, 2), fraction(2, 4), fraction(2, 3)),
  equivalent(fraction(1, 3), fraction(2, 6), fraction(2, 5)),
  equivalent(fraction(3, 4), fraction(6, 8), fraction(3, 5)),
  mixed(fraction(3, 4), fraction(2, 3)),
  mixed(fraction(5, 6), fraction(3, 4)),
  mixed(fraction(2, 5), fraction(3, 8)),
]

export function fractionItemsFor(conceptId: string, difficulty: number): FractionItem[] {
  const matched = FRACTION_ITEMS.filter((item) => item.conceptId === conceptId)
  if (matched.length === 0) throw new Error(`Unknown target concept: ${conceptId}`)
  if (difficulty >= 0.85) return matched
  const core = matched.filter((item) => item.reach === 'core')
  return core.length > 0 ? core : matched
}
