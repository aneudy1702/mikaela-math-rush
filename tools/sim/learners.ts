// Learner models: P(correct) and latency per fact per attempt.
// Static learners: true p never changes. Learning learners: per-fact p improves with spaced practice and decays when unseen.
import type { Source } from './rules.ts'
import { ALL_FACTS, OWNER_LEVEL, factors, product } from './curriculum.ts'

export interface Learner {
  name: string
  /** True P(correct) for this fact right now. */
  p(factId: string): number
  latencyMs(factId: string, rng: () => number): number
  /** Called after every attempt so learning models can update. */
  onAttempt(factId: string, correct: boolean, counted: boolean, sessionId: number, source: Source): void
  /** Called once per day (= once per session in the sim) with the facts seen that day. */
  onDayEnd(seen: Set<string>): void
  clone(): Learner
}

function uniformLatency(lo: number, hi: number) {
  return (_f: string, rng: () => number) => lo + (hi - lo) * rng()
}

function staticLearner(name: string, p: (f: string) => number, latency: [number, number] = [2000, 4000]): Learner {
  const self: Learner = { name, p, latencyMs: uniformLatency(latency[0], latency[1]), onAttempt: () => {}, onDayEnd: () => {}, clone: () => self }
  return self
}

export function uniformLearner(p: number, latency: [number, number] = [2000, 4000], name = `uniform p=${p.toFixed(2)}`): Learner {
  return staticLearner(name, () => p, latency)
}

export const CLUSTER = new Set(['6x7', '6x8', '7x7', '7x8', '7x9', '8x8', '8x9'])

export function clusteredWeakLearner(): Learner {
  return staticLearner('clustered-weak', (f) => (CLUSTER.has(f) ? 0.5 : 0.9))
}

export function slowAccurateLearner(): Learner {
  return uniformLearner(0.9, [7000, 10000], 'slow-accurate p=0.90')
}

/** Rev-3 brief's "improving" model: p starts 0.55, +0.06 per counted correct attempt made in a different session than the previous rise, cap 0.97. */
export function improvingLearner(state?: { p: Map<string, number>; lastRise: Map<string, number> }): Learner {
  const pm = state ? new Map(state.p) : new Map<string, number>()
  const last = state ? new Map(state.lastRise) : new Map<string, number>()
  return {
    name: 'improving',
    p: (f) => pm.get(f) ?? 0.55,
    latencyMs: uniformLatency(2000, 4000),
    onAttempt(f, correct, counted, sessionId) {
      if (!correct || !counted) return
      if (last.get(f) === sessionId) return
      last.set(f, sessionId)
      pm.set(f, Math.min(0.97, (pm.get(f) ?? 0.55) + 0.06))
    },
    onDayEnd: () => {},
    clone: () => improvingLearner({ p: pm, lastRise: last }),
  }
}

/** Placement test learner: knows levels 1..k (p=0.95 on facts owned by those levels), 0.3 elsewhere. */
export function knowsUpToLearner(known: Set<string>): Learner {
  return staticLearner('knows-up-to', (f) => (known.has(f) ? 0.95 : 0.3))
}

// ---------------- Learning learners (owner follow-up §2) ----------------

export const LEARN_P_MAX = 0.97
export const FORGET_PER_DAY = 0.03

/** Default p0 by difficulty: ×1/×2/×10 → 0.85; ×5 → 0.75; others 0.65 → 0.45 linearly by product (9 → 81). */
export function defaultP0(f: string): number {
  const [a, b] = factors(f)
  const has = (x: number) => a === x || b === x
  if (has(1) || has(2) || has(10)) return 0.85
  if (has(5)) return 0.75
  const pr = product(f)
  return 0.65 - (0.2 * (pr - 9)) / (81 - 9)
}

export function p0Table(kind: 'default' | 'clustered' | 'start75'): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of ALL_FACTS) m.set(f, defaultP0(f))
  if (kind === 'clustered') for (const f of CLUSTER) m.set(f, 0.35)
  if (kind === 'start75') {
    const l14 = ALL_FACTS.filter((f) => (OWNER_LEVEL.get(f) ?? 99) <= 4)
    const meanL14 = l14.reduce((s, f) => s + m.get(f)!, 0) / l14.length
    const shift = 0.75 - meanL14
    for (const f of ALL_FACTS) m.set(f, Math.min(LEARN_P_MAX, Math.max(0.05, m.get(f)! + shift)))
  }
  return m
}

