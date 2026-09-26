// One simulated learner's journey through the REAL product engine (LevelSessionEngine → T5 orchestrator,
// T4 evidence/completion, T2 records, T3 XP/badges). Mirrors tools/sim/journey.ts's protocol: beginner at L1,
// no placement, 1 session per day, always plays the current level, cap sessions per level (∞ = censored).
import { LevelSessionEngine } from '../../src/engine/session/levelSession.ts'
import { createEmptyProfile } from '../../src/engine/learning/selection.ts'
import { createMultiplicationSkill } from '../../src/engine/content/multiplication/index.ts'
import { levelIndexOf } from '../../src/engine/contracts/index.ts'
import type { LearnerProfile, SessionResultSummaryV2 } from '../../src/engine/contracts/index.ts'
import type { Learner } from '../sim/learners.ts'
import { hashSeed, mulberry32, pickMode, type Pattern } from '../sim/journey.ts'

/** Non-answer time per question (read, feedback/reveal) — same constant as tools/sim/session.ts. */
export const OVERHEAD_MS = 1500
const DAY_MS = 86_400_000
/** Local noon of 2026-01-05, so every session sits mid-day in any timezone. */
const START_MS = new Date(2026, 0, 5, 12, 0, 0).getTime()

export interface ProductJourneyResult {
  /** Sessions to complete each level 1..9 (index 0 unused); null = not reached; Infinity = censored. */
  sessions: (number | null)[]
  cumulative: number
  summaries?: SessionResultSummaryV2[]
  profile?: LearnerProfile
}

export interface ProductJourneyOpts {
  learner: Learner
  pattern: Pattern
  seed: number
  maxSessionsPerLevel?: number
  keep?: boolean
}

export function runProductJourney(o: ProductJourneyOpts): ProductJourneyResult {
  const cap = o.maxSessionsPerLevel ?? 60
  // Independent streams; a fast/slow pair shares every stream except the learner's latency VALUES.
  const main = mulberry32(hashSeed(o.seed, 'sel'))
  const fluency = mulberry32(hashSeed(o.seed, 'fluency'))
  const ans = mulberry32(hashSeed(o.seed, 'ans'))
  const lat = mulberry32(hashSeed(o.seed, 'lat'))
  const modeRng = mulberry32(hashSeed(o.seed, 'mode'))
  const skill = createMultiplicationSkill(mulberry32(hashSeed(o.seed, 'question')))
  const learner = o.learner

  let profile = createEmptyProfile('Sim', START_MS)
  let t = START_MS
  const res: ProductJourneyResult = { sessions: Array(10).fill(null), cumulative: 0, summaries: o.keep ? [] : undefined }
  let at = 0
  let sessionNo = 0

  for (;;) {
    const levelId = profile.progress.currentLevelId
    const levelIdx = levelIndexOf(levelId)
    const mode = pickMode(o.pattern, modeRng)
    sessionNo++
    t = START_MS + sessionNo * DAY_MS
    const engine = new LevelSessionEngine({
      profile,
      skill,
      mode,
      levelId,
      clock: () => t,
      rngs: { main, fluency },
      sessionId: `p${sessionNo}`,
      adoptProfile: true,
    })
    const seen = new Set<string>()
    while (!engine.isComplete()) {
      const q = engine.nextQuestion()!
      const correct = ans() < learner.p(q.factId)
      t += learner.latencyMs(q.factId, lat)
      const expected = Number(q.question.correctAnswer)
      const out = engine.answer(q.question.id, correct ? expected : expected + 1)
      learner.onAttempt(q.factId, correct, out.counted, sessionNo, q.source)
      seen.add(q.factId)
      t += OVERHEAD_MS
    }
    const summary = engine.finish()
    profile = engine.getProfile()
    learner.onDayEnd(seen)
    res.summaries?.push(summary)
    at++

    if (summary.advancement.newlyCompleted) {
      res.sessions[levelIdx] = at
      res.cumulative += at
      at = 0
      if (levelIdx >= 9) break
    } else if (at >= cap) {
      res.sessions[levelIdx] = Infinity
      res.cumulative = Infinity
      break
    }
  }
  if (o.keep) res.profile = profile
  return res
}
