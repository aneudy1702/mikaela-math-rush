import { describe, expect, it } from 'vitest'
import { RULES, SPEC_CONSTANTS, type FactEvidence, type SessionMode } from '../contracts'
import { getLevel, ownerLevelOf, reviewFactIds, scopeFactIds } from '../curriculum'
import { createMultiplicationSkill, generateForFact } from '../content/multiplication'
import { factStatus, isLikelyCorrect } from '../learning/advancement'
import {
  createLevelSelectionState,
  filterPendingToScope,
  fluencySlownessWeight,
  levelSelectionPools,
  recordShown,
  selectLevelFact,
  type LevelSelectionContext,
  type LevelSelectionState,
} from './levelSelection'
import { LevelQuestionOrchestrator } from './levelOrchestrator'
import {
  ALL_CORE_IDS,
  evidenceMap,
  evidenceWith,
  runSessions,
  seeded,
  uniformLearner,
  type Learner,
  type Shown,
} from './levelSelection.testkit'

const L7 = getLevel('L7')
const L7_SCOPE = scopeFactIds('L7')
const L7_TABLE = new Set(L7.tableFactIds)
const MODES: SessionMode[] = ['quick', 'practice', 'rush']

function ctxFor(
  levelId: string,
  mode: SessionMode,
  factEvidence: Record<string, FactEvidence>,
): LevelSelectionContext {
  const level = getLevel(levelId)
  return {
    level,
    mode,
    pools: levelSelectionPools(level, reviewFactIds(levelId), factEvidence),
    factEvidence,
    state: createLevelSelectionState(),
  }
}

/** Pool draws with fixed evidence; ctx.state advances like a session. */
function drawMany(ctx: LevelSelectionContext, n: number, seed: number) {
  const rngs = { main: seeded(seed), fluency: seeded(seed + 1) }
  const out = []
  for (let i = 0; i < n; i++) {
    const sel = selectLevelFact(ctx, rngs)
    recordShown(ctx, sel.factId)
    out.push(sel)
  }
  return out
}

describe('D2 step 1 pools', () => {
  it('level pool = table, review = earlier-owned not in table, carried = learning/struggling review', () => {
    const ev = evidenceMap((id) => (id === '2x3' ? 'struggling' : id === '1x2' ? 'learning' : 'mastered'))
    const pools = levelSelectionPools(L7, reviewFactIds('L7'), ev)
    expect(pools.levelPool).toEqual(L7.tableFactIds)
    expect(pools.reviewPool.some((f) => L7_TABLE.has(f))).toBe(false)
    expect(pools.reviewPool).toHaveLength(42)
    expect(pools.carried.sort()).toEqual(['1x2', '2x3'])
    // A learning table fact is not carried.
    const ev2 = { ...ev, '2x7': evidenceWith('2x7', 'learning') }
    expect(levelSelectionPools(L7, reviewFactIds('L7'), ev2).carried).not.toContain('2x7')
  })

  it('L1 has no review pool; L9 table is all 55 facts', () => {
    expect(levelSelectionPools(getLevel('L1'), reviewFactIds('L1'), {}).reviewPool).toEqual([])
    expect(levelSelectionPools(getLevel('L9'), reviewFactIds('L9'), {}).levelPool).toHaveLength(55)
  })
})