interface LearningState {
  p: Map<string, number>
  lastCountedSession: Map<string, number>
  reinforcedSession: Map<string, number>
  gainedSession: Map<string, number>
}

export function learningLearner(name: string, eta: number, p0: Map<string, number>, st?: LearningState): Learner {
  const s: LearningState = st
    ? { p: new Map(st.p), lastCountedSession: new Map(st.lastCountedSession), reinforcedSession: new Map(st.reinforcedSession), gainedSession: new Map(st.gainedSession) }
    : { p: new Map(p0), lastCountedSession: new Map(), reinforcedSession: new Map(), gainedSession: new Map() }
  const gain = (f: string, k: number) => {
    const p = s.p.get(f)!
    s.p.set(f, p + k * eta * (LEARN_P_MAX - p))
  }
  return {
    name,
    p: (f) => s.p.get(f)!,
    latencyMs: uniformLatency(2000, 4000),
    onAttempt(f, correct, counted, sessionId, source) {
      if (counted) {
        const prev = s.lastCountedSession.get(f)
        // Gain 1: counted correct attempt in a later session than the fact's previous counted attempt.
        if (correct && prev !== undefined && prev < sessionId && s.gainedSession.get(f) !== sessionId) {
          gain(f, 1)
          s.gainedSession.set(f, sessionId)
        }
        s.lastCountedSession.set(f, sessionId)
        return
      }
      // Gain 2: correct reinforcement item after a miss (non-counted by construction); at most once per fact per session,
      // and not on top of gain 1 in the same session.
      if (correct && (source === 'reintroduce' || source === 'later-check') && s.reinforcedSession.get(f) !== sessionId && s.gainedSession.get(f) !== sessionId) {
        gain(f, 0.4)
        s.reinforcedSession.set(f, sessionId)
      }
    },
    onDayEnd(seen) {
      for (const f of ALL_FACTS) {
        if (seen.has(f)) continue
        const base = p0.get(f)!
        const p = s.p.get(f)!
        if (p > base) s.p.set(f, Math.max(base, p - FORGET_PER_DAY * (p - base)))
      }
    },
    clone: () => learningLearner(name, eta, p0, s),
  }
}

export const ETA = { slow: 0.08, typical: 0.15, fast: 0.25 }

export type LearnerKind = 'static' | 'learning'

export interface LearnerSpec {
  key: string
  kind: LearnerKind
  make: () => Learner
}

export const UNIFORM_PS = [0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]

export const LEARNER_SPECS: LearnerSpec[] = [
  ...UNIFORM_PS.map((p) => ({ key: `u${p.toFixed(2)}`, kind: 'static' as const, make: () => uniformLearner(p) })),
  { key: 'clustered', kind: 'static', make: clusteredWeakLearner },
  { key: 'slow0.90', kind: 'static', make: slowAccurateLearner },
  { key: 'L-slow', kind: 'learning', make: () => learningLearner('learning slow', ETA.slow, p0Table('default')) },
  { key: 'L-typical', kind: 'learning', make: () => learningLearner('learning typical', ETA.typical, p0Table('default')) },
  { key: 'L-fast', kind: 'learning', make: () => learningLearner('learning fast', ETA.fast, p0Table('default')) },
  { key: 'L-clustered', kind: 'learning', make: () => learningLearner('learning clustered', ETA.typical, p0Table('clustered')) },
  { key: 'L-start75', kind: 'learning', make: () => learningLearner('learning start~75%', ETA.typical, p0Table('start75')) },
  { key: 'improving', kind: 'learning', make: () => improvingLearner() },
]

export function learnerLabel(key: string): string {
  if (key.startsWith('u')) return `uniform ${key.slice(1)}`
  if (key === 'slow0.90') return 'slow-accurate 0.90'
  if (key === 'clustered') return 'clustered-weak'
  if (key === 'improving') return 'improving (rev-3 brief model)'
  if (key.startsWith('L-')) return `learning ${key.slice(2)}`
  return key
}
