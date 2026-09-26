import type {
  Answer,
  MathSkill,
  Question,
  QuestionRequest,
  Result,
} from '../../contracts'
import { canonicalFactId, isCanonicalFactId } from '../../contracts'
import {
  CORE_FACTS,
  STRETCH_FACTS,
  getFact,
  type MultFact,
} from './facts'

export const MULTIPLICATION_SKILL_ID = 'multiplication'

let questionSeq = 0

function nextQuestionId(): string {
  questionSeq += 1
  return `q-mult-${questionSeq}-${Date.now()}`
}

/** Reset ID sequence (tests). */
export function resetQuestionSeq(): void {
  questionSeq = 0
}

function pickFromPool(pool: MultFact[], rng: () => number): MultFact {
  if (pool.length === 0) {
    throw new Error('Empty multiplication fact pool')
  }
  const idx = Math.floor(rng() * pool.length)
  return pool[idx]!
}

function resolvePool(request: QuestionRequest): MultFact[] {
  // D9: targeted requests are honored exactly — no band/stretch fallback. Unknown or
  // non-canonical IDs throw.
  if (request.targetConcepts && request.targetConcepts.length > 0) {
    return request.targetConcepts.map((id) => {
      const fact = getFact(id)
      if (!fact) throw new Error(`Unknown target concept: ${id}`)
      return fact
    })
  }

  const stretch = request.cognitiveDifficulty >= 0.85
  const base = stretch ? STRETCH_FACTS : CORE_FACTS

  // Map cognitiveDifficulty 0–1 onto bands 1–6.
  const maxBand = Math.min(
    6,
    Math.max(1, Math.ceil(request.cognitiveDifficulty * 6)),
  )
  const bandFiltered = base.filter((f) => f.band <= maxBand)
  return bandFiltered.length > 0 ? bandFiltered : base
}

/** D9 conceptIdFor: canonical fact ID of a question, whatever orientation was shown (8 × 7 → "7x8"). */
export function multiplicationConceptIdFor(question: Question): string {
  const a = question.metadata?.a
  const b = question.metadata?.b
  if (typeof a === 'number' && typeof b === 'number') return canonicalFactId(a, b)
  const factId = question.metadata?.factId
  if (typeof factId === 'string' && isCanonicalFactId(factId)) return factId
  throw new Error(`Cannot resolve concept for question ${question.id}`)
}

function toQuestion(fact: MultFact, presentAs: 'ab' | 'ba', difficulty: number): Question {
  const a = presentAs === 'ab' ? fact.a : fact.b
  const b = presentAs === 'ab' ? fact.b : fact.a
  return {
    id: nextQuestionId(),
    skillId: MULTIPLICATION_SKILL_ID,
    difficulty,
    prompt: { type: 'expression', expression: `${a} × ${b}` },
    answerType: 'numeric',
    correctAnswer: fact.product,
    metadata: {
      factId: fact.factId,
      a,
      b,
      band: fact.band,
    },
  }
}

export function createMultiplicationSkill(rng: () => number = Math.random): MathSkill {
  return {
    id: MULTIPLICATION_SKILL_ID,
    grade: 3,
    domain: 'operations-algebraic-thinking',

    generateQuestion(request: QuestionRequest): Question {
      const pool = resolvePool(request)
      const fact = pickFromPool(pool, rng)
      const presentAs = rng() < 0.5 ? 'ab' : 'ba'
      return toQuestion(fact, presentAs, request.cognitiveDifficulty)
    },

    conceptIdFor: multiplicationConceptIdFor,

    evaluateAnswer(question: Question, answer: Answer): Result {
      const expected = Number(question.correctAnswer)
      const givenRaw = answer.value
      const given =
        typeof givenRaw === 'number'
          ? givenRaw
          : Number(String(givenRaw).trim())

      const correct = Number.isFinite(given) && given === expected
      const a = question.metadata?.a
      const b = question.metadata?.b
      const hint =
        typeof a === 'number' && typeof b === 'number'
          ? `${a}×${b}=${expected}`
          : `${expected}`

      return {
        correct,
        expected,
        given,
        feedbackHint: correct ? undefined : hint,
      }
    },
  }
}

export function generateForFact(
  factId: string,
  rng: () => number = Math.random,
  difficulty = 0.5,
): Question {
  const fact = getFact(factId)
  if (!fact) throw new Error(`Unknown fact: ${factId}`)
  const presentAs = rng() < 0.5 ? 'ab' : 'ba'
  return toQuestion(fact, presentAs, difficulty)
}

export { canonicalFactId }
