// D2 question selection, steps 1–7.
import type { Mode, Rules, Source } from './rules.ts'
import type { FactState } from './status.ts'
import { getLevel, reviewPool, scopeFacts, type LevelDef } from './curriculum.ts'

export type QueueKind = 'reintroduce' | 'later-check' | 'confirm'

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
  carriedHardDrawn: number
  queue: QueueItem[]
  confirmsScheduled: Map<string, number>
  missed: Set<string>
  rng: () => number
  /** Separate stream for the budget-neutral stage-2 (mastered-fact fluency) pick. */
  rngFluency: () => number
  slownessEnabled: boolean
  /** L9 capstone selection state (definition C); null otherwise. */
  capstone: CapstoneTrack | null
}

/** Per-journey L9 tracking: facts mastered / not mastered at L9 entry, and which prior-mastered facts have appeared. */
export interface CapstoneTrack {
  prev: string[]
  carried: string[]
  seen: Set<string>
}

export interface Pick {
  factId: string
  source: Source
  likely: boolean
  carriedHard: boolean
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
  slownessEnabled: boolean
  capstone?: CapstoneTrack | null
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
    carriedHardDrawn: 0,
    // Step 2: queue items for facts outside current + earlier levels are discarded. Leftover confirms never carry.
    queue: p.carriedQueue.filter((i) => scope.has(i.factId) && i.kind !== 'confirm').map((i) => ({ ...i, waited: 0 })),
    confirmsScheduled: new Map(),
    missed: new Set(),
    rng: p.rng,
    rngFluency: p.rngFluency,
    slownessEnabled: p.slownessEnabled,
    capstone: p.rules.simL9Mode === 'capstone' && p.levelId === 9 ? (p.capstone ?? null) : null,
  }
}

export function isCarried(ctx: SessionCtx, f: FactState): boolean {
  return ctx.reviewSet.has(f.id) && (f.status === 'learning' || f.status === 'struggling' || f.status === 'provisional')
}

