// D2 question selection (revision 4), steps 1–6: pools, queue, pool choice, carried-hard cap, success floor,
// two-stage budget-neutral pick.
import type { Mode, Rules, Source } from './rules.ts'
import type { FactState } from './status.ts'
import { getLevel, reviewPool, scopeFacts, type LevelDef } from './curriculum.ts'

export type QueueKind = 'reintroduce' | 'later-check'

export interface QueueItem {
  factId: string
  kind: QueueKind
  /** Question index at which the item becomes due. */
  due: number
  /** Questions waited behind the success floor this session. */
  waited: number
}

export interface SessionCtx {
  rules: Rules
  mode: Mode
  length: number
  level: LevelDef
  sessionId: number
  /** Index of the question about to be asked. */
  q: number
  levelPool: string[]
  reviewPool: string[]
  reviewSet: Set<string>
  introSet: Set<string>
  scope: Set<string>
  recent: string[]
  likelyDrawn: number
  introDrawn: number
  carriedDrawn: number
  queue: QueueItem[]
  missed: Set<string>
  rng: () => number
  /** Separate stream for the stage-2 (mastered-fact fluency) pick. */
  rngFluency: () => number
  /** Sim control: false forces every fluency weight to 1.0. */
  fluencyEnabled: boolean
}

export interface Pick {
  factId: string
  source: Source
  likely: boolean
  carried: boolean
  /** A likely candidate existed in the allowed pools at this question. */
  likelyAvailable: boolean
}

export function newSessionCtx(p: {
  rules: Rules
  mode: Mode
  levelId: number
  sessionId: number
  carriedQueue: QueueItem[]
  rng: () => number
  rngFluency: () => number
  fluencyEnabled: boolean
}): SessionCtx {
  const level = getLevel(p.levelId)
  const rp = reviewPool(p.levelId)
  const scope = scopeFacts(p.levelId)
  return {
    rules: p.rules,
    mode: p.mode,
    length: p.rules.sessionLength[p.mode],
    level,
    sessionId: p.sessionId,
    q: 0,
    levelPool: level.tableFactIds,
    reviewPool: rp,
    reviewSet: new Set(rp),
    introSet: new Set(level.id === 1 ? level.introFactIds : []),
    scope,
    recent: [],
    likelyDrawn: 0,
    introDrawn: 0,
    carriedDrawn: 0,
    // Step 2: queue items for facts outside current + earlier levels are discarded.
    queue: p.carriedQueue.filter((i) => scope.has(i.factId)).map((i) => ({ ...i, waited: 0 })),
    missed: new Set(),
    rng: p.rng,
    rngFluency: p.rngFluency,
    fluencyEnabled: p.fluencyEnabled,
  }
}

