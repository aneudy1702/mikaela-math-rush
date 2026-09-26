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
  SoftMissHold,
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
  softMisses: number
  recoveries: number
  factsGettingStronger: number
}

/**
 * Session Engine — pacing, streaks, scoring, milestones, boss presentation.
 * Soft-miss holds freeze the timer until the kid retypes the correct answer.
 */
export class SessionEngine {
  private readonly config: SessionConfig
  private readonly orchestrator: QuestionOrchestrator
  private profile: LearnerProfile

  private index = 0
  private streak = 0
  private longestStreak = 0
  private correctCount = 0
  private softMisses = 0
  private recoveries = 0
  private latencySum = 0
  private startedAtMs = 0
  private pausedAccumMs = 0
  private pauseStartedAtMs: number | null = null
  private finished = false
  private current: SessionQuestionState | null = null
  private lastFeedback: FeedbackTier | null = null
  private lastReveal: string | null = null
  private missHold: SoftMissHold | null = null
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
    const carried = this.profile.pendingReinforcements ?? []
    this.orchestrator.seedPending(carried)
    this.profile.pendingReinforcements = []

    this.index = 0
    this.streak = 0
    this.longestStreak = 0
    this.correctCount = 0
    this.softMisses = 0
    this.recoveries = 0
    this.latencySum = 0
    this.startedAtMs = nowMs
    this.pausedAccumMs = 0
    this.pauseStartedAtMs = null
    this.finished = false
    this.lastFeedback = null
    this.lastReveal = null
    this.missHold = null
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
      elapsedMs: this.elapsed(nowMs),
      current: this.missHold ? this.current : this.current,
      finished: this.finished,
      lastFeedback: this.lastFeedback,
      lastReveal: this.lastReveal,
      missHold: this.missHold,
      timerPaused: this.pauseStartedAtMs != null,
    }
  }

  submit(value: unknown, nowMs = Date.now()): SessionSnapshot {
    if (this.finished) return this.snapshot(nowMs)

    // Soft-miss gate: retype correct product to continue (no XP / no streak).
    if (this.missHold) {
      return this.submitMissContinue(value, nowMs)
    }

    if (!this.current) return this.snapshot(nowMs)

    const wasReinforcement = this.current.isReinforcement
    const heldQuestion = this.current.question
    const latencyMs = Math.max(0, nowMs - this.current.startedAtMs)
    const answer: Answer = {
      value,
      respondedAtMs: nowMs,
      latencyMs,
    }

    const { result, profile } = this.orchestrator.submitAnswer(
      this.profile,
      heldQuestion,
      answer,
      wasReinforcement,
    )
    this.profile = profile
    this.latencySum += latencyMs

    if (result.correct) {
      this.correctCount += 1
      this.streak += 1
      this.longestStreak = Math.max(this.longestStreak, this.streak)
      this.lastReveal = null
      if (wasReinforcement) {
        this.recoveries += 1
        this.lastFeedback = 'got-it-back'
      } else {
        this.lastFeedback = feedbackForStreak(this.streak)
      }
      awardGameXp(this.profile, xpForCorrect(this.streak))
      this.index += 1
      if (this.index >= this.config.questionCount) {
        this.finish(nowMs)
      } else {
        this.advance(nowMs)
      }
    } else {
      this.streak = 0
      this.softMisses += 1
      this.lastFeedback = 'soft-miss'
      this.lastReveal = result.feedbackHint ?? String(result.expected)
      const expression =
        heldQuestion.prompt.type === 'expression'
          ? heldQuestion.prompt.expression
          : String(result.expected)
      this.missHold = {
        expression,
        expected: Number(result.expected),
        reveal: this.lastReveal,
      }
      this.pauseStartedAtMs = nowMs
      this.index += 1
      // Stay on same visual fact; do not advance until continue succeeds.
    }

    return this.snapshot(nowMs)
  }

  private submitMissContinue(
    value: unknown,
    nowMs: number,
  ): SessionSnapshot {
    if (!this.missHold) return this.snapshot(nowMs)
    const given =
      typeof value === 'number' ? value : Number(String(value).trim())
    if (!Number.isFinite(given) || given !== this.missHold.expected) {
      // Keep hold; gentle nudge stays on screen.
      this.lastFeedback = 'soft-miss'
      return this.snapshot(nowMs)
    }

    this.missHold = null
    this.lastReveal = null
    this.lastFeedback = null
    if (this.pauseStartedAtMs != null) {
      this.pausedAccumMs += Math.max(0, nowMs - this.pauseStartedAtMs)
      this.pauseStartedAtMs = null
    }

    if (this.index >= this.config.questionCount) {
      this.finish(nowMs)
    } else {
      this.advance(nowMs)
    }
    return this.snapshot(nowMs)
  }

  private elapsed(nowMs: number): number {
    let paused = this.pausedAccumMs
    if (this.pauseStartedAtMs != null) {
      paused += Math.max(0, nowMs - this.pauseStartedAtMs)
    }
    return Math.max(0, nowMs - this.startedAtMs - paused)
  }

  private advance(nowMs: number): void {
    const { question, isReinforcement } = this.orchestrator.nextQuestion(
      this.profile,
    )
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
    this.missHold = null
    if (this.pauseStartedAtMs != null) {
      this.pausedAccumMs += Math.max(0, nowMs - this.pauseStartedAtMs)
      this.pauseStartedAtMs = null
    }

    // Persist unfinished spaced practice for the next session.
    this.profile.pendingReinforcements = this.orchestrator.exportPending()
    this.profile.updatedAtMs = nowMs

    const elapsedMs = this.elapsed(nowMs)
    const { newTimeRecord, newStreakRecord } = recordBest(
      this.profile,
      this.config.mode,
      elapsedMs,
      this.longestStreak,
    )
    if (newTimeRecord || newStreakRecord) {
      this.lastFeedback = 'new-record'
    }

    const factsGettingStronger = Object.values(this.profile.facts).filter(
      (f) =>
        f.attempts > 0 &&
        f.recentAttempts.length > 0 &&
        f.recentAttempts[f.recentAttempts.length - 1]?.correct,
    ).length

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
      softMisses: this.softMisses,
      recoveries: this.recoveries,
      factsGettingStronger,
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
