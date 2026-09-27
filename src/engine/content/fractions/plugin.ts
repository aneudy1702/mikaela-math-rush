import type { Answer, AnswerChoice, MathSkill, Question, QuestionRequest, Result } from '../../contracts'
import { poolWithoutShown } from '../freshPool'
import {
  FRACTION_ITEMS,
  FRACTIONS_SKILL_ID,
  fractionItemsFor,
  type FractionItem,
  type FractionValue,
} from './catalog'

let questionSeq = 0

export function resetFractionQuestionSeq(): void {
  questionSeq = 0
}

function isFraction(value: unknown): value is FractionValue {
  if (!value || typeof value !== 'object') return false
  const fraction = value as FractionValue
  return Number.isInteger(fraction.numerator) && Number.isInteger(fraction.denominator)
}

function sameAnswer(expected: unknown, given: unknown): boolean {
  if (typeof expected === 'number') return Number(given) === expected
  if (isFraction(expected) && isFraction(given)) {
    return expected.numerator === given.numerator && expected.denominator === given.denominator
  }
  return false
}

function choicesFor(item: FractionItem): AnswerChoice[] {
  return [
    { id: 'correct', value: item.correct },
    ...item.distractors.map((distractor) => ({
      id: distractor.misconceptionId,
      value: distractor.value,
      misconceptionId: distractor.misconceptionId,
    })),
  ]
}

function resolvePool(request: QuestionRequest): FractionItem[] {
  if (request.targetConcepts && request.targetConcepts.length > 0) {
    return request.targetConcepts.flatMap((id) => fractionItemsFor(id, request.cognitiveDifficulty))
  }
  const ids = [...new Set(FRACTION_ITEMS.map((item) => item.conceptId))]
  return ids.flatMap((id) => fractionItemsFor(id, request.cognitiveDifficulty))
}

function toQuestion(item: FractionItem, difficulty: number): Question {
  questionSeq += 1
  return {
    id: `q-frac-${questionSeq}`,
    skillId: FRACTIONS_SKILL_ID,
    conceptIds: [item.conceptId],
    instanceKey: item.instanceKey,
    difficulty,
    prompt: item.prompt,
    answerType: item.answerType,
    correctAnswer: item.correct,
    choices: choicesFor(item),
  }
}

export function createFractionsSkill(rng: () => number = Math.random): MathSkill {
  return {
    id: FRACTIONS_SKILL_ID,
    grade: 4,
    domain: 'number-and-operations-fractions',
    generateQuestion(request: QuestionRequest): Question {
      const available = poolWithoutShown(resolvePool(request), (item) => item.instanceKey, request.excludeInstanceKeys)
      if (available.length === 0) throw new Error('Empty fractions pool')
      const item = available[Math.floor(rng() * available.length)]!
      return toQuestion(item, request.cognitiveDifficulty)
    },
    conceptIdFor(question: Question): string {
      const conceptId = question.conceptIds[0]
      if (!conceptId) throw new Error(`Cannot resolve concept for question ${question.id}`)
      return conceptId
    },
    evaluateAnswer(question: Question, answer: Answer): Result {
      const correct = sameAnswer(question.correctAnswer, answer.value)
      return { correct, expected: question.correctAnswer, given: answer.value }
    },
  }
}