/** Carried = review facts with status learning or struggling (rev 4). */
export function isCarried(ctx: SessionCtx, f: FactState): boolean {
  return ctx.reviewSet.has(f.id) && (f.status === 'learning' || f.status === 'struggling')
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** fluencySlowness for a mastered fact (stage 2 only). */
export function fluencyWeight(f: FactState, r: Rules, enabled: boolean): number {
  if (!enabled || f.correctLatencies.length === 0) return 1.0
  const m = median(f.correctLatencies)
  if (m <= r.fluencySlowness.fastMaxMs) return r.fluencySlowness.fast
  if (m > r.fluencySlowness.slowOverMs) return r.fluencySlowness.slow
  return r.fluencySlowness.mid
}

function pickByWeight(rng: () => number, ids: string[], w: number[]): string {
  let total = 0
  for (const x of w) total += x
  let u = rng() * total
  for (let i = 0; i < ids.length; i++) {
    u -= w[i]!
    if (u < 0) return ids[i]!
  }
  return ids[ids.length - 1]!
}

/** Step 6: stage 1 by statusWeight (no latency); stage 2 re-picks among eligible mastered facts on its own stream. */
function twoStagePick(ctx: SessionCtx, facts: Map<string, FactState>, cands: string[]): string {
  const r = ctx.rules
  const recent = ctx.recent.slice(-r.recentExcludeCount)
  let pool = cands.filter((c) => !recent.includes(c))
  if (pool.length === 0) pool = cands
  const chosen = pickByWeight(ctx.rng, pool, pool.map((id) => r.statusWeight[facts.get(id)!.status]))
  if (facts.get(chosen)!.status !== 'mastered') return chosen
  const mastered = pool.filter((id) => facts.get(id)!.status === 'mastered')
  return pickByWeight(ctx.rngFluency, mastered, mastered.map((id) => fluencyWeight(facts.get(id)!, r, ctx.fluencyEnabled)))
}

function introAllowed(ctx: SessionCtx): boolean {
  return ctx.introSet.size === 0 || ctx.introDrawn + 1 <= ctx.rules.introShareMaxL1 * (ctx.q + 1)
}

/** One question. Does not mutate facts; mutates ctx (queue, counters, recent). */
export function selectNext(ctx: SessionCtx, facts: Map<string, FactState>): Pick {
  const r = ctx.rules
  const capReached = ctx.carriedDrawn >= r.carriedHardCap[ctx.mode]
  const levelCands = introAllowed(ctx) ? ctx.levelPool : ctx.levelPool.filter((f) => !ctx.introSet.has(f))
  const reviewCands = capReached ? ctx.reviewPool.filter((id) => !isCarried(ctx, facts.get(id)!)) : ctx.reviewPool

  // Step 5 (evaluated up front so it also governs the queue).
  const likelyLevel = levelCands.filter((id) => facts.get(id)!.likely)
  const likelyReview = reviewCands.filter((id) => facts.get(id)!.likely)
  const likelyAvailable = likelyLevel.length + likelyReview.length > 0
  const floorEnforced = ctx.q > 0 && ctx.likelyDrawn / ctx.q < r.successFloor && likelyAvailable

  let chosen: string | null = null
  let source: Source = 'draw'

  // Step 2: queue (subject to steps 4–5).
  const due = ctx.queue.filter((i) => i.due <= ctx.q).sort((a, b) => a.due - b.due)
  for (const item of due) {
    const f = facts.get(item.factId)!
    if (isCarried(ctx, f) && capReached) continue // over cap: waits
    if (floorEnforced && !f.likely && item.waited < r.floorQueueMaxWait) {
      item.waited++
      continue
    }
    ctx.queue.splice(ctx.queue.indexOf(item), 1)
    chosen = item.factId
    source = item.kind
    break
  }

  if (chosen === null) {
    // Step 3: pool choice.
    const hasCarried = ctx.reviewPool.some((id) => isCarried(ctx, facts.get(id)!))
    const share = hasCarried ? r.reviewShareWithCarried : r.reviewShare
    const useReview = ctx.reviewPool.length > 0 && ctx.rng() < share
    if (floorEnforced) {
      const primary = useReview ? likelyReview : likelyLevel
      chosen = twoStagePick(ctx, facts, primary.length > 0 ? primary : useReview ? likelyLevel : likelyReview)
    } else if (useReview) {
      chosen = twoStagePick(ctx, facts, ctx.reviewPool)
      // Step 4: carried over cap → redraw from the level pool.
      if (capReached && isCarried(ctx, facts.get(chosen)!)) chosen = twoStagePick(ctx, facts, levelCands)
    } else {
      chosen = twoStagePick(ctx, facts, levelCands)
    }
  }

  const f = facts.get(chosen)!
  const pick: Pick = { factId: chosen, source, likely: f.likely, carried: isCarried(ctx, f), likelyAvailable }
  if (pick.likely) ctx.likelyDrawn++
  if (pick.carried) ctx.carriedDrawn++
  if (ctx.introSet.has(chosen)) ctx.introDrawn++
  ctx.recent.push(chosen)
  if (ctx.recent.length > 8) ctx.recent.shift()
  return pick
}

function randInt(rng: () => number, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** Miss → reintroduce; correct reintroduce → later-check (no chaining). */
export function scheduleAfterAnswer(ctx: SessionCtx, factId: string, source: Source, correct: boolean): void {
  const r = ctx.rules
  const next = ctx.q + 1
  if (!correct) {
    ctx.queue = ctx.queue.filter((i) => !(i.factId === factId && i.kind === 'reintroduce'))
    ctx.queue.push({ factId, kind: 'reintroduce', due: next + randInt(ctx.rng, r.reintroduceDelayRange), waited: 0 })
  } else if (source === 'reintroduce') {
    ctx.queue = ctx.queue.filter((i) => !(i.factId === factId && i.kind === 'later-check'))
    ctx.queue.push({ factId, kind: 'later-check', due: next + randInt(ctx.rng, r.laterCheckDelayRange), waited: 0 })
  }
}
