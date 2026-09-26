/**
 * Test helpers for level-scoped selection (T5). Not part of the engine API.
 */
import type { FactEvidence, FactStatus, RawAttempt, SessionMode } from '../contracts'
import { SESSION_LENGTHS } from '../contracts'
import { getCurriculum } from '../curriculum'
import { applyAttemptToEvidence, emptyFactEvidence, factStatus } from '../learning/advancement'
import { createMultiplicationSkill } from '../content/multiplication'
import { LevelQuestionOrchestrator, type LevelPick } from './levelOrchestrator'
import type { PendingReinforcement } from '../contracts'

/** Deterministic PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const ALL_CORE_IDS: string[] = getCurriculum().levels[8]!.tableFactIds.slice()

function attempt(
  factId: string,
  correct: boolean,
  sessionId: string,
  latencyMs: number,
  atMs: number,
): RawAttempt {
  return {
    factId,
    a: null,
    b: null,
    correct,
    given: null,
    latencyMs,
    atMs,
    sessionId,
    sessionInferred: false,
    levelId: null,
    mode: null,
    source: 'draw',
    isReplay: false,
  }
}

/** Evidence with a given status. `latencyMs` feeds recentCorrectLatenciesMs only. */
export function evidenceWith(
  factId: string,
  status: FactStatus | 'learning-likely' | 'learning-unlikely',
  latencyMs = 2000,
): FactEvidence {
  const patterns: Record<string, [boolean, string][]> = {
    new: [],
    mastered: [
      [true, 'p1'],
      [true, 'p2'],
    ],
    learning: [
      [true, 'p1'],
      [true, 'p1'],
    ],
    'learning-likely': [
      [true, 'p1'],
      [true, 'p1'],
    ],
    'learning-unlikely': [
      [false, 'p1'],
      [true, 'p2'],
    ],
    struggling: [
      [false, 'p1'],
      [false, 'p1'],
      [false, 'p2'],
    ],
  }
  let ev = emptyFactEvidence(factId)
  let t = 1
  for (const [correct, sid] of patterns[status]!) {
    ev = applyAttemptToEvidence(ev, attempt(factId, correct, sid, latencyMs, t++), true)
  }
  return ev
}

export function evidenceMap(
  assign: (factId: string) => FactStatus | 'learning-likely' | 'learning-unlikely',
  latency: (factId: string) => number = () => 2000,
): Record<string, FactEvidence> {
  const out: Record<string, FactEvidence> = {}
  for (const id of ALL_CORE_IDS) out[id] = evidenceWith(id, assign(id), latency(id))
  return out
}

export interface Shown extends LevelPick {
  session: number
  q: number
  correct: boolean
  /** Counters before this question. */
  before: { q: number; likelyDrawn: number; carriedDrawn: number; introDrawn: number; recent: string[] }
}

export interface Learner {
  /** Correctness of this answer. `u` is a per-question uniform draw on the learner's own stream. */
  correct(factId: string, status: FactStatus, u: number): boolean
  latencyMs(factId: string, u: number): number
}

/**
 * Run sessions at one level with a simulated learner, updating evidence like the engine
 * would (counted = no earlier miss of the fact in this session). Queue carry-over between
 * sessions via exportPending/seedPending, plus optional extra seeded pending per session.
 */
export function runSessions(p: {
  levelId: string
  mode: SessionMode
  sessions: number
  seed: number
  learner: Learner
  evidence: Record<string, FactEvidence>
  extraPending?: (session: number) => PendingReinforcement[]
  onSeed?: (dropped: number, session: number) => void
}): { shown: Shown[]; evidence: Record<string, FactEvidence> } {
  const main = seeded(p.seed)
  const fluency = seeded(p.seed ^ 0x5bd1e995)
  const answers = seeded(p.seed * 7 + 3)
  const lat = seeded(p.seed * 13 + 5)
  const skill = createMultiplicationSkill(seeded(p.seed + 99))
  const evidence = { ...p.evidence }
  const shown: Shown[] = []
  let pending: PendingReinforcement[] = []
  let t = 1_000_000
  for (let s = 0; s < p.sessions; s++) {
    const orch = new LevelQuestionOrchestrator({
      skill,
      levelId: p.levelId,
      mode: p.mode,
      rngs: { main, fluency },
    })
    const dropped = orch.seedPending([...pending, ...(p.extraPending?.(s) ?? [])])
    p.onSeed?.(dropped, s)
    const missed = new Set<string>()
    const sessionId = `s${s}`
    for (let q = 0; q < SESSION_LENGTHS[p.mode]; q++) {
      const c = orch.counters
      const before = {
        q: c.questionsSoFar,
        likelyDrawn: c.likelyDrawn,
        carriedDrawn: c.carriedDrawn,
        introDrawn: c.introDrawn,
        recent: c.recentFactIds.slice(),
      }
      const { question, pick } = orch.nextQuestion(evidence)
      if (question.metadata?.factId !== pick.factId) throw new Error('target not honored')
      const status = factStatus(evidence[pick.factId])
      const correct = p.learner.correct(pick.factId, status, answers())
      const latencyMs = p.learner.latencyMs(pick.factId, lat())
      const counted = !missed.has(pick.factId)
      if (!correct) missed.add(pick.factId)
      const ev = evidence[pick.factId] ?? emptyFactEvidence(pick.factId)
      evidence[pick.factId] = applyAttemptToEvidence(
        ev,
        { ...attempt(pick.factId, correct, sessionId, latencyMs, t++), source: pick.source },
        counted,
      )
      orch.recordAnswer(pick.factId, pick.source, correct)
      shown.push({ ...pick, session: s, q, correct, before })
    }
    pending = orch.exportPending()
  }
  return { shown, evidence }
}

export function uniformLearner(pCorrect: number, latency: [number, number] = [1500, 3000]): Learner {
  return {
    correct: (_f, _s, u) => u < pCorrect,
    latencyMs: (_f, u) => latency[0] + u * (latency[1] - latency[0]),
  }
}
