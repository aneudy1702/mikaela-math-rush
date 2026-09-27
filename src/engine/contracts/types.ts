/** Generic question / skill contracts — framework-independent. */

export type AnswerType =
  | 'numeric'
  | 'multiple-choice'
  | 'fraction'
  | 'text'
  | 'visual-selection'

export type QuestionPrompt =
  | { type: 'expression'; expression: string }
  | { type: 'text'; text: string }
  | { type: 'visual'; asset: string; alt: string }

export interface AnswerChoice {
  id: string
  value: unknown
  misconceptionId?: string
}

export interface Question {
  id: string
  skillId: string
  /** Concepts this question can count as evidence for. */
  conceptIds: string[]
  /**
   * Semantic question instance. Required on every evidence-eligible question.
   * Not choice order or other presentation. Multiplication uses the concept id,
   * so 7×8 and 8×7 are one instance.
   */
  instanceKey: string
  difficulty: number
  prompt: QuestionPrompt
  answerType: AnswerType
  correctAnswer: unknown
  choices?: AnswerChoice[]
  metadata?: Record<string, unknown>
}

export interface Answer {
  value: unknown
  respondedAtMs: number
  latencyMs: number
}

export interface Result {
  correct: boolean
  expected: unknown
  given: unknown
  feedbackHint?: string
}

export interface QuestionRequest {
  skillId: string
  targetConcepts?: string[]
  cognitiveDifficulty: number
}

export interface MathSkill {
  id: string
  grade: number
  domain: string
  generateQuestion(request: QuestionRequest): Question
  evaluateAnswer(question: Question, answer: Answer): Result
  /**
   * Canonical id used by live selection. Multiplication still returns the fact id
   * (`7x8`). V3 concept membership lives on `question.conceptIds`.
   */
  conceptIdFor?(question: Question): string
}

export type SessionMode = 'quick' | 'practice' | 'rush'

export const SESSION_LENGTHS: Record<SessionMode, number> = {
  quick: 10,
  practice: 25,
  rush: 100,
}

export type SelectionBucket = 'review' | 'target' | 'challenge' | 'stretch'

export interface SelectionStrategy {
  reviewWeight: number
  targetWeight: number
  challengeWeight: number
  stretchWeight: number
}

/** Default Rush-ish weights (~10 / 60 / 20 / 10). */
export const DEFAULT_SELECTION_STRATEGY: SelectionStrategy = {
  reviewWeight: 10,
  targetWeight: 60,
  challengeWeight: 20,
  stretchWeight: 10,
}

export interface FactAttempt {
  correct: boolean
  latencyMs: number
  atMs: number
}

export type ReinforcementState =
  | 'none'
  | 'pending'
  | 'due'
  | 'check-pending'
  | 'check-due'

export interface FactRecord {
  factId: string
  attempts: number
  correct: number
  recentAttempts: FactAttempt[]
  mastery: number
  confidence: number
  avgLatencyMs: number
  lastPracticedAtMs: number | null
  reinforcement: ReinforcementState
}

/** Cross-session spaced reinforcement carry-over. */
export interface PendingReinforcement {
  factId: string
  kind: 'reintroduce' | 'later-check'
  /** Questions until due when the next session starts (relative). */
  dueInQuestions: number
}

export interface SessionConfig {
  mode: SessionMode
  questionCount: number
  strategy: SelectionStrategy
  skillId: string
}

export type FeedbackTier =
  | 'correct-subtle'
  | 'soft-miss'
  | 'got-it-back'
  | 'streak-5'
  | 'streak-10'
  | 'streak-25'
  | 'streak-50'
  | 'streak-100'
  | 'new-record'

export interface SessionQuestionState {
  index: number
  total: number
  question: Question
  isBossPresentation: boolean
  isReinforcement: boolean
  startedAtMs: number
}

/** Soft-miss resource beat — same fact, timer frozen, type correct to continue. */
export interface SoftMissHold {
  expression: string
  expected: number
  reveal: string
}

export interface SessionSnapshot {
  mode: SessionMode
  index: number
  total: number
  streak: number
  longestStreak: number
  correctCount: number
  elapsedMs: number
  current: SessionQuestionState | null
  finished: boolean
  lastFeedback: FeedbackTier | null
  lastReveal: string | null
  missHold: SoftMissHold | null
  timerPaused: boolean
}