describe('P8 queue scope — property test at L7 (1,000+ draws incl. queue-driven)', () => {
  it('never shows a fact outside L1–L7 and drops out-of-scope queue items', () => {
    const outOfScope = ['8x8', '8x9', '9x9', '11x12', '7x11']
    const ev = evidenceMap((id) => {
      const owner = ownerLevelOf(id)!.index
      if (owner < 7) return id.charCodeAt(0) % 3 === 0 ? 'learning-unlikely' : 'mastered'
      return 'new'
    })
    let dropped = 0
    const { shown } = runSessions({
      levelId: 'L7',
      mode: 'practice',
      sessions: 50,
      seed: 7,
      learner: uniformLearner(0.7),
      evidence: ev,
      extraPending: (s) => [
        { factId: outOfScope[s % outOfScope.length]!, kind: 'reintroduce', dueInQuestions: 0 },
        { factId: '9x9', kind: 'later-check', dueInQuestions: 2 },
        // In-scope carried-over items (review + table).
        { factId: '3x4', kind: 'reintroduce', dueInQuestions: s % 4 },
        { factId: '7x8', kind: 'later-check', dueInQuestions: 1 },
      ],
      onSeed: (d) => {
        dropped += d
      },
    })
    expect(shown.length).toBeGreaterThanOrEqual(1000)
    const queueDriven = shown.filter((s) => s.source !== 'draw')
    expect(queueDriven.length).toBeGreaterThan(100)
    expect(queueDriven.some((s) => s.source === 'later-check')).toBe(true)
    expect(dropped).toBe(100) // 2 out-of-scope items seeded per session × 50
    for (const s of shown) {
      expect(L7_SCOPE.has(s.factId), s.factId).toBe(true)
      expect(ownerLevelOf(s.factId)!.index).toBeLessThanOrEqual(7)
      expect(outOfScope).not.toContain(s.factId)
    }
  })

  it('filterPendingToScope keeps only in-scope items (copies)', () => {
    const pending = [
      { factId: '8x9', kind: 'reintroduce' as const, dueInQuestions: 1 },
      { factId: '7x8', kind: 'later-check' as const, dueInQuestions: 2 },
      { factId: '11x12', kind: 'reintroduce' as const, dueInQuestions: 0 },
    ]
    const kept = filterPendingToScope(pending, L7_SCOPE)
    expect(kept).toEqual([pending[1]])
    expect(kept[0]).not.toBe(pending[1])
  })

  it('later-check only after a correct reintroduce (no chaining)', () => {
    const orch = new LevelQuestionOrchestrator({
      skill: createMultiplicationSkill(seeded(1)),
      levelId: 'L7',
      mode: 'practice',
      rngs: { main: () => 0, fluency: () => 0 },
    })
    orch.recordAnswer('7x8', 'draw', false)
    expect(orch.getScheduled().map((i) => i.kind)).toEqual(['reintroduce'])
    orch.recordAnswer('7x8', 'draw', true)
    expect(orch.getScheduled()).toHaveLength(1)
    orch.recordAnswer('7x8', 'reintroduce', true)
    expect(orch.getScheduled().map((i) => i.kind)).toEqual(['reintroduce', 'later-check'])
    orch.recordAnswer('7x9', 'later-check', true)
    expect(orch.getScheduled()).toHaveLength(2)
    const lc = orch.getScheduled().find((i) => i.kind === 'later-check')!
    expect(lc.dueAtIndex).toBe(RULES.laterCheckDelayRange[0])
  })
})

