import type { Answer, MathSkill, Question, QuestionRequest, Result } from '../../contracts'
import { poolWithoutShown } from '../freshPool'
import {
  ALGEBRA_ITEMS,
  ALGEBRA_SKILL_ID,
  algebraItemsFor,
  type AlgebraItem,
} from './catalog'

let questionSeq = 0

export function resetAlgebraQuestionSeq(): void {
  questionSeq = 0
}

function resolvePool(request: QuestionRequest): AlgebraItem[] {
  if (request.targetConcepts && request.targetConcepts.length > 0) {
    return request.targetConcepts.flatMap((id) => algebraItemsFor(id, request.cognitiveDifficulty))
  }
  const ids = [...new Set(ALGEBRA_ITEMS.map((item) => item.conceptId))]
  return ids.flatMap((id) => algebraItemsFor(id, request.cognitiveDifficulty))
}

function toQuestion(item: AlgebraItem, difficulty: number): Question {
  questionSeq += 1
  const used = new Set<number>([item.solution])
  const wrong = item.distractors.filter((distractor) => {
    if (distractor.value === item.solution || used.has(distractor.value)) return false
    used.add(distractor.value)
    return true
  })
  return {
    id: `q-alg-${questionSeq}`,
    skillId: ALGEBRA_SKILL_ID,
    conceptIds: [item.conceptId],
    instanceKey: item.instanceKey,
    difficulty,
    prompt: { type: 'text', text: item.prompt },
    answerType: 'multiple-choice',
    correctAnswer: item.solution,
    choices: [
      { id: 'correct', value: item.solution },
      ...wrong.slice(0, 3).map((distractor) => ({
        id: distractor.misconceptionId,
        value: distractor.value,
        misconceptionId: distractor.misconceptionId,
      })),
    ],
  }
}

export function createAlgebraSkill(rng: () => number = Math.random): MathSkill {
  return {
    id: ALGEBRA_SKILL_ID,
    grade: 6,
    domain: 'operations-algebraic-thinking',
    generateQuestion(request: QuestionRequest): Question {
      const available = poolWithoutShown(resolvePool(request), (item) => item.instanceKey, request.excludeInstanceKeys)
      if (available.length === 0) throw new Error('Empty algebra pool')
      const item = available[Math.floor(rng() * available.length)]!
      return toQuestion(item, request.cognitiveDifficulty)
    },
    conceptIdFor(question: Question): string {
      const conceptId = question.conceptIds[0]
      if (!conceptId) throw new Error(`Cannot resolve concept for question ${question.id}`)
      return conceptId
    },
    evaluateAnswer(question: Question, answer: Answer): Result {
      const expected = Number(question.correctAnswer)
      const given = typeof answer.value === 'number' ? answer.value : Number(String(answer.value).trim())
      return {
        correct: Number.isFinite(given) && given === expected,
        expected,
        given,
      }
    },
  }
}
