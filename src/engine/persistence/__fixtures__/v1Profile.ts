/**
 * Realistic V1 profile fixture (test-only): built with the real V1 mastery code so
 * records look exactly like what the shipped app persisted under learner-v1.
 */

import type {
  FactAttempt,
  FactRecord,
  LearnerProfileV1,
} from '../../contracts'
import { CORE_FACTS } from '../../content/multiplication'
import { applyAttempt, emptyFactRecord } from '../../learning/mastery'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** 2026-09-01 15:00 UTC. */
export const FIXTURE_T0 = Date.UTC(2026, 8, 1, 15, 0, 0)

const ROTATION = [
  '2x3', '2x7', '3x4', '5x6', '6x7', '7x8', '8x9', '4x6', '3x9', '2x9',
  '1x5', '2x2', '6x6', '4x8', '5x5', '9x9', '3x7', '2x8',
]

export interface ScriptedAttempt {
  key: string
  atMs: number
  correct: boolean
  latencyMs: number
}

function block(
  startMs: number,
  count: number,
  stepMs: number,
  offset: number,
): ScriptedAttempt[] {
  const out: ScriptedAttempt[] = []
  for (let i = 0; i < count; i++) {
    const k = offset + i
    out.push({
      key: ROTATION[k % ROTATION.length]!,
      atMs: startMs + i * stepMs,
      correct: k % 5 !== 3,
      latencyMs: 1200 + ((k * 737) % 4500),
    })
  }
  return out
}

/**
 * Play history with known session boundaries under the 30-minute gap rule:
 * - A: 25 answers, 6 s apart.
 * - B: starts exactly 30 min after A's last answer (gap = 30 min → new session).
 * - B continues: a chunk 29 min 59 s after B's last answer (same session).
 * - C: next day. D: 2 h after C (new session).
 */
export function fixtureScript(): { attempts: ScriptedAttempt[]; sessions: number[][] } {
  const a = block(FIXTURE_T0, 25, 6_000, 0)
  const aEnd = a[a.length - 1]!.atMs
  const b1 = block(aEnd + 30 * MIN, 12, 5_000, 25)
  const b1End = b1[b1.length - 1]!.atMs
  const b2 = block(b1End + 30 * MIN - 1_000, 13, 5_000, 37)
  const c = block(FIXTURE_T0 + DAY, 40, 4_000, 50)
  const cEnd = c[c.length - 1]!.atMs
  const d = block(cEnd + 2 * HOUR, 30, 4_000, 90)
  const all = [...a, ...b1, ...b2, ...c, ...d]
  const idx = (xs: ScriptedAttempt[]) => xs.map((x) => all.indexOf(x))
  return {
    attempts: all,
    sessions: [idx(a), idx([...b1, ...b2]), idx(c), idx(d)],
  }
}

/** Build a V1 profile from the script, plus stray non-canonical keys. */
export function buildV1Fixture(): LearnerProfileV1 {
  const facts: Record<string, FactRecord> = {}
  for (const f of CORE_FACTS) facts[f.factId] = emptyFactRecord(f.factId)

  for (const s of fixtureScript().attempts) {
    const attempt: FactAttempt = {
      correct: s.correct,
      latencyMs: s.latencyMs,
      atMs: s.atMs,
    }
    facts[s.key] = applyAttempt(facts[s.key] ?? emptyFactRecord(s.key), attempt)
  }

  // Stray keys an older build could have written (D9: must be merged into 7x8).
  const cStart = FIXTURE_T0 + DAY
  let stray = emptyFactRecord('8x7')
  for (const [i, correct] of [true, false, true].entries()) {
    stray = applyAttempt(stray, {
      correct,
      latencyMs: 3000 + i * 100,
      atMs: cStart + 30_000 + i * 20_000 + 1,
    })
  }
  facts['8x7'] = stray
  facts['07x8'] = applyAttempt(emptyFactRecord('07x8'), {
    correct: true,
    latencyMs: 2500,
    atMs: cStart + 90_000 + 2,
  })

  // A stretch fact from the old stretch bucket (outside the core space).
  let stretch = emptyFactRecord('11x12')
  for (const i of [0, 1]) {
    stretch = applyAttempt(stretch, {
      correct: i === 0,
      latencyMs: 6000,
      atMs: cStart + 120_000 + i * 10_000 + 3,
    })
  }
  facts['11x12'] = stretch

  return {
    version: 1,
    learnerName: 'Mikaela',
    createdAtMs: FIXTURE_T0 - 3 * DAY,
    updatedAtMs: cStart + 3 * HOUR,
    placementComplete: true,
    facts,
    bestTimeMsByMode: { quick: 61_234, practice: 170_000 },
    bestStreakByMode: { quick: 8, practice: 14 },
    dailyStreak: 2,
    lastPlayDayKey: '2026-09-02',
    gameXp: 1234,
    pendingReinforcements: [
      { factId: '6x7', kind: 'reintroduce', dueInQuestions: 2 },
      { factId: '8x7', kind: 'later-check', dueInQuestions: 5 },
      { factId: '11x12', kind: 'reintroduce', dueInQuestions: 1 },
      { factId: '3x9', kind: 'later-check', dueInQuestions: 0 },
    ],
  }
}

/** Total recentAttempts across every fact key of a V1 profile. */
export function countV1Attempts(v1: LearnerProfileV1): number {
  return Object.values(v1.facts).reduce(
    (s, r) => s + r.recentAttempts.length,
    0,
  )
}

/** Minimal in-memory Storage (Web Storage API subset used by the store). */
export class FakeStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}
