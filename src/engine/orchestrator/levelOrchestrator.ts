import type {
  AttemptSource,
  FactEvidence,
  FactStatus,
  LevelDef,
  LevelId,
  MathSkill,
  PendingReinforcement,
  Question,
  SessionMode,
  SkillCurriculum,
} from '../contracts'
import { RULES, SPEC_CONSTANTS } from '../contracts'
import { getCurriculum, getLevel, reviewFactIds, scopeFactIds } from '../curriculum'
import { isLikelyCorrect } from '../learning/advancement'
import {
  createLevelSelectionState,
  filterPendingToScope,
  isCarriedFact,
  levelSelectionPools,
  recordShown,
  selectLevelFact,
  selectionGates,
  type LevelSelectionContext,
  type LevelSelectionState,
  type SelectionRngs,
} from './levelSelection'

/** One in-session reinforcement item (D2 step 2). */
export interface LevelQueueItem {
  factId: string
  kind: 'reintroduce' | 'later-check'
  /** Absolute question index at which the item becomes due. */
  dueAtIndex: number
  /** Questions this item has waited behind the success floor (max `floorQueueMaxWait`). */
  waited: number
}

export interface LevelPick {
  factId: string
  source: Extract<AttemptSource, 'draw' | 'reintroduce' | 'later-check'>
  /** Pool for draws; null for queue items. */
  pool: 'level' | 'review' | null
  likely: boolean
  carried: boolean
  /** Stage-1 status class for draws (latency-free); undefined for queue items. */
  stage1Status?: FactStatus
}

export interface LevelOrchestratorOptions {
  skill: MathSkill
  levelId: LevelId
  mode: SessionMode
  /** `main` drives stage 1, pool choice and queue delays; `fluency` drives stage 2 only. */
  rngs: SelectionRngs
  curriculum?: SkillCurriculum
}

