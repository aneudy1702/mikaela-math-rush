import type {
  Answer,
  FeedbackTier,
  LearnerProfile,
  MathSkill,
  Question,
  SessionConfig,
  SessionMode,
  SessionQuestionState,
  SessionSnapshot,
} from '../contracts'
import { DEFAULT_SELECTION_STRATEGY, SESSION_LENGTHS } from '../contracts'
import { awardGameXp, recordBest } from '../learning'
import { QuestionOrchestrator } from '../orchestrator'

const STREAK_TIERS: { streak: number; tier: FeedbackTier }[] = [
  { streak: 100, tier: 'streak-100' },
  { streak: 50, tier: 'streak-50' },
  { streak: 25, tier: 'streak-25' },
  { streak: 10, tier: 'streak-10' },
  { streak: 5, tier: 'streak-5' },
]

export function buildSessionConfig(
  mode: SessionMode,
  skillId = 'multiplication',
): SessionConfig {
  return {
    mode,
    questionCount: SESSION_LENGTHS[mode],
    strategy: DEFAULT_SELECTION_STRATEGY,
    skillId,
  }
}

export interface SessionResultSummary {
  mode: SessionMode
  correctCount: number
  total: number
  longestStreak: number
  elapsedMs: number
  avgLatencyMs: number
  newTimeRecord: boolean
  newStreakRecord: boolean
}

/**
 * Session Engine — pacing, streaks, scoring, milestones, boss presentation.
 * Cognitive difficulty stays with the orchestrator/learning layer;
 * boss flag is visual/music chrome only by default.
 */
export class SessionEngine {
  private readonly config: SessionConfig
  private readonly orchestrator: QuestionOrchestrator
  private profile: LearnerProfile

  private index = 0
  private streak = 0
  private longestStreak = 0
  private correctCount = 0
  private latencySum = 0
  private startedAtMs = 0
  private finished = false
  private current: SessionQuestionState | null = null
  private lastFeedback: FeedbackTier | null = null
  private lastReveal: string | null = null
  private summary: SessionResultSummary | null = null

  constructor(
    profile: LearnerProfile,
    skill: MathSkill,
    mode: SessionMode = 'quick',
    rng: () => number = Math.random,
  ) {
    this.profile = profile
    this.config = buildSessionConfig(mode, skill.id)
    this.orchestrator = new QuestionOrchestrator({
      skill,
      strategy: this.config.strategy,
      rng,
    })
  }

  getProfile(): LearnerProfile {
    return this.profile
  }

  getSummary(): SessionResultSummary | null {
    return this.summary
  }

  start(nowMs = Date.now()): SessionSnapshot {
    this.orchestrator.reset()
    this.index = 0
    this.streak = 0
    this.longestStreak = 0
    this.correctCount = 0
    this.latencySum = 0
    this.startedAtMs = nowMs
    this.finished = false
    this.lastFeedback = null
    this.lastReveal = null
    this.summary = null
    this.advance(nowMs)
    return this.snapshot(nowMs)
  }

  snapshot(nowMs = Date.now()): SessionSnapshot {
    return {
      mode: this.config.mode,
      index: this.index,
      total: this.config.questionCount,
      streak: this.streak,
      longestStreak: this.longestStreak,
      correctCount: this.correctCount,
      elapsedMs: Math.max(0, nowMs - this.startedAtMs),
      current: this.current,
      finished: this.finished,
      lastFeedback: this.lastFeedback,
      lastReveal: this.lastReveal,
    }
  }

  submit(
    value: unknown,
    nowMs = Date.now(),
  ): SessionSnapshot {
    if (this.finished || !this.current) {
      return this.snapshot(nowMs)
    }

    const latencyMs = Math.max(0, nowMs - this.current.startedAtMs)
    const answer: Answer = {
      value,
      respondedAtMs: nowMs,
      latencyMs,
    }

    const { result, profile } = this.orchestrator.submitAnswer(
      this.profile,
      this.current.question,
      answer,
      this.current.isReinforcement,
    )
    this.profile = profile
    this.latencySum += latencyMs

    if (result.correct) {
      this.correctCount += 1
      this.streak += 1
      this.longestStreak = Math.max(this.longestStreak, this.streak)
      this.lastReveal = null
      this.lastFeedback = feedbackForStreak(this.streak)
      awardGameXp(this.profile, xpForCorrect(this.streak))
    } else {
      this.streak = 0
      this.lastFeedback = 'soft-miss'
      this.lastReveal = result.feedbackHint ?? String(result.expected)
    }

    this.index += 1

    if (this.index >= this.config.questionCount) {
      this.finish(nowMs)
    } else {
      this.advance(nowMs)
    }

    return this.snapshot(nowMs)
  }

  private advance(nowMs: number): void {
    const { question, isReinforcement } = this.orchestrator.nextQuestion(
      this.profile,
    )
    // Boss presentation every 10th question (1-based display index).
    const displayNumber = this.index + 1
    const isBossPresentation =
      displayNumber > 0 && displayNumber % 10 === 0

    this.current = {
      index: this.index,
      total: this.config.questionCount,
      question,
      isBossPresentation,
      isReinforcement,
      startedAtMs: nowMs,
    }
  }

  private finish(nowMs: number): void {
    this.finished = true
    this.current = null
    const elapsedMs = Math.max(0, nowMs - this.startedAtMs)
    const { newTimeRecord, newStreakRecord } = recordBest(
      this.profile,
      this.config.mode,
      elapsedMs,
      this.longestStreak,
    )
    if (newTimeRecord || newStreakRecord) {
      this.lastFeedback = 'new-record'
    }
    this.summary = {
      mode: this.config.mode,
      correctCount: this.correctCount,
      total: this.config.questionCount,
      longestStreak: this.longestStreak,
      elapsedMs,
      avgLatencyMs:
        this.config.questionCount > 0
          ? this.latencySum / this.config.questionCount
          : 0,
      newTimeRecord,
      newStreakRecord,
    }
  }
}

function feedbackForStreak(streak: number): FeedbackTier {
  for (const t of STREAK_TIERS) {
    if (streak === t.streak) return t.tier
  }
  return 'correct-subtle'
}

function xpForCorrect(streak: number): number {
  if (streak >= 50) return 25
  if (streak >= 25) return 15
  if (streak >= 10) return 10
  if (streak >= 5) return 5
  return 2
}

/** Expose question for tests without advancing. */
export function peekCurrentQuestion(
  engine: SessionEngine,
): Question | null {
  return engine.snapshot().current?.question ?? null
}
