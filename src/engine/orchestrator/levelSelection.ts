import type {
  FactEvidence,
  FactStatus,
  LevelDef,
  PendingReinforcement,
  SessionMode,
} from '../contracts'
import { RULES, SPEC_CONSTANTS } from '../contracts'
import { factStatus, isLikelyCorrect } from '../learning/advancement'

/**
 * D2 question selection (revision 4), steps 1 and 3–6, plus the step-2 scope filter.
 * Queue handling (step 2) lives in `LevelQuestionOrchestrator` (levelOrchestrator.ts),
 * which uses `selectionGates` so the carried-hard cap and success floor also govern it.
 *
 * Latency (D12): the only latency input anywhere in selection is `fluencySlownessWeight`,
 * read solely in stage 2 of the pick, on its own RNG stream. Stage 1 lumps every eligible
 * mastered fact into one block of weight `count × statusWeight.mastered`, so the main RNG
 * stream, the status class drawn and every unmastered draw are independent of latency.
 *
 * The legacy `selectNextFact` stays until T8.
 */

/** D2 step 1 pools for one level. */
export interface LevelPools {
  /** Table facts of the current level (L1 intro facts included, capped at draw time). */
  levelPool: string[]
  /** Facts owned by earlier levels, not in the table. */
  reviewPool: string[]
  /** Review facts with status learning or struggling. */
  carried: string[]
}

/** Per-session running counters the selection rules need (T5 may extend). */
export interface LevelSelectionState {
  /** Questions shown so far this session (queue items included) = index of the next question. */
  questionsSoFar: number
  /** Shown questions whose fact was likely-correct when shown. */
  likelyDrawn: number
  /** Shown questions whose fact was carried when shown (queue included). */
  carriedDrawn: number
  /** Shown questions whose fact is an L1 intro fact (queue included). */
  introDrawn: number
  /** Most recent fact IDs shown, newest last. */
  recentFactIds: string[]
}

export interface LevelSelectionContext {
  level: LevelDef
  mode: SessionMode
  pools: LevelPools
  factEvidence: Readonly<Record<string, FactEvidence>>
  state: LevelSelectionState
}

/** Two independent RNG streams: stage 2 (fluency) must not disturb stage 1 (D2 step 6). */
export interface SelectionRngs {
  main: () => number
  fluency: () => number
}

export interface LevelSelection {
  factId: string
  pool: 'level' | 'review'
  likely: boolean
  carried: boolean
  /** Status class drawn by stage 1 (latency-free). */
  stage1Status?: FactStatus
  /** Whether the success floor restricted this draw to likely candidates. */
  floorEnforced?: boolean
}

/** Keep this many recent IDs in `recentFactIds` (only the last `recentExcludeCount` are read). */
const RECENT_KEEP = 8

export function createLevelSelectionState(): LevelSelectionState {
  return {
    questionsSoFar: 0,
    likelyDrawn: 0,
    carriedDrawn: 0,
    introDrawn: 0,
    recentFactIds: [],
  }
}

/** D2 step 1: pools for a level given the current evidence. */
export function levelSelectionPools(
  level: LevelDef,
  reviewFactIds: readonly string[],
  factEvidence: Readonly<Record<string, FactEvidence>>,
): LevelPools {
  const table = new Set(level.tableFactIds)
  const reviewPool = reviewFactIds.filter((id) => !table.has(id))
  const carried = reviewPool.filter((id) => {
    const s = factStatus(factEvidence[id])
    return s === 'learning' || s === 'struggling'
  })
  return { levelPool: level.tableFactIds.slice(), reviewPool, carried }
}

/** D2 step 6 stage-2 weight for a mastered fact (RULES.fluencySlowness). Median of the last ≤ 4 correct latencies. */
export function fluencySlownessWeight(evidence: FactEvidence | undefined): number {
  const r = RULES.fluencySlowness
  const lat = evidence?.recentCorrectLatenciesMs ?? []
  if (lat.length === 0) return r.mid
  const s = lat.slice(-r.sampleSize).sort((a, b) => a - b)
  const m = s.length >> 1
  const median = s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
  if (median <= r.fastMaxMs) return r.fast
  if (median > r.slowOverMs) return r.slow
  return r.mid
}