describe('D2 step 5 success floor', () => {
  function assertFloor(shown: Shown[], ev0: Record<string, FactEvidence> | null) {
    let enforcedDraws = 0
    for (const s of shown) {
      const { q, likelyDrawn } = s.before
      const below = q >= SPEC_CONSTANTS.floorFromQuestion - 1 && q > 0 && likelyDrawn / q < RULES.successFloor
      if (below && s.source === 'draw' && ev0 !== null) {
        // With fixed evidence a likely candidate always exists here → must be likely.
        expect(s.likely, `q${q} ${s.factId}`).toBe(true)
        enforcedDraws++
      }
    }
    return enforcedDraws
  }

  it('holds whenever enforceable (few likely facts, fixed evidence, all modes)', () => {
    // Only 1x7 (table) and 1x2 (review) are likely; everything else struggling/new.
    const ev = evidenceMap((id) =>
      id === '1x7' || id === '1x2' ? 'mastered' : L7_TABLE.has(id) ? 'struggling' : 'new',
    )
    for (const mode of MODES) {
      const learner: Learner = { correct: () => true, latencyMs: () => 2000 }
      // All-correct learner on fixed evidence copy: statuses change only through answers,
      // so re-run with a fresh evidence map each session.
      let enforced = 0
      for (let s = 0; s < 40; s++) {
        const { shown } = runSessions({ levelId: 'L7', mode, sessions: 1, seed: 100 + s, learner, evidence: ev })
        enforced += assertFloor(shown, ev)
        // Session share of likely draws stays at/above the floor (minus the first question).
        const likely = shown.filter((x) => x.likely).length
        expect(likely / shown.length).toBeGreaterThanOrEqual(RULES.successFloor - 1 / shown.length)
      }
      expect(enforced).toBeGreaterThan(0)
    }
  })

  it('selectLevelFact prefers the chosen pool, else the other allowed pool', () => {
    const ev = evidenceMap((id) => (id === '1x2' || id === '1x7' ? 'mastered' : 'struggling'))
    const ctx = ctxFor('L7', 'practice', ev)
    ctx.state.questionsSoFar = 5
    // rng 0 → review chosen; likely review candidate 1x2 exists.
    let sel = selectLevelFact(ctx, { main: () => 0, fluency: () => 0 })
    expect(sel).toMatchObject({ factId: '1x2', pool: 'review', likely: true, floorEnforced: true })
    // rng 0.99 → level chosen; likely level candidate 1x7.
    sel = selectLevelFact(ctx, { main: () => 0.99, fluency: () => 0 })
    expect(sel).toMatchObject({ factId: '1x7', pool: 'level', likely: true })
    // No likely in level → the other pool.
    const ev2 = { ...ev, '1x7': evidenceWith('1x7', 'struggling') }
    const ctx2 = { ...ctxFor('L7', 'practice', ev2), state: { ...ctx.state } }
    sel = selectLevelFact(ctx2, { main: () => 0.99, fluency: () => 0 })
    expect(sel).toMatchObject({ factId: '1x2', pool: 'review' })
  })

  it('is not enforced when no likely candidate exists', () => {
    const ev = evidenceMap(() => 'struggling')
    const { shown } = runSessions({
      levelId: 'L7',
      mode: 'rush',
      sessions: 1,
      seed: 3,
      learner: { correct: () => false, latencyMs: () => 5000 },
      evidence: ev,
    })
    expect(shown).toHaveLength(100)
    expect(shown.every((s) => !s.likely)).toBe(true)
    const ctx = ctxFor('L7', 'rush', ev)
    ctx.state.questionsSoFar = 10
    expect(selectLevelFact(ctx, { main: seeded(1), fluency: seeded(2) }).floorEnforced).toBe(false)
  })

  it('a due non-likely queue item waits at most 3 questions behind the floor', () => {
    const ev = evidenceMap((id) => (id === '1x7' ? 'mastered' : L7_TABLE.has(id) ? 'struggling' : 'new'))
    const orch = new LevelQuestionOrchestrator({
      skill: createMultiplicationSkill(seeded(4)),
      levelId: 'L7',
      mode: 'practice',
      rngs: { main: seeded(5), fluency: seeded(6) },
    })
    // Put the session below the floor: 5 questions shown, none likely.
    const counters = orch.counters as LevelSelectionState
    counters.questionsSoFar = 5
    orch.seedPending([{ factId: '7x8', kind: 'reintroduce', dueInQuestions: 0 }])
    const picks = Array.from({ length: 6 }, () => orch.selectNext(ev))
    // Waits 3 questions (likely 1x7 drawn instead), then goes through despite the floor.
    expect(picks.slice(0, 3).map((p) => p.factId)).toEqual(['1x7', '1x7', '1x7'])
    expect(picks[3]).toMatchObject({ factId: '7x8', source: 'reintroduce', likely: false })
  })
})

describe('D2 step 3 review share', () => {
  function reviewShare(ev: Record<string, FactEvidence>, mode: SessionMode, sessions: number, seed: number) {
    let review = 0
    let total = 0
    for (let s = 0; s < sessions; s++) {
      const ctx = ctxFor('L7', mode, ev)
      for (const sel of drawMany(ctx, { quick: 10, practice: 25, rush: 100 }[mode], seed + s)) {
        total++
        if (sel.pool === 'review') review++
      }
    }
    return review / total
  }

  it('≈ 0.15 without carried facts', () => {
    // Table facts likely-learning, review all mastered → no carried, floor never binds.
    const ev = evidenceMap((id) => (L7_TABLE.has(id) ? 'learning-likely' : 'mastered'))
    expect(levelSelectionPools(L7, reviewFactIds('L7'), ev).carried).toEqual([])
    const share = reviewShare(ev, 'practice', 800, 1)
    expect(Math.abs(share - RULES.reviewShare)).toBeLessThan(0.01)
  })

  it('≈ 0.25 while carried facts exist', () => {
    const ev = evidenceMap((id) =>
      L7_TABLE.has(id) ? 'learning-likely' : id === '3x4' ? 'learning-likely' : 'mastered',
    )
    expect(levelSelectionPools(L7, reviewFactIds('L7'), ev).carried).toEqual(['3x4'])
    const share = reviewShare(ev, 'rush', 200, 2)
    expect(Math.abs(share - RULES.reviewShareWithCarried)).toBeLessThan(0.01)
  })
})