export function isCarriedHard(ctx: SessionCtx, f: FactState): boolean {
  return ctx.reviewSet.has(f.id) && (f.status === 'learning' || f.status === 'struggling')
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

function latencyFactor(f: FactState, r: Rules): number {
  const m = median(f.correctLatencies)
  if (m <= r.slowness.fastMaxMs) return r.slowness.fast
  if (m > r.slowness.slowOverMs) return r.slowness.slow
  return r.slowness.mid
}

/** Slowness multiplier used in the single-stage weight (rev-3: non-mastered only; naive option 2: mastered only). */
export function slownessOf(f: FactState, r: Rules, enabled: boolean): number {
  if (!enabled || f.correctLatencies.length === 0) return 1.0
  if (r.simSlownessMode === 'rev3') return f.status === 'mastered' ? 1.0 : latencyFactor(f, r)
  if (r.simSlownessMode === 'mastered-naive') return f.status === 'mastered' ? latencyFactor(f, r) : 1.0
  return 1.0 // two-stage: stage 1 never uses latency
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

function weightedPick(ctx: SessionCtx, facts: Map<string, FactState>, cands: string[]): string {
  const r = ctx.rules
  const recent = ctx.recent.slice(-r.recentExcludeCount)
  let pool = cands.filter((c) => !recent.includes(c))
  if (pool.length === 0) pool = cands
  const w = pool.map((id) => {
    const f = facts.get(id)!
    return r.statusWeight[f.status] * slownessOf(f, r, ctx.slownessEnabled)
  })
  const chosen = pickByWeight(ctx.rng, pool, w)
  // Option 2 budget-neutral stage 2: a mastered pick is re-assigned among mastered candidates by fluency weight,
  // on its own RNG stream, so the mastered/unmastered split and all unmastered paths are latency-independent.
  if (r.simSlownessMode === 'mastered-two-stage' && facts.get(chosen)!.status === 'mastered') {
    const mastered = pool.filter((id) => facts.get(id)!.status === 'mastered')
    const mw = mastered.map((id) => {
      const f = facts.get(id)!
      return ctx.slownessEnabled && f.correctLatencies.length > 0 ? latencyFactor(f, r) : 1.0
    })
    return pickByWeight(ctx.rngFluency, mastered, mw)
  }
  return chosen
}

function introAllowed(ctx: SessionCtx): boolean {
  return ctx.introSet.size === 0 || ctx.introDrawn + 1 <= ctx.rules.introShareMaxL1 * (ctx.q + 1)
}

/** One question. Does not mutate facts; mutates ctx (queue, counters, recent). */
export function selectNext(ctx: SessionCtx, facts: Map<string, FactState>): Pick {
  const r = ctx.rules
  const capReached = ctx.carriedHardDrawn >= r.carriedHardCap[ctx.mode]
  const intro = introAllowed(ctx)
  const levelCands = intro ? ctx.levelPool : ctx.levelPool.filter((f) => !ctx.introSet.has(f))
  const reviewCands = capReached ? ctx.reviewPool.filter((id) => !isCarriedHard(ctx, facts.get(id)!)) : ctx.reviewPool

  // Step 5 (evaluated up front so it also governs the queue).
  const likelyLevel = levelCands.filter((id) => facts.get(id)!.likely)
  const likelyReview = reviewCands.filter((id) => facts.get(id)!.likely)
  const likelyAvailable = likelyLevel.length + likelyReview.length > 0
  const floorActive = ctx.q > 0 && ctx.likelyDrawn / ctx.q < r.successFloor
  const floorEnforced = floorActive && likelyAvailable

  let chosen: string | null = null
  let source: Source = 'draw'

  // Step 2: queue (subject to steps 4–5).
  const due = ctx.queue.filter((i) => i.due <= ctx.q).sort((a, b) => a.due - b.due)
  for (const item of due) {
    const f = facts.get(item.factId)!
    if (isCarriedHard(ctx, f) && capReached) continue // over cap: waits
    if (floorEnforced && !f.likely && item.waited < r.floorQueueMaxWait) {
      item.waited++
      continue
    }
    ctx.queue.splice(ctx.queue.indexOf(item), 1)
    chosen = item.factId
    source = item.kind
    break
  }

  if (chosen === null && ctx.capstone) {
    // L9 definition C: carried (not-yet-mastered-at-entry, still unmastered) facts get simCapstoneCarriedShare of pool
    // draws; the rest is a spread sample of prior-mastered facts (unseen at L9 first).
    const cap = ctx.capstone
    const carriedOpen = cap.carried.filter((id) => facts.get(id)!.status !== 'mastered')
    const unseen = cap.prev.filter((id) => !cap.seen.has(id))
    const prevPool = unseen.length > 0 ? unseen : cap.prev
    const u = ctx.rng()
    let pool = carriedOpen.length > 0 && (u < r.simCapstoneCarriedShare || prevPool.length === 0) ? carriedOpen : prevPool
    if (pool.length === 0) pool = ctx.levelPool
    if (floorEnforced) {
      const lk = pool.filter((id) => facts.get(id)!.likely)
      pool = lk.length > 0 ? lk : ctx.levelPool.filter((id) => facts.get(id)!.likely)
    }
    chosen = weightedPick(ctx, facts, pool)
  }

  if (chosen === null) {
    // Step 3: pool choice.
    const hasCarried = ctx.reviewPool.some((id) => isCarried(ctx, facts.get(id)!))
    const share = hasCarried ? r.reviewShareWithCarried : r.reviewShare
    const u = ctx.rng()
    const useReview = ctx.reviewPool.length > 0 && u < share
    if (floorEnforced) {
      const primary = useReview ? likelyReview : likelyLevel
      const other = useReview ? likelyLevel : likelyReview
      chosen = weightedPick(ctx, facts, primary.length > 0 ? primary : other)
    } else if (useReview) {
      chosen = weightedPick(ctx, facts, ctx.reviewPool)
      // Step 4: carried-hard over cap → draw from level pool instead.
      if (capReached && isCarriedHard(ctx, facts.get(chosen)!)) chosen = weightedPick(ctx, facts, levelCands)
    } else {
      chosen = weightedPick(ctx, facts, levelCands)
    }
  }

  const f = facts.get(chosen)!
  const pick: Pick = { factId: chosen, source, likely: f.likely, carriedHard: isCarriedHard(ctx, f), likelyAvailable }
  if (pick.likely) ctx.likelyDrawn++
  if (pick.carriedHard) ctx.carriedHardDrawn++
  if (ctx.introSet.has(chosen)) ctx.introDrawn++
  ctx.recent.push(chosen)
  if (ctx.recent.length > 8) ctx.recent.shift()
  return pick
}

function randInt(rng: () => number, [lo, hi]: [number, number]): number {
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** Queue scheduling after an answer (miss → reintroduce, correct reintroduce → later-check, step 7 confirm). */
export function scheduleAfterAnswer(ctx: SessionCtx, factId: string, source: Source, correct: boolean, counted: boolean, masteredBefore = false): void {
  const r = ctx.rules
  const next = ctx.q + 1
  if (!correct) {
    ctx.queue = ctx.queue.filter((i) => !(i.factId === factId && i.kind === 'reintroduce'))
    ctx.queue.push({ factId, kind: 'reintroduce', due: next + randInt(ctx.rng, r.reintroduceDelayRange), waited: 0 })
    return
  }
  if (source === 'reintroduce') {
    ctx.queue = ctx.queue.filter((i) => !(i.factId === factId && i.kind === 'later-check'))
    ctx.queue.push({ factId, kind: 'later-check', due: next + randInt(ctx.rng, r.laterCheckDelayRange), waited: 0 })
  }
  if (counted && ctx.mode !== 'quick' && r.provisionalEnabled && !(r.simConfirmNonMasteredOnly && masteredBefore)) {
    const n = ctx.confirmsScheduled.get(factId) ?? 0
    const pending = ctx.queue.some((i) => i.factId === factId && i.kind === 'confirm')
    if (n < r.confirmMaxPerFactPerSession && !pending) {
      const d = next + randInt(ctx.rng, r.confirmDelayRange)
      if (d < ctx.length) {
        ctx.queue.push({ factId, kind: 'confirm', due: d, waited: 0 })
        ctx.confirmsScheduled.set(factId, n + 1)
      }
    }
  }
}