/** D2 step 2 / P8: drop carried queue items for facts outside `scope` (current + earlier levels). */
export function filterPendingToScope(
  pending: readonly PendingReinforcement[],
  scope: ReadonlySet<string>,
): PendingReinforcement[] {
  return pending.filter((p) => scope.has(p.factId)).map((p) => ({ ...p }))
}

/** Gates shared by the queue (step 2) and pool draws (steps 3–5), evaluated once per question. */
export interface SelectionGates {
  /** Step 4: carried draws this session reached `carriedHardCap[mode]`. */
  capReached: boolean
  /** Level pool after the L1 intro running cap. */
  levelCands: string[]
  /** Review pool, minus carried facts once the cap is reached. */
  reviewCands: string[]
  likelyLevel: string[]
  likelyReview: string[]
  likelyAvailable: boolean
  /** Step 5: floor enforced for this question. */
  floorEnforced: boolean
}

function introAllowed(ctx: LevelSelectionContext): boolean {
  const intro = ctx.level.introFactIds
  if (intro.length === 0) return true
  // Running cap: after this draw, intro questions ≤ introShareMaxL1 · questions.
  // Lead ruling 6a (matches tools/sim/selection.ts): queue items (reintroduce/later-check)
  // for intro facts count toward `introDrawn` (see recordShown) but are never blocked by
  // this cap — it only filters pool draws.
  return ctx.state.introDrawn + 1 <= RULES.introShareMaxL1 * (ctx.state.questionsSoFar + 1)
}

export function isCarriedFact(ctx: LevelSelectionContext, factId: string): boolean {
  return ctx.pools.carried.includes(factId)
}

export function selectionGates(ctx: LevelSelectionContext): SelectionGates {
  const { state, pools, factEvidence } = ctx
  const capReached = state.carriedDrawn >= RULES.carriedHardCap[ctx.mode]
  const intro = new Set(ctx.level.introFactIds)
  const levelCands = introAllowed(ctx)
    ? pools.levelPool
    : pools.levelPool.filter((id) => !intro.has(id))
  const carried = new Set(pools.carried)
  const reviewCands = capReached
    ? pools.reviewPool.filter((id) => !carried.has(id))
    : pools.reviewPool
  const likelyLevel = levelCands.filter((id) => isLikelyCorrect(factEvidence[id]))
  const likelyReview = reviewCands.filter((id) => isLikelyCorrect(factEvidence[id]))
  const likelyAvailable = likelyLevel.length + likelyReview.length > 0
  const q = state.questionsSoFar
  const floorEnforced =
    q + 1 >= SPEC_CONSTANTS.floorFromQuestion &&
    q > 0 &&
    state.likelyDrawn / q < RULES.successFloor &&
    likelyAvailable
  return {
    capReached,
    levelCands,
    reviewCands,
    likelyLevel,
    likelyReview,
    likelyAvailable,
    floorEnforced,
  }
}

function pickByWeight<T>(rng: () => number, items: readonly T[], weights: readonly number[]): T {
  let total = 0
  for (const w of weights) total += w
  let u = rng() * total
  for (let i = 0; i < items.length; i++) {
    u -= weights[i]!
    if (u < 0) return items[i]!
  }
  return items[items.length - 1]!
}

const MASTERED_BLOCK = Symbol('mastered')

/**
 * D2 step 6 two-stage, budget-neutral pick. Stage 1 (main stream): weight statusWeight[status],
 * no latency, last `recentExcludeCount` facts excluded (all candidates if every one is recent).
 * Eligible mastered facts form one block, so stage 1 is identical to picking a mastered fact by
 * status weight and then discarding its identity. Stage 2 (fluency stream): only when the
 * mastered block is drawn, re-pick among the eligible mastered facts by fluencySlowness.
 */