describe('D2 step 4 carried-hard cap', () => {
  it.each(MODES)('at most carriedHardCap carried facts per %s session (queue included)', (mode) => {
    // Every review fact carried; level facts struggling; carried queue items seeded.
    const ev = evidenceMap((id) => (L7_TABLE.has(id) ? 'struggling' : 'learning-unlikely'))
    const cap = RULES.carriedHardCap[mode]
    let hitCap = 0
    for (let s = 0; s < 30; s++) {
      const { shown } = runSessions({
        levelId: 'L7',
        mode,
        sessions: 1,
        seed: 500 + s,
        learner: uniformLearner(0.5),
        evidence: ev,
        extraPending: () =>
          ['2x3', '3x4', '4x5', '2x2', '5x6', '1x3'].map((factId, i) => ({
            factId,
            kind: 'reintroduce' as const,
            dueInQuestions: i,
          })),
      })
      const carried = shown.filter((x) => x.carried).length
      expect(carried).toBeLessThanOrEqual(cap)
      if (carried === cap) hitCap++
    }
    expect(hitCap).toBeGreaterThan(0)
  })

  it('over cap: queue item waits (stays queued); pool pick is redrawn from the level pool', () => {
    const ev = evidenceMap((id) => (L7_TABLE.has(id) ? 'learning-likely' : 'learning-unlikely'))
    const orch = new LevelQuestionOrchestrator({
      skill: createMultiplicationSkill(seeded(1)),
      levelId: 'L7',
      mode: 'quick',
      rngs: { main: seeded(9), fluency: seeded(10) },
    })
    orch.seedPending([
      { factId: '2x3', kind: 'reintroduce', dueInQuestions: 0 },
      { factId: '3x4', kind: 'reintroduce', dueInQuestions: 0 },
    ])
    const picks = Array.from({ length: 10 }, () => orch.selectNext(ev))
    expect(picks.filter((p) => p.carried)).toHaveLength(1)
    expect(orch.exportPending().map((p) => p.factId)).toContain('3x4')
    // Direct: review chosen, carried picked, cap reached → level pool.
    const ctx = ctxFor('L7', 'quick', ev)
    ctx.state.carriedDrawn = 1
    ctx.state.questionsSoFar = 3
    ctx.state.likelyDrawn = 3
    const sel = selectLevelFact(ctx, { main: () => 0, fluency: () => 0 })
    expect(sel.pool).toBe('level')
    expect(L7_TABLE.has(sel.factId)).toBe(true)
  })
})

describe('D2 step 1 L1 intro running cap', () => {
  it('intro share ≤ 20% after every question', () => {
    const intro = new Set(getLevel('L1').introFactIds)
    for (const mode of MODES) {
      for (let s = 0; s < 20; s++) {
        const { shown } = runSessions({
          levelId: 'L1',
          mode,
          sessions: 1,
          seed: 900 + s,
          learner: { correct: () => true, latencyMs: () => 2000 },
          evidence: {},
        })
        let introCount = 0
        shown.forEach((x, i) => {
          if (intro.has(x.factId)) introCount++
          expect(introCount).toBeLessThanOrEqual(RULES.introShareMaxL1 * (i + 1) + 1e-9)
        })
        if (mode === 'rush') expect(introCount).toBeGreaterThanOrEqual(15)
      }
    }
  })
})

