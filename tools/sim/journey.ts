// One learner's journey from L1 (no placement), 1 session per day, playing their progress level until L9 completes.
import type { Mode, Rules, Status } from './rules.ts'
import type { Learner } from './learners.ts'
import { ALL_FACTS, getLevel } from './curriculum.ts'
import { marks } from './status.ts'
import { newLearnerState, playSession, type LearnerState, type QuestionLog, type Rngs } from './session.ts'
import { evaluateMixedLevel, evaluateTableLevel } from './completion.ts'
import { xpForSession } from './xp.ts'

export type Pattern = 'quick' | 'practice' | 'mixed' | 'rush'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function makeRngs(seed: number): Rngs & { mode: () => number } {
  return {
    sel: mulberry32(hashSeed(seed, 'sel')),
    ans: mulberry32(hashSeed(seed, 'ans')),
    lat: mulberry32(hashSeed(seed, 'lat')),
    fluency: mulberry32(hashSeed(seed, 'fluency')),
    mode: mulberry32(hashSeed(seed, 'mode')),
  }
}

export function pickMode(pattern: Pattern, rng: () => number): Mode {
  if (pattern === 'mixed') return rng() < 0.7 ? 'quick' : 'practice'
  return pattern
}

/** D6 player level: XP to reach level L = 25·L·(L−1). */
export function playerLevel(xp: number): number {
  let L = 1
  while (25 * (L + 1) * L <= xp) L++
  return L
}

const STATUS_RANK: Record<Status, number> = { new: -1, struggling: 0, learning: 1, mastered: 2 }

/** Visible "moved up a status": struggling→learning, learning→mastered, new→mastered (new→learning is not). */
export function movedUp(before: Status, after: Status): boolean {
  if (before === 'new') return after === 'mastered'
  return STATUS_RANK[after] > STATUS_RANK[before]
}

export interface SessionRecord {
  levelId: number
  mode: Mode
  dayKey: number
  log: QuestionLog[]
  sessionsAtLevel: number
  pass: boolean
  recordEligible: boolean
}

export interface JourneyResult {
  /** sessions to complete each level 1..9 (index 0 unused); null = not reached; Infinity = censored at cap. */
  sessions: (number | null)[]
  cumulative: number
  /** Visible-progress event per session without marks (until the finish or censoring). */
  events: boolean[]
  /** Same, with D10 mark advancement also counted as visible progress. */
  eventsMarks: boolean[]
  records?: SessionRecord[]
}

export interface JourneyOpts {
  rules: Rules
  learner: Learner
  pattern: Pattern
  seed: number
  maxSessionsPerLevel?: number
  fluencyEnabled?: boolean
  keepRecords?: boolean
}

export function longestRun(events: boolean[]): number {
  let best = 0
  let cur = 0
  for (const e of events) {
    cur = e ? 0 : cur + 1
    if (cur > best) best = cur
  }
  return best
}

/** D10 session score over the current level's table facts: Σ (marks + 3×mastered). */
export function markScore(state: LearnerState, levelId: number, r: Rules): number {
  let s = 0
  for (const id of getLevel(levelId).tableFactIds) {
    const f = state.facts.get(id)!
    s += marks(f, r) + (f.status === 'mastered' ? r.marksMax : 0)
  }
  return s
}

export function runJourney(o: JourneyOpts): JourneyResult {
  const r = o.rules
  const cap = o.maxSessionsPerLevel ?? 60
  const rngs = makeRngs(o.seed)
  const state = newLearnerState()
  const learner = o.learner
  const res: JourneyResult = { sessions: Array(10).fill(null), cumulative: 0, events: [], eventsMarks: [], records: o.keepRecords ? [] : undefined }
  const best = new Map<string, number>()
  const finished = new Set<string>()
  const badges = new Set<string>()
  let recordsBeaten = 0
  let xpTotal = 0
  let day = 0
  let level = 1
  let at = 0

  while (level <= 9) {
    const lvl = getLevel(level)
    const statusBefore = ALL_FACTS.map((f) => state.facts.get(f)!.status)
    const gatingMastered = () => lvl.gatingFactIds.filter((f) => state.facts.get(f)!.status === 'mastered').length
    const gatingBefore = gatingMastered()
    const scoreBefore = markScore(state, level, r)

    const mode = pickMode(o.pattern, rngs.mode)
    day++
    const out = playSession({ state, learner, levelId: level, mode, rules: r, rngs, dayKey: day, fluencyEnabled: o.fluencyEnabled, keepLog: o.keepRecords })
    learner.onDayEnd(out.seen)
    at++

    const ev = state.evidence.get(level)!
    const pass = level < 9 ? evaluateTableLevel(level, state.facts, ev, at, r).pass : evaluateMixedLevel(state.facts, ev, r).pass
    if (res.records) res.records.push({ levelId: level, mode, dayKey: day, log: out.log, sessionsAtLevel: at, pass, recordEligible: out.recordEligible })

    // XP, records, badges → visible-progress events.
    const key = `${level}:${mode}`
    let recordBeaten = false
    if (out.recordEligible) {
      const b = best.get(key)
      if (b !== undefined && out.elapsedMs < b) recordBeaten = true
      if (b === undefined || out.elapsedMs < b) best.set(key, out.elapsedMs)
    }
    if (recordBeaten) recordsBeaten++
    const xp = xpForSession(
      { mode, levelCompletedBefore: false, isProgressLevel: true, correct: out.correct, perfect: out.perfect, firstFinishLevelMode: !finished.has(key), newlyMastered: out.newlyMastered, levelCompletedNow: pass, recordBeaten, recordXpAvailableToday: true },
      r,
    )
    finished.add(key)
    const lvBefore = playerLevel(xpTotal)
    xpTotal += xp.total
    let badge = false
    const award = (b: string, cond: boolean) => {
      if (cond && !badges.has(b)) {
        badges.add(b)
        badge = true
      }
    }
    award('first-run', true)
    award('hot-streak', out.longestStreak >= 10)
    award('on-fire', out.longestStreak >= 25)
    award('perfect', out.perfect)
    award('comeback', out.comeback)
    award('record-breaker', recordsBeaten >= 5)
    award('3-day', day >= 3)
    let up = false
    for (let i = 0; i < ALL_FACTS.length && !up; i++) if (movedUp(statusBefore[i]!, state.facts.get(ALL_FACTS[i]!)!.status)) up = true
    const event = gatingMastered() > gatingBefore || up || pass || badge || recordBeaten || playerLevel(xpTotal) > lvBefore
    res.events.push(event)
    res.eventsMarks.push(event || markScore(state, level, r) > scoreBefore)

    if (pass) {
      res.sessions[level] = at
      res.cumulative += at
      level++
      at = 0
    } else if (at >= cap) {
      res.sessions[level] = Infinity
      res.cumulative = Infinity
      break
    }
  }
  return res
}
