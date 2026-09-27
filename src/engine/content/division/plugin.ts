import type { Answer, AnswerChoice, MathSkill, Question, QuestionRequest, Result } from '../../contracts'
import { poolWithoutShown } from '../freshPool'
import {
  DIVISION_CONCEPTS,
  DIVISION_SKILL_ID,
  divisionConceptById,
  type DivisionConcept,
} from './concepts'

let questionSeq = 0

function nextQuestionId(): string {
  questionSeq += 1
  return `q-div-${questionSeq}`
}

export function resetDivisionQuestionSeq(): void {
  questionSeq = 0
}

function pick(pool: readonly DivisionConcept[], rng: () => number): DivisionConcept {
  if (pool.length === 0) throw new Error('Empty division pool')
  const index = Math.floor(rng() * pool.length)
  return pool[index]!
}

function resolvePool(request: QuestionRequest): DivisionConcept[] {
  if (request.targetConcepts && request.targetConcepts.length > 0) {
    return request.targetConcepts.map((id) => {
      const concept = divisionConceptById(id)
      if (!concept) throw new Error(`Unknown target concept: ${id}`)
      return concept
    })
  }
  const maxDivisor = Math.min(10, Math.max(1, Math.ceil(request.cognitiveDifficulty * 10)))
  const band = DIVISION_CONCEPTS.filter((concept) => concept.divisor <= maxDivisor)
  return band.length > 0 ? [...band] : [...DIVISION_CONCEPTS]
}

function addChoice(
  choices: AnswerChoice[],
  used: Set<number>,
  value: number,
  misconceptionId: string,
): void {
  if (!Number.isInteger(value) || value < 0 || used.has(value)) return
  used.add(value)
  choices.push({ id: misconceptionId, value, misconceptionId })
}

/** Nearby quotients and the matching product. Wrong choices carry a misconception id. */
export function divisionChoices(concept: DivisionConcept): AnswerChoice[] {
  const used = new Set<number>([concept.quotient])
  const wrong: AnswerChoice[] = []
  const swapped = concept.quotient !== concept.divisor ? concept.divisor : concept.quotient + 1
  addChoice(wrong, used, swapped, 'division.swapped-factors')
  addChoice(wrong, used, concept.dividend, 'division.answered-product')
  addChoice(wrong, used, concept.quotient + 1, 'division.off-by-one')
  addChoice(wrong, used, concept.quotient - 1, 'division.off-by-one')
  addChoice(wrong, used, concept.divisor, 'division.answered-divisor')
  return [
    { id: 'correct', value: concept.quotient },
    ...wrong.slice(0, 3),
  ]
}

function toQuestion(concept: DivisionConcept, difficulty: number): Question {
  return {
    id: nextQuestionId(),
    skillId: DIVISION_SKILL_ID,
    conceptIds: [concept.id],
    instanceKey: concept.id,
    difficulty,
    prompt: { type: 'expression', expression: `${concept.dividend} ÷ ${concept.divisor}` },
    answerType: 'multiple-choice',
    correctAnswer: concept.quotient,
    choices: divisionChoices(concept),
    metadata: {
      dividend: concept.dividend,
      divisor: concept.divisor,
      quotient: concept.quotient,
      inverseConceptId: concept.inverseConceptId,
    },
  }
}

export function createDivisionSkill(rng: () => number = Math.random): MathSkill {
  return {
    id: DIVISION_SKILL_ID,
    grade: 3,
    domain: 'operations-algebraic-thinking',
    generateQuestion(request: QuestionRequest): Question {
      const available = poolWithoutShown(resolvePool(request), (concept) => concept.id, request.excludeInstanceKeys)
      return toQuestion(pick(available, rng), request.cognitiveDifficulty)
    },
    conceptIdFor(question: Question): string {
      const conceptId = question.conceptIds[0]
      if (!conceptId) throw new Error(`Cannot resolve concept for question ${question.id}`)
      return conceptId
    },
    evaluateAnswer(question: Question, answer: Answer): Result {
      const expected = Number(question.correctAnswer)
      const given = typeof answer.value === 'number' ? answer.value : Number(String(answer.value).trim())
      const correct = Number.isFinite(given) && given === expected
      return {
        correct,
        expected,
        given,
        feedbackHint: correct ? undefined : `${question.prompt.type === 'expression' ? question.prompt.expression : ''} = ${expected}`.trim(),
      }
    },
  }
}
