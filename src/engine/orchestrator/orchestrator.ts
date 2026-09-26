import type {
  Answer,
  LearnerProfile,
  MathSkill,
  PendingReinforcement,
  Question,
  QuestionRequest,
  Result,
  SelectionStrategy,
} from '../contracts'
import { DEFAULT_SELECTION_STRATEGY } from '../contracts'
import { generateForFact } from '../content/multiplication'
import { applyAttempt, ensureFact, selectNextFact } from '../learning'

export interface ReinforcementEntry {
  factId: string
  /** Absolute question index when this becomes due. */
  dueAtIndex: number
  kind: 'reintroduce' | 'later-check'
}

export interface OrchestratorOptions {
  skill: MathSkill
  strategy?: SelectionStrategy
  rng?: () => number
  /** Inclusive range for miss → reintroduce delay (questions). */
  reintroduceDelayRange?: [number, number]
  /** Inclusive range for later-check delay after successful reinforcement. */
  laterCheckDelayRange?: [number, number]
}

/**
 * Question Orchestrator: turns learning requests into plugin calls
 * and owns in-session spaced reinforcement scheduling.
 *
 * Learning engine never generates questions — it only selects fact IDs /
 * difficulty via selection helpers; this module calls the skill plugin.
 */
export class QuestionOrchestrator {
  private readonly skill: MathSkill
  private readonly strategy: SelectionStrategy
  private readonly rng: () => number
  private readonly reintroduceDelayRange: [number, number]
  private readonly laterCheckDelayRange: [number, number]

  private queue: ReinforcementEntry[] = []
  private recentFactIds: string[] = []
  private questionIndex = 0

  constructor(options: OrchestratorOptions) {
    this.skill = options.skill
    this.strategy = options.strategy ?? DEFAULT_SELECTION_STRATEGY
    this.rng = options.rng ?? Math.random
    this.reintroduceDelayRange = options.reintroduceDelayRange ?? [3, 8]
    this.laterCheckDelayRange = options.laterCheckDelayRange ?? [5, 12]
  }

  reset(): void {
    this.queue = []
    this.recentFactIds = []
    this.questionIndex = 0
  }

  get index(): number {
    return this.questionIndex
  }

  /** Peek scheduled reinforcements (tests). */
  getScheduled(): readonly ReinforcementEntry[] {
    return this.queue
  }

  /** Seed queue from profile carry-over (relative delays → absolute). */
  seedPending(pending: PendingReinforcement[]): void {
    for (const p of pending) {
      const delay = Math.max(0, p.dueInQuestions)
      this.queue.push({
        factId: p.factId,
        dueAtIndex: this.questionIndex + delay,
        kind: p.kind,
      })
    }
    this.queue.sort((a, b) => a.dueAtIndex - b.dueAtIndex)
  }

  /** Export remaining queue as relative delays for persistence. */
  exportPending(): PendingReinforcement[] {
    return this.queue.map((e) => ({
      factId: e.factId,
      kind: e.kind,
      dueInQuestions: Math.max(0, e.dueAtIndex - this.questionIndex),
    }))
  }

  nextQuestion(
    profile: LearnerProfile,
  ): { question: Question; isReinforcement: boolean } {
    // Prefer due reinforcement / later-check.
    const dueIdx = this.queue.findIndex((e) => e.dueAtIndex <= this.questionIndex)
    if (dueIdx >= 0) {
      const [entry] = this.queue.splice(dueIdx, 1)
      if (entry) {
        const question = generateForFact(
          entry.factId,
          this.rng,
          0.5,
        )
        this.remember(entry.factId)
        this.questionIndex += 1
        return { question, isReinforcement: true }
      }
    }

    const selection = selectNextFact(profile, {
      strategy: this.strategy,
      recentFactIds: this.recentFactIds,
      avoidDuplicates: true,
      rng: this.rng,
    })

    const request: QuestionRequest = {
      skillId: this.skill.id,
      targetConcepts: [selection.factId],
      cognitiveDifficulty: selection.cognitiveDifficulty,
    }

    const question = this.skill.generateQuestion(request)
    const factId =
      typeof question.metadata?.factId === 'string'
        ? question.metadata.factId
        : selection.factId
    this.remember(factId)
    this.questionIndex += 1
    return { question, isReinforcement: false }
  }

  /**
   * Evaluate answer via plugin, update mastery on profile,
   * and schedule spaced reinforcement on miss.
   */
  submitAnswer(
    profile: LearnerProfile,
    question: Question,
    answer: Answer,
    wasReinforcement: boolean,
  ): { result: Result; profile: LearnerProfile } {
    const result = this.skill.evaluateAnswer(question, answer)
    const factId =
      typeof question.metadata?.factId === 'string'
        ? question.metadata.factId
        : null

    if (factId) {
      ensureFact(profile, factId)
      profile.facts[factId] = applyAttempt(profile.facts[factId]!, {
        correct: result.correct,
        latencyMs: answer.latencyMs,
        atMs: answer.respondedAtMs,
      })
      profile.updatedAtMs = answer.respondedAtMs

      if (!result.correct) {
        this.scheduleReintroduce(factId)
        profile.facts[factId]!.reinforcement = 'pending'
      } else if (wasReinforcement) {
        this.scheduleLaterCheck(factId)
        profile.facts[factId]!.reinforcement = 'check-pending'
      } else {
        profile.facts[factId]!.reinforcement = 'none'
      }
    }

    return { result, profile }
  }

  private scheduleReintroduce(factId: string): void {
    // Avoid stacking multiple pending reintroduces for the same fact.
    this.queue = this.queue.filter(
      (e) => !(e.factId === factId && e.kind === 'reintroduce'),
    )
    const delay = this.randDelay(this.reintroduceDelayRange)
    this.queue.push({
      factId,
      dueAtIndex: this.questionIndex + delay,
      kind: 'reintroduce',
    })
    this.queue.sort((a, b) => a.dueAtIndex - b.dueAtIndex)
  }

  private scheduleLaterCheck(factId: string): void {
    this.queue = this.queue.filter(
      (e) => !(e.factId === factId && e.kind === 'later-check'),
    )
    const delay = this.randDelay(this.laterCheckDelayRange)
    this.queue.push({
      factId,
      dueAtIndex: this.questionIndex + delay,
      kind: 'later-check',
    })
    this.queue.sort((a, b) => a.dueAtIndex - b.dueAtIndex)
  }

  private randDelay([lo, hi]: [number, number]): number {
    return lo + Math.floor(this.rng() * (hi - lo + 1))
  }

  private remember(factId: string): void {
    this.recentFactIds = [...this.recentFactIds, factId].slice(-5)
  }
}