describe('D2 step 6 last-3 exclusion', () => {
  it('a pool draw never repeats one of the last 3 facts shown', () => {
    for (const levelId of ['L1', 'L2', 'L7', 'L9']) {
      const { shown } = runSessions({
        levelId,
        mode: 'rush',
        sessions: 5,
        seed: 42,
        learner: uniformLearner(0.8),
        evidence: evidenceMap((id) => (id.length % 2 ? 'mastered' : 'learning')),
      })
      let checked = 0
      for (const s of shown) {
        if (s.source !== 'draw') continue
        expect(s.before.recent.slice(-SPEC_CONSTANTS.recentExcludeCount)).not.toContain(s.factId)
        checked++
      }
      expect(checked).toBeGreaterThan(300)
    }
  })

  it('falls back to all candidates when every candidate is recent', () => {
    const ev = evidenceMap((id) => (id === '1x7' ? 'mastered' : 'struggling'))
    const ctx = ctxFor('L7', 'practice', ev)
    ctx.state = { ...ctx.state, questionsSoFar: 5, likelyDrawn: 0, recentFactIds: ['1x7'] }
    const sel = selectLevelFact(ctx, { main: () => 0.99, fluency: () => 0 })
    expect(sel.factId).toBe('1x7')
  })
})

describe('D2 step 6 budget neutrality (two-stage pick) and D12', () => {
  /** Mastered facts always correct; unmastered answered from the learner's own per-question stream. */
  function learner(latency: (factId: string, u: number) => number): Learner {
    return {
      correct: (_f, status, u) => status === 'mastered' || u < 0.75,
      latencyMs: latency,
    }
  }
  const startEv = (lat: (id: string) => number) =>
    evidenceMap(
      (id) => {
        const owner = ownerLevelOf(id)!.index
        if (owner < 7) return id.endsWith('5') ? 'learning-unlikely' : 'mastered'
        return 'new'
      },
      lat,
    )
  const fast = (_f: string, u: number) => 1000 + u * 1000
  const slow = (_f: string, u: number) => 7000 + u * 3000
  /** Varies by fact: some mastered facts fast, some slow (so stage-2 weights differ). */
  const mixed = (f: string, u: number) => (f.charCodeAt(0) % 2 ? 1000 + u * 1000 : 7000 + u * 3000)

  function run(lat: (f: string, u: number) => number, seed: number) {
    return runSessions({
      levelId: 'L7',
      mode: 'practice',
      sessions: 30,
      seed,
      learner: learner(lat),
      evidence: startEv((id) => lat(id, 0.5)),
    }).shown
  }
  const cls = (s: Shown) => (s.source === 'draw' ? s.stage1Status : `queue:${s.source}`)
  const unmasteredId = (s: Shown) => (s.stage1Status === 'mastered' ? '*' : s.factId)

  it.each([1, 2, 3])('fast vs slow vs mixed (seed %i): identical stage-1 classes and unmastered draws', (seed) => {
    const a = run(fast, seed)
    const b = run(slow, seed)
    const c = run(mixed, seed)
    expect(b.map(cls)).toEqual(a.map(cls))
    expect(c.map(cls)).toEqual(a.map(cls))
    expect(b.map(unmasteredId)).toEqual(a.map(unmasteredId))
    expect(c.map(unmasteredId)).toEqual(a.map(unmasteredId))
    expect(a.filter((s) => s.stage1Status === 'mastered').length).toBeGreaterThan(50)
    // Latency does change which mastered fact gets fluency review when weights differ.
    expect(c.map((s) => s.factId)).not.toEqual(a.map((s) => s.factId))
  })

  it('with all fluency weights equal the full sequences are identical', () => {
    // fast: every weight 0.8; slow: every weight 1.3; 3.5 s vs 5.5 s: every weight 1.0.
    expect(run(slow, 11).map((s) => s.factId)).toEqual(run(fast, 11).map((s) => s.factId))
    const mid1 = (_f: string, u: number) => 3100 + u * 400
    const mid2 = (_f: string, u: number) => 5500 + u * 400
    expect(run(mid2, 12).map((s) => s.factId)).toEqual(run(mid1, 12).map((s) => s.factId))
  })

  it('D12 exact: latency affects nothing but the stage-2 mastered re-pick', () => {
    const base = startEv(() => 2000)
    const scale = (k: number) => {
      const out: Record<string, FactEvidence> = {}
      for (const [id, e] of Object.entries(base)) {
        out[id] = { ...e, recentCorrectLatenciesMs: e.recentCorrectLatenciesMs.map((x) => x * k) }
      }
      return out
    }
    const unmasteredOnly = (k: number) => {
      const out: Record<string, FactEvidence> = {}
      for (const [id, e] of Object.entries(base)) {
        out[id] =
          factStatus(e) === 'mastered'
            ? e
            : { ...e, recentCorrectLatenciesMs: e.recentCorrectLatenciesMs.map((x) => x * k) }
      }
      return out
    }
    for (const k of [0.3, 3]) {
      const scaled = scale(k)
      for (const id of ALL_CORE_IDS) {
        expect(factStatus(scaled[id])).toBe(factStatus(base[id]))
        expect(isLikelyCorrect(scaled[id])).toBe(isLikelyCorrect(base[id]))
      }
      expect(levelSelectionPools(L7, reviewFactIds('L7'), scaled)).toEqual(
        levelSelectionPools(L7, reviewFactIds('L7'), base),
      )
      const a = drawMany(ctxFor('L7', 'practice', base), 400, 77)
      const b = drawMany(ctxFor('L7', 'practice', scaled), 400, 77)
      expect(b.map((s) => s.stage1Status)).toEqual(a.map((s) => s.stage1Status))
      expect(b.map((s) => s.pool)).toEqual(a.map((s) => s.pool))
      a.forEach((s, i) => {
        if (s.stage1Status !== 'mastered') expect(b[i]!.factId).toBe(s.factId)
      })
      // Scaling only unmastered facts' latencies changes nothing at all.
      const c = drawMany(ctxFor('L7', 'practice', unmasteredOnly(k)), 400, 77)
      expect(c).toEqual(a)
    }
  })

  it('fluencySlownessWeight bands (median of last ≤ 4 correct latencies)', () => {
    const w = (lat: number[]) =>
      fluencySlownessWeight({ ...evidenceWith('2x2', 'mastered'), recentCorrectLatenciesMs: lat })
    expect(w([])).toBe(1.0)
    expect(w([3000])).toBe(0.8)
    expect(w([3001])).toBe(1.0)
    expect(w([6000])).toBe(1.0)
    expect(w([6001])).toBe(1.3)
    expect(w([1000, 9000, 9000, 1000])).toBe(1.0) // median 5000
    expect(w([20000, 1000, 1000, 1000, 9000])).toBe(0.8) // last 4: 1000,1000,1000,9000 → 1000
    expect(fluencySlownessWeight(undefined)).toBe(1.0)
  })
})