function randDelay(rng: () => number, range: readonly number[]): number {
  const lo = range[0]!
  const hi = range[1]!
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/**
 * Level-scoped question orchestrator (D2 steps 1–6, P1/P2/P8). One instance per session.
 * Selects canonical fact IDs, asks the skill plugin for a question targeting exactly that
 * fact (D9), and owns the in-session reinforcement queue. Never generates questions itself.
 *
 * Usage per question: `nextQuestion(factEvidence)` → show → `recordAnswer(factId, source, correct)`.
 * `factEvidence` must be the evidence as of this question (after previous answers).
 */
export class LevelQuestionOrchestrator {
  readonly level: LevelDef
  readonly mode: SessionMode
  /** Current + earlier levels (queue scope). */
  readonly scope: ReadonlySet<string>
  private readonly skill: MathSkill
  private readonly rngs: SelectionRngs
  private readonly reviewIds: readonly string[]
  private readonly state: LevelSelectionState = createLevelSelectionState()
  private queue: LevelQueueItem[] = []
  /** State before the last selectNext, for discardLast (D3 hide). null once answered/discarded. */
  private lastSnapshot: { state: LevelSelectionState; queue: LevelQueueItem[] } | null = null

  constructor(options: LevelOrchestratorOptions) {
    const curriculum = options.curriculum ?? getCurriculum(options.skill.id)
    this.skill = options.skill
    this.mode = options.mode
    this.rngs = options.rngs
    this.level = getLevel(options.levelId, curriculum)
    this.reviewIds = reviewFactIds(options.levelId, curriculum)
    this.scope = scopeFactIds(options.levelId, curriculum)
  }

  /** Question index of the next question (= questions shown so far). */
  get index(): number {
    return this.state.questionsSoFar
  }

  /** Running counters (read-only view, tests/diagnostics). */
  get counters(): Readonly<LevelSelectionState> {
    return this.state
  }

  getScheduled(): readonly LevelQueueItem[] {
    return this.queue
  }

  /**
   * Seed carried-over reinforcement (relative delays). Items for facts outside current +
   * earlier levels are discarded (D2 step 2 / P8). Returns how many were dropped.
   */
  seedPending(pending: readonly PendingReinforcement[]): number {
    this.lastSnapshot = null
    const kept = filterPendingToScope(pending, this.scope)
    for (const p of kept) {
      this.queue.push({
        factId: p.factId,
        kind: p.kind,
        dueAtIndex: this.state.questionsSoFar + Math.max(0, p.dueInQuestions),
        waited: 0,
      })
    }
    this.sortQueue()
    return pending.length - kept.length
  }

  /** Remaining queue as relative delays for persistence (already in scope). */
  exportPending(): PendingReinforcement[] {
    return this.queue.map((e) => ({
      factId: e.factId,
      kind: e.kind,
      dueInQuestions: Math.max(0, e.dueAtIndex - this.state.questionsSoFar),
    }))
  }

  private context(factEvidence: Readonly<Record<string, FactEvidence>>): LevelSelectionContext {
    return {
      level: this.level,
      mode: this.mode,
      pools: levelSelectionPools(this.level, this.reviewIds, factEvidence),
      factEvidence,
      state: this.state,
    }
  }

  /** Choose the next fact (queue first, then a pool draw) and record it as shown. */
  selectNext(factEvidence: Readonly<Record<string, FactEvidence>>): LevelPick {
    this.lastSnapshot = {
      state: { ...this.state, recentFactIds: this.state.recentFactIds.slice() },
      queue: this.queue.map((i) => ({ ...i })),
    }
    const ctx = this.context(factEvidence)
    const gates = selectionGates(ctx)
    const q = this.state.questionsSoFar

    // Step 2: out-of-scope items are discarded (defensive; seeding already filters).
    this.queue = this.queue.filter((i) => this.scope.has(i.factId))

    let pick: LevelPick | null = null
    for (const item of this.queue.filter((i) => i.dueAtIndex <= q)) {
      const carried = isCarriedFact(ctx, item.factId)
      // Step 4: over the carried-hard cap the item waits in the queue.
      if (carried && gates.capReached) continue
      const likely = isLikelyCorrect(factEvidence[item.factId])
      // Step 5: a due non-likely item waits behind the floor, at most floorQueueMaxWait questions.
      if (gates.floorEnforced && !likely && item.waited < SPEC_CONSTANTS.floorQueueMaxWait) {
        item.waited += 1
        continue
      }
      this.queue.splice(this.queue.indexOf(item), 1)
      pick = { factId: item.factId, source: item.kind, pool: null, likely, carried }
      break
    }

    if (!pick) {
      const s = selectLevelFact(ctx, this.rngs)
      pick = {
        factId: s.factId,
        source: 'draw',
        pool: s.pool,
        likely: s.likely,
        carried: s.carried,
        stage1Status: s.stage1Status,
      }
    }

    recordShown(ctx, pick.factId)
    return pick
  }

  /** Select the next fact and have the plugin generate a question for exactly that fact (D9). */
  nextQuestion(factEvidence: Readonly<Record<string, FactEvidence>>): {
    question: Question
    pick: LevelPick
  } {
    const pick = this.selectNext(factEvidence)
    const question = this.skill.generateQuestion({
      skillId: this.skill.id,
      targetConcepts: [pick.factId],
      cognitiveDifficulty: 0.5,
    })
    const conceptId =
      this.skill.conceptIdFor?.(question) ??
      (typeof question.metadata?.factId === 'string' ? question.metadata.factId : null)
    if (conceptId !== pick.factId) {
      throw new Error(`Plugin did not honor target ${pick.factId} (got ${String(conceptId)})`)
    }
    return { question, pick }
  }

  /**
   * D3 / lead ruling 6b: the app was hidden while the last selected question was on screen.
   * Restores selection state exactly as if it had never been shown: counters, recent list
   * (the fact leaves the last-3 list), a consumed queue item (original dueAtIndex/waited)
   * and any `waited` increments made during that selection. RNG streams stay advanced;
   * nothing is logged. Only valid before `recordAnswer` for that question. Returns false
   * (no-op) when there is nothing to discard.
   */
  discardLast(): boolean {
    const snap = this.lastSnapshot
    if (!snap) return false
    Object.assign(this.state, snap.state)
    this.queue = snap.queue
    this.lastSnapshot = null
    return true
  }

  /** Schedule reinforcement: miss → reintroduce; correct reintroduce → later-check (no chaining). */
  recordAnswer(factId: string, source: AttemptSource, correct: boolean): void {
    this.lastSnapshot = null
    const now = this.state.questionsSoFar
    if (!correct) {
      this.queue = this.queue.filter((e) => !(e.factId === factId && e.kind === 'reintroduce'))
      this.queue.push({
        factId,
        kind: 'reintroduce',
        dueAtIndex: now + randDelay(this.rngs.main, RULES.reintroduceDelayRange),
        waited: 0,
      })
    } else if (source === 'reintroduce') {
      this.queue = this.queue.filter((e) => !(e.factId === factId && e.kind === 'later-check'))
      this.queue.push({
        factId,
        kind: 'later-check',
        dueAtIndex: now + randDelay(this.rngs.main, RULES.laterCheckDelayRange),
        waited: 0,
      })
    }
    this.sortQueue()
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => a.dueAtIndex - b.dueAtIndex)
  }
}