export function twoStagePick(
  cands: readonly string[],
  factEvidence: Readonly<Record<string, FactEvidence>>,
  recentFactIds: readonly string[],
  rngs: SelectionRngs,
): { factId: string; stage1Status: FactStatus } {
  if (cands.length === 0) throw new Error('twoStagePick: no candidates')
  const recent = new Set(recentFactIds.slice(-SPEC_CONSTANTS.recentExcludeCount))
  let pool = cands.filter((id) => !recent.has(id))
  if (pool.length === 0) pool = cands.slice()

  const unmastered: string[] = []
  const unmasteredStatus: FactStatus[] = []
  const mastered: string[] = []
  for (const id of pool) {
    const s = factStatus(factEvidence[id])
    if (s === 'mastered') mastered.push(id)
    else {
      unmastered.push(id)
      unmasteredStatus.push(s)
    }
  }
  const items: (string | typeof MASTERED_BLOCK)[] = unmastered.slice()
  const weights = unmasteredStatus.map((s) => RULES.statusWeight[s])
  if (mastered.length > 0) {
    items.push(MASTERED_BLOCK)
    weights.push(mastered.length * RULES.statusWeight.mastered)
  }
  const stage1 = pickByWeight(rngs.main, items, weights)
  if (stage1 !== MASTERED_BLOCK) {
    return { factId: stage1, stage1Status: factStatus(factEvidence[stage1]) }
  }
  const factId = pickByWeight(
    rngs.fluency,
    mastered,
    mastered.map((id) => fluencySlownessWeight(factEvidence[id])),
  )
  return { factId, stage1Status: 'mastered' }
}

/**
 * D2 steps 3–6 for a pool draw (queue handling lives in the orchestrator). Pure: does not
 * mutate `ctx`; call `recordShown` after the question is shown.
 */
export function selectLevelFact(
  ctx: LevelSelectionContext,
  rngs: SelectionRngs,
): LevelSelection {
  const { pools, factEvidence, state } = ctx
  const gates = selectionGates(ctx)

  // Step 3: pool choice.
  const share =
    pools.carried.length > 0 ? RULES.reviewShareWithCarried : RULES.reviewShare
  const useReview = pools.reviewPool.length > 0 && rngs.main() < share

  let pool: 'level' | 'review'
  let pick: { factId: string; stage1Status: FactStatus }
  if (gates.floorEnforced) {
    // Step 5: restrict to likely candidates, chosen pool first, else the other.
    const primary = useReview ? gates.likelyReview : gates.likelyLevel
    const other = useReview ? gates.likelyLevel : gates.likelyReview
    const usePrimary = primary.length > 0
    pool = usePrimary === useReview ? 'review' : 'level'
    pick = twoStagePick(usePrimary ? primary : other, factEvidence, state.recentFactIds, rngs)
  } else if (useReview) {
    pool = 'review'
    pick = twoStagePick(pools.reviewPool, factEvidence, state.recentFactIds, rngs)
    // Step 4: a carried pick over the cap is redrawn from the level pool.
    if (gates.capReached && isCarriedFact(ctx, pick.factId)) {
      // The level pool is never empty for a real level (every table has gating facts and
      // the intro cap only removes ×1 facts), so this is unreachable today. Defensive
      // fallback that still respects the cap: non-carried review facts. Only if both are
      // empty does twoStagePick throw ('no candidates').
      if (gates.levelCands.length > 0) {
        pool = 'level'
        pick = twoStagePick(gates.levelCands, factEvidence, state.recentFactIds, rngs)
      } else {
        pick = twoStagePick(gates.reviewCands, factEvidence, state.recentFactIds, rngs)
      }
    }
  } else {
    pool = 'level'
    pick = twoStagePick(gates.levelCands, factEvidence, state.recentFactIds, rngs)
  }

  return {
    factId: pick.factId,
    pool,
    likely: isLikelyCorrect(factEvidence[pick.factId]),
    carried: isCarriedFact(ctx, pick.factId),
    stage1Status: pick.stage1Status,
    floorEnforced: gates.floorEnforced,
  }
}

/** Update the running counters after a question (pool draw or queue item) is shown. */
export function recordShown(ctx: LevelSelectionContext, factId: string): void {
  const s = ctx.state
  if (isLikelyCorrect(ctx.factEvidence[factId])) s.likelyDrawn += 1
  if (isCarriedFact(ctx, factId)) s.carriedDrawn += 1
  if (ctx.level.introFactIds.includes(factId)) s.introDrawn += 1
  s.recentFactIds.push(factId)
  if (s.recentFactIds.length > RECENT_KEEP) s.recentFactIds.shift()
  s.questionsSoFar += 1
}