describe('D9 canonical ID + exact targeting', () => {
  it('exactly one canonicalFactId implementation in src/', () => {
    const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    expect(Object.keys(sources).length).toBeGreaterThan(40)
    const impl = /function\s+canonicalFactId\b|canonicalFactId\s*[:=]\s*(async\s*)?\(/
    const hits = Object.entries(sources)
      .filter(([, text]) => impl.test(text))
      .map(([path]) => path)
    expect(hits).toEqual(['/src/engine/contracts/factId.ts'])
  })

  it('conceptIdFor(8×7) = 7x8', () => {
    const skill = createMultiplicationSkill()
    const q = generateForFact('7x8', () => 0.9) // 'ba' orientation → 8 × 7
    expect(q.prompt).toEqual({ type: 'expression', expression: '8 × 7' })
    expect(skill.conceptIdFor?.(q)).toBe('7x8')
  })

  it('targeted requests are honored exactly; unknown IDs throw (no band/stretch fallback)', () => {
    const skill = createMultiplicationSkill(seeded(3))
    for (let i = 0; i < 50; i++) {
      const q = skill.generateQuestion({ skillId: skill.id, targetConcepts: ['2x3'], cognitiveDifficulty: 0.95 })
      expect(q.metadata?.factId).toBe('2x3')
      expect(skill.conceptIdFor?.(q)).toBe('2x3')
    }
    for (const bad of ['8x7', '13x13', '0x5', 'foo', '07x8']) {
      expect(() =>
        skill.generateQuestion({ skillId: skill.id, targetConcepts: [bad], cognitiveDifficulty: 0.5 }),
      ).toThrow()
    }
    expect(() =>
      skill.generateQuestion({ skillId: skill.id, targetConcepts: ['2x3', 'nope'], cognitiveDifficulty: 0.5 }),
    ).toThrow()
  })
})
