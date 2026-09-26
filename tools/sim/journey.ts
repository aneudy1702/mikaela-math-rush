// One learner's journey from L1 (no placement), 1 session per day, playing their progress level until L9 completes.
import type { Mode, Rules, Status } from './rules.ts'
import type { Learner } from './learners.ts'
import { ALL_FACTS, getLevel } from './curriculum.ts'
import { newLearnerState, playSession, type L9Track, type LearnerState, type QuestionLog, type Rngs, type SessionOutcome } from './session.ts'
import { evaluateMixedLevel, evaluateTableLevel, type TableEval } from './completion.ts'
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

const EMPTY_SET: Set<string> = new Set()

const STATUS_RANK: Record<Status, number> = { new: -1, struggling: 0, learning: 1, provisional: 2, mastered: 3 }

/** Visible "moved up a status": struggling→learning, learning→provisional/mastered, provisional→mastered (new→provisional/mastered included; new→learning is not). */
export function movedUp(before: Status, after: Status): boolean {
  if (before === 'new') return after === 'provisional' || after === 'mastered'
  return STATUS_RANK[after] > STATUS_RANK[before]
}

export interface LevelUpStats {
  masteredShare: number
  provisionalShare: number
  strugglingTable: number
  strugglingAll: number
}

export interface R4Stats {
  checks: number
  r4Flips: number
  soleBlocker: number
  bounceBlocked: number
}

export interface SessionRecord {
  levelId: number
  mode: Mode
  dayKey: number
  log: QuestionLog[]
  sessionsAtLevel: number
  tablePass: boolean | null
  mixedPass: Record<string, boolean> | null
  recordEligible: boolean
}

/** Per-definition L9 outcome: first passing L9 session, previously-mastered facts re-tested by then, longest drought within L9. */
export interface L9DefResult {
  first: number | null
  retested: number
  drought: number
}

export interface JourneyResult {
  /** sessions to complete each level 1..9 (index 0 unused); null = not reached; Infinity = censored at cap. */
  sessions: (number | null)[]
  cumulative: number
  l9First: Record<string, number | null>
  l9Defs: Record<string, L9DefResult>
  l9PrevMastered: number
  firstSessionProgress: (number | null)[]
  levelUp: (LevelUpStats | null)[]
  r4: R4Stats[]
  provisionalAtLevelUp: number
  provisionalRevoked: number
  provisionalConfirmed: number
  sessionOutcomes: SessionOutcome[]
  /** Visible-progress event per session (until the official finish or censoring). */
  events: boolean[]
  longestDrought: number
  records?: SessionRecord[]
  checkpoint?: { state: LearnerState; learner: Learner; levelId: number }
}

export interface JourneyOpts {
  rules: Rules
  learner: Learner
  pattern: Pattern
  seed: number
  maxSessionsPerLevel?: number
  l9Thresholds?: number[]
  slownessEnabled?: boolean
  keepRecords?: boolean
  keepSessionOutcomes?: boolean
  /** Capture a deep copy of state when entering this level (for XP replay comparisons). */
  checkpointAtLevel?: number
  cloneForCheckpoint?: (s: LearnerState) => LearnerState
  stopAtCheckpoint?: boolean
  onSessionEnd?: (sessionIndex: number, state: LearnerState, learner: Learner) => void
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

function upCount(before: Status[], state: LearnerState): boolean {
  for (let i = 0; i < ALL_FACTS.length; i++) if (movedUp(before[i]!, state.facts.get(ALL_FACTS[i]!)!.status)) return true
  return false
}

export function runJourney(o: JourneyOpts): JourneyResult {
  const r = o.rules
  const cap = o.maxSessionsPerLevel ?? 60
  const thresholds = [...new Set([...(o.l9Thresholds ?? []), r.mixedAccuracyMin])]
  const capstone = r.simL9Mode === 'capstone'
  // L9 definitions evaluated each L9 session. Official = the one this rule set uses to complete L9.
  const defs: string[] = capstone
    ? [...new Set([r.simCapstoneRetentionMin, 0.8])].flatMap((t) => [`C@${t.toFixed(2)}`, `Cr@${t.toFixed(2)}`])
    : thresholds.flatMap((t) => [`A@${t.toFixed(2)}`, `B@${t.toFixed(2)}`])
  const official = capstone ? `C@${r.simCapstoneRetentionMin.toFixed(2)}` : `B@${r.mixedAccuracyMin.toFixed(2)}`
  const rngs = makeRngs(o.seed)
  const state = newLearnerState()
  const learner = o.learner
  const res: JourneyResult = {
    sessions: Array(10).fill(null),
    cumulative: 0,
    l9First: Object.fromEntries(thresholds.map((t) => [t.toFixed(2), null])),
    l9Defs: Object.fromEntries(defs.map((d) => [d, { first: null, retested: 0, drought: 0 }])),
    l9PrevMastered: 0,
    firstSessionProgress: Array(10).fill(null),
    levelUp: Array(10).fill(null),
    r4: Array.from({ length: 10 }, () => ({ checks: 0, r4Flips: 0, soleBlocker: 0, bounceBlocked: 0 })),
    provisionalAtLevelUp: 0,
    provisionalRevoked: 0,
    provisionalConfirmed: 0,
    sessionOutcomes: [],
    events: [],
    longestDrought: 0,
    records: o.keepRecords ? [] : undefined,
  }
  const pendingProv: { id: string; after: number }[] = []
  const best = new Map<string, number>()
  const finished = new Set<string>()
  const badges = new Set<string>()
  let recordsBeaten = 0
  let xpTotal = 0
  let officialDone = false
  let day = 0
  let level = 1
  let at = 0
  let prevR4: boolean | null = null
  let r4EverPassed = false
  let l9: L9Track | null = null
  const l9Events: boolean[] = []
  const l9Retested: number[] = []

  while (level <= 9) {
    if (at === 0 && o.checkpointAtLevel === level && o.cloneForCheckpoint) {
      res.checkpoint = { state: o.cloneForCheckpoint(state), learner: learner.clone(), levelId: level }
      if (o.stopAtCheckpoint) return res
    }
    if (level === 9 && l9 === null) {
      const prev = ALL_FACTS.filter((f) => state.facts.get(f)!.status === 'mastered')
      const prevSet = new Set(prev)
      l9 = { prev, carried: ALL_FACTS.filter((f) => !prevSet.has(f)), seen: new Set(), firstAppearances: [], prevAnswers: [], carriedCorrect: new Set() }
      res.l9PrevMastered = prev.length
    }
    const lvl = getLevel(level)
    const statusBefore = ALL_FACTS.map((f) => state.facts.get(f)!.status)
    const gatingMP = () =>
      lvl.gatingFactIds.filter((f) => {
        const s = state.facts.get(f)!.status
        return s === 'mastered' || s === 'provisional'
      }).length
    const gatingBefore = gatingMP()

    const mode = pickMode(o.pattern, rngs.mode)
    day++
    const out = playSession({ state, learner, levelId: level, mode, rules: r, rngs, dayKey: day, slownessEnabled: o.slownessEnabled, keepLog: o.keepRecords, l9 })
    learner.onDayEnd(out.seen)
    out.seen = EMPTY_SET
    at++
    const log = out.log
    out.log = []
    if (o.keepSessionOutcomes !== false) res.sessionOutcomes.push(out)
    // Provisional revocation tracking: first counted attempt in a later session.
    for (let i = pendingProv.length - 1; i >= 0; i--) {
      const pp = pendingProv[i]!
      const first = state.facts.get(pp.id)!.counted.find((a) => a.sessionId > pp.after)
      if (first) {
        if (first.correct) res.provisionalConfirmed++
        else res.provisionalRevoked++
        pendingProv.splice(i, 1)
      }
    }

    let levelCompletedNow = false
    let tableEval: TableEval | null = null
    let mixedPass: Record<string, boolean> | null = null
    if (level < 9) {
      tableEval = evaluateTableLevel(level, state.facts, state.levelAnswers.get(level)!, at, r)
      const st = res.r4[level]!
      st.checks++
      if (prevR4 === true && !tableEval.r4) st.r4Flips++
      if (tableEval.r1 && tableEval.r2 && tableEval.r3 && tableEval.r5 && !tableEval.r4) {
        st.soleBlocker++
        if (r4EverPassed) st.bounceBlocked++
      }
      if (tableEval.r4) r4EverPassed = true
      prevR4 = tableEval.r4
      if (at === 1) res.firstSessionProgress[level] = gatingMP()
      levelCompletedNow = tableEval.pass
    } else {
      mixedPass = {}
      const answers = state.levelAnswers.get(9)!
      const noStruggleCap: Rules = { ...r, mixedMaxStruggling: Infinity }
      for (const t of thresholds) {
        const b = evaluateMixedLevel(state.facts, answers, r, t).pass
        mixedPass[t.toFixed(2)] = b
        if (b && res.l9First[t.toFixed(2)] === null) res.l9First[t.toFixed(2)] = at
      }
      const passNow: Record<string, boolean> = {}
      if (capstone) {
        const track = l9!
        const fa = track.firstAppearances
        const faAcc = fa.length ? fa.filter(Boolean).length / fa.length : 0
        const carriedOk = track.carried.every((f) => {
          const s = state.facts.get(f)!.status
          return (s === 'learning' || s === 'provisional' || s === 'mastered') && track.carriedCorrect.has(f)
        })
        // Strict: ≥ simCapstoneMinFirstAppearances first appearances (unreachable if fewer facts were mastered at L9 entry).
        const enoughFa = fa.length >= r.simCapstoneMinFirstAppearances
        const base = at >= r.simCapstoneMinSessions && at >= r.simCapstoneMinDays && enoughFa && carriedOk
        // Sim-only C-rolling: retention = last simCapstoneMinFirstAppearances answers on prior-mastered facts (any appearance).
        const pa = track.prevAnswers
        const recent = pa.slice(Math.max(0, pa.length - r.simCapstoneMinFirstAppearances))
        const rollAcc = recent.length ? recent.filter(Boolean).length / recent.length : 0
        const baseRoll = at >= r.simCapstoneMinSessions && at >= r.simCapstoneMinDays && pa.length >= r.simCapstoneMinFirstAppearances && carriedOk
        for (const d of defs) {
          const thr = Number(d.split('@')[1])
          passNow[d] = d.startsWith('Cr') ? baseRoll && rollAcc >= thr : base && faAcc >= thr
        }
      } else {
        for (const t of thresholds) {
          passNow[`A@${t.toFixed(2)}`] = evaluateMixedLevel(state.facts, answers, noStruggleCap, t).pass
          passNow[`B@${t.toFixed(2)}`] = mixedPass[t.toFixed(2)]!
        }
      }
      l9Retested.push(l9!.seen.size)
      for (const d of defs) {
        const dr = res.l9Defs[d]!
        if (passNow[d] && dr.first === null) dr.first = at
      }
      levelCompletedNow = !officialDone && res.l9Defs[official]!.first === at
    }

    if (res.records) {
      res.records.push({ levelId: level, mode, dayKey: day, log, sessionsAtLevel: at, tablePass: tableEval ? tableEval.pass : null, mixedPass, recordEligible: out.recordEligible })
    }

    // XP, records, badges, visible-progress events (until the official finish).
    if (!officialDone) {
      const key = `${level}:${mode}`
      let recordBeaten = false
      if (out.recordEligible) {
        const b = best.get(key)
        if (b !== undefined && out.elapsedMs < b) recordBeaten = true
        if (b === undefined || out.elapsedMs < b) best.set(key, out.elapsedMs)
      }
      if (recordBeaten) recordsBeaten++
      const xp = xpForSession(
        {
          mode,
          levelCompletedBefore: false,
          isProgressLevel: true,
          correct: out.correct,
          perfect: out.perfect,
          firstFinishLevelMode: !finished.has(key),
          newlyMastered: out.newlyMastered,
          levelCompletedNow,
          recordBeaten,
          recordXpAvailableToday: true,
        },
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
      const event = gatingMP() > gatingBefore || upCount(statusBefore, state) || levelCompletedNow || badge || recordBeaten || playerLevel(xpTotal) > lvBefore
      res.events.push(event)
      if (level === 9) l9Events.push(event)
    } else if (level === 9) {
      // After the official finish, other L9 definitions keep being evaluated; events = status moves only.
      l9Events.push(upCount(statusBefore, state))
    }

    o.onSessionEnd?.(state.sessionCount, state, learner)

    if (level < 9) {
      if (levelCompletedNow) {
        res.sessions[level] = at
        res.cumulative += at
        const n = lvl.gatingFactIds.length
        let m = 0
        let p = 0
        for (const id of lvl.gatingFactIds) {
          const s = state.facts.get(id)!.status
          if (s === 'mastered') m++
          if (s === 'provisional') {
            p++
            pendingProv.push({ id, after: out.sessionId })
          }
        }
        res.provisionalAtLevelUp += p
        let sT = 0
        for (const id of lvl.tableFactIds) if (state.facts.get(id)!.status === 'struggling') sT++
        let sA = 0
        for (const id of ALL_FACTS) if (state.facts.get(id)!.status === 'struggling') sA++
        res.levelUp[level] = { masteredShare: m / n, provisionalShare: p / n, strugglingTable: sT, strugglingAll: sA }
        level++
        at = 0
        prevR4 = null
        r4EverPassed = false
      } else if (at >= cap) {
        res.sessions[level] = Infinity
        res.cumulative = Infinity
        break
      }
    } else {
      if (levelCompletedNow) {
        res.sessions[9] = at
        res.cumulative += at
        officialDone = true
      }
      const allDone = defs.every((d) => res.l9Defs[d]!.first !== null) && (capstone || thresholds.every((t) => res.l9First[t.toFixed(2)] !== null))
      if (allDone || at >= cap) {
        if (res.sessions[9] === null) {
          res.sessions[9] = Infinity
          res.cumulative = Infinity
        }
        break
      }
    }
  }
  // Per-definition L9 stats (the completing session counts as a visible event: level-up).
  for (const d of defs) {
    const dr = res.l9Defs[d]!
    const upto = dr.first ?? l9Events.length
    const ev = l9Events.slice(0, upto)
    if (dr.first !== null && ev.length) ev[ev.length - 1] = true
    dr.drought = longestRun(ev)
    dr.retested = upto > 0 ? (l9Retested[upto - 1] ?? 0) : 0
  }
  res.longestDrought = longestRun(res.events)
  return res
}
