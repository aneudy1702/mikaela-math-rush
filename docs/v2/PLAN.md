# Math Rush V2 — Learning Journey: Plan of Attack

Status: REVISION 3 — T-SIM next; thresholds frozen after simulator results + owner sign-off
Decisions live in [DECISIONS.md](DECISIONS.md). This file is the ticket graph and the operating loop.

## Mental model (three systems)

1. **Curriculum** decides what the kid should learn next (skill → levels).
2. **Adaptive learning** decides what to practice right now (canonical fact mastery, inside the current level).
3. **Game progression** makes them want to keep going (XP, player level, badges, records).

One-way dependencies: progression reads curriculum + learning outputs, never writes academic state.
Learning never generates questions (existing rule).

## Problems in today's code this plan must fix

| # | Problem | Where |
|---|---|---|
| P1 | Unseen and low-sample facts (< 5 attempts) are `target` (60% weight) across all 55 facts → random difficulty jumps | `learning/selection.ts` `classifyFact` |
| P2 | `stretch` bucket injects 11s/12s once 20 facts are strong | `learning/selection.ts` |
| P3 | Speed is 35% of mastery: 100% accurate at > ~3.98 s avg can never reach "mastered" (0.848 < 0.85); also needs 8 samples | `learning/mastery.ts` |
| P4 | Records keyed by mode only; Home shows Quick only; streak record also fires "new-record" | `contracts/types.ts`, `App.tsx`, `session.ts` |
| P5 | Miss hold pauses clock but advances → fast wrong guesses save time; `recordBest` ignores accuracy; `avgLatencyMs` divides by questionCount | `session/session.ts` |
| P6 | No per-session history persisted | `persistence/storage.ts` |
| P7 | `gameXp` accrues but is never shown; no player level/badges | — |
| P8 | Carried `pendingReinforcements` bypass selection → can inject out-of-level facts (incl. 11s/12s) | `orchestrator/orchestrator.ts` |
| P9 | Stale service-worker bundle + same storage key → old code can wipe a v2 save | `public/sw.js`, `persistence/storage.ts` |

## Ticket graph

```
                 T0 Contracts freeze · canonical fact ID · Profile v2 (new key) · migration
                    · module stubs + barrels · compat shims · SW cache bump
                                         │
          ┌──────────────────┬───────────┴───────┬──────────────────┐
          ▼                  ▼                   ▼                  ▼
     T1 Level ladder    T2 Records +        T3 XP / player      T4 Fact status +
     (D1) data + tests  session log (D3)    level / badges (D6) level completion (D2)
          │                  │                   │                  │
          ├──────────────────┼───────────────────┼─────────┬────────┤
          ▼                  │                   │         ▼        ▼
     T5 Level-scoped         │                   │     T6 Placement staircase (D5)
     selection + queue       │                   │        + start-level inference
     scoping (D2, P1/P2/P8)  │                   │         │
          │                  │                   │         │
          └──────────────────┴─────────┬─────────┴─────────┘
                                       ▼
                    T7 Session integration (real-elapsed clock, level in,
                       summary out: level-up, XP, badges, record/baseline, fact status)
                                       │
                                       ▼
                    T8 App wiring + screens (Home ladder, Play, Results, Placement)
                                       │
                                       ▼
                    T9 End-to-end validation
                                       │
                                       ▼
                    T10 Kid test round (owner + Mikaela) → tuning decisions
```

### Waves

| Wave | Tickets | Parallel | Gate |
|---|---|---|---|
| −1 | T-SIM | single | Verifier confirms sim implements DECISIONS §B faithfully; owner signs off final RULES values |
| 0 | T0 | single | Owner approves frozen contracts; verifier passes |
| 1 | T1, T2, T3, T4 | **4 in parallel** (disjoint new modules) | Each verified; merged to `v2/integration` in order T1, T4, T2, T3 |
| 2 | T5, T6 | 2 in parallel | Verified + merged |
| 3 | T7 | single (integration seam) | Scripted engine e2e passes; owner gate |
| 4 | T8 | single (owns `App.tsx` + screens) | Owner reviews screenshots (desktop + phone) |
| 5 | T9 | verifier only | Owner approves PR `v2/integration → main` and deploy |
| 6 | T10 | human | Findings → new decisions → tuning tickets |

## Engineering rules for every ticket

- **Owned files only.** Each ticket lists its files; anything else = scope violation.
- **Contracts are frozen after T0.** A ticket that needs a contract change stops and reports; it never edits `contracts/`.
- **Export compatibility until T8.** Existing exported functions keep their names/signatures (new params optional).
  Removals happen only in T8 cleanup.
- **Green at every merge:** `npm test`, `npm run lint`, `npm run build`.
- **No new dependencies, no edits to `package.json`, `public/sw.js`, CI, or Vercel config** (except T0's SW cache bump).
- **Diff budget:** a ticket whose diff exceeds ~2× its estimate is flagged by the verifier for Lead review.

## Tickets

### T-SIM — Learner simulator  *(before T0; validates D2/D5/D6 thresholds)*
- Owns: `tools/sim/**` (new), `docs/v2/SIM-REPORT.md` (new). Touches nothing in `src/`.
- Standalone TypeScript run with Node 26 native type stripping (`node tools/sim/run.ts`); no new dependencies.
- Reference implementation of DECISIONS §B (status, counted attempts, selection steps 1–7, R1–R5, L9 rule, placement
  staircase, XP) driven entirely by a `RULES` object mirroring §B0, so every value can be varied.
- Learners: uniform p ∈ {0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00}; clustered-weak; slow-but-accurate;
  improving. Play patterns: all-Quick, all-Practice, mixed; 1 session/day. Seeded RNG, ≥ 300 learners per cell.
- Reports: sessions-to-complete per level (median, p90), stuck rate (> 20 sessions at one level), max hard-fact share
  per session, success-floor compliance, provisional on/off, L9 threshold 0.85/0.88/0.90, placement length and start
  error, XP/min on progress level vs replay.
- Later reused as T4/T7 regression tests.

### T0 — Contracts freeze, canonical ID, Profile v2, migration  *(blocks everything)*
- Owns: `src/engine/contracts/**`, `src/engine/persistence/**`, `src/engine/index.ts`, new stubs
  `src/engine/{curriculum,records,progression}/index.ts`, `src/engine/learning/{index.ts,advancement.ts}` (stub),
  `createEmptyProfile` in `learning/selection.ts`, `public/sw.js` (cache name bump only), tests.
- Contracts: `RULES` constants object (DECISIONS §B0, final values from T-SIM),
  `LevelDef { id, index, kind: 'table'|'mixed'|'speed', title, tables, tableFactIds, ownedFactIds, gatingFactIds, introFactIds }`,
  `SkillCurriculum`, `SkillProgress { currentLevelId, unlockedLevelIds, completedLevelIds, placementStartLevelId? }`,
  `RecordKey`, `PersonalRecord { baselineMs, bestMs, ... }`, `SessionLogEntry`, `PlayerProgress`, `BadgeDef`,
  `BadgeAward`, `FactStatus = 'new'|'learning'|'mastered'|'struggling'`, `AdvancementResult`, `FactAttempt { sessionId, sessionInferred, levelId, source }`, `FactRecord { everMastered,
  placementLikely, attempts log (last 12) }`, `SkillProgress.levelAnswers`, typed progression events
  (`FactMastered`, `LevelCompleted`, `RecordBeaten`, …) so T3 and T4 run in parallel,
  `SessionResultSummaryV2` (new type; old summary untouched), `MathSkill.conceptIdFor?`.
- D9 canonical ID frozen + tests (100 ordered pairs → 55 IDs; 8×7 updates `7x8`).
- Profile v2 under **new key** `mikaela-math-rush:learner-v2`; v1 blob left in place as backup.
  Migration: keep fact history (re-canonicalize + merge any stray keys), `gameXp` → `player.xp`, preserve
  `dailyStreak`/`lastPlayDayKey`, drop mode-only bests, drop `pendingReinforcements` entries for non-core facts.
  Deprecated v1 fields stay on the type (optional) so existing callers compile until T8.
- Stub signatures (throw `not implemented`) for every T1–T6 export, and all barrel lines pre-added. T0 also owns
  `src/engine/content/multiplication/{index.ts,levels.ts}` (stubs), `learning/placement.ts` and `orchestrator/**`
  (new stub exports only) for this purpose.
- Migration per DECISIONS D5b steps 1–2 (inferred sessions); start-level inference itself is T6.
- Accept: v1 fixture → v2 loses no fact records; corrupt data → fresh profile; old key untouched after save;
  all existing tests still pass.

### T1 — Level ladder data  (D1)
- Owns: `src/engine/curriculum/**`, `src/engine/content/multiplication/levels.ts` (new), tests.
- The 10 levels per D1; helpers `getLevel`, `nextLevel`, `levelsUpTo`.
- Accept: each core fact owned exactly once; owned counts match D1 table; L9/L10 table = all 55; IDs canonical.

### T2 — Records + session log  (D3)
- Owns: `src/engine/records/**`, tests. No `session.ts` edits.
- Pure: `recordKey`, `buildSessionLogEntry`, `evaluateRecord → { eligible, isBaseline, isNewRecord, previousBestMs }`.
- Session log capped (last 200 entries).
- Accept: never compares across level/mode/rulesVersion; < 90% accuracy never eligible; first eligible = baseline.

### T3 — XP, player level, badges  (D6)
- Owns: `src/engine/progression/**`, tests.
- Pure: `xpForSession(entry, ctx)`, `levelForXp(xp)`, `evaluateBadges(profile, entry, events)` (idempotent).
- Accept: replay multiplier applied; one-time bonuses never repeat; placement-skipped levels grant nothing;
  farming comparison from D6 encoded as a test.

### T4 — Fact status + level completion  (D2)
- Owns: `src/engine/learning/advancement.ts`, `src/engine/learning/mastery.ts` (additive: keep existing exports), tests.
- Pure: `factStatus(record)`, `selectionPriority(record)`, `evaluateTableLevel(level, facts, levelHistory)`,
  `evaluateMixedLevel(sessionLog)`.
- Accept: 100% accurate at 8 s → mastered; C M C C → mastered; single typo never → struggling; 1 session → never
  mastered; completion allowance table from D2 tested per level; latency never changes status.

### T5 — Level-scoped selection  (D2, P1, P2, P8)
- Depends T1, T4. Owns: `src/engine/learning/selection.ts` (selection functions), `src/engine/orchestrator/**`, tests.
- Pool = level table facts + review of earlier-owned facts (15% → 25% with carried facts); priority from T4; success
  floor ≥ 40%; remove `stretch`; reinforcement queue filtered to current + earlier levels.
- Accept: property test over 1,000 draws **including queue-driven draws** at L7 → zero facts outside L1–L7; success
  floor holds; review share within tolerance.

### T6 — Placement staircase + start-level inference  (D5)
- Depends T1, T4. Owns: `src/engine/learning/placement.ts`, tests. Keep old exports until T8.
- Pure: staircase state machine (`nextProbe`, `recordProbe`, `result`), `inferStartLevel(profile)`.
- Accept: hard cap 12; beginner who misses L1 → ≤ 3 questions; simulated "knows L1–L3" → start L4; skipped levels
  unlocked not completed; stops on 2 consecutive misses.

### T7 — Session integration
- Depends T2, T3, T4, T5. Owns: `src/engine/session/**`, tests.
- `SessionEngine(profile, skill, mode, levelId?)`; real-elapsed clock with explicit `pause()/resume()` for visibility;
  finish pipeline: log → record → completion → XP/badges → `SessionResultSummaryV2`.
- Accept: scripted e2e: fresh profile, 90%-accurate simulated kid completes L1 within D2's estimate and never sees a
  fact outside L1 + review; XP never touches facts.

### T8 — App wiring + screens  (absorbs former U0)
- Depends T7, T6. Owns: `src/App.tsx`, `src/screens/**`, `src/components/**`, `src/index.css`.
- Home: level ladder with current level + in-level fact progress, player level + XP bar, records for current level.
  Play: fact progress on incomplete levels; pace line/best only on completed levels. Results: level-up moment, XP breakdown,
  badges earned, facts mastered this session. Placement: warm-up staircase; parent unlock (long-press).
  Existing-profile start-level prompt (D5). Removes deprecated v1 fields/exports. Badges screen DEFERRED.
- Accept: owner reviews screenshots, desktop + 375 px.

### T9 — End-to-end validation
- Verifier only, browser: seed v1 profile → v2 intact and v1 blob untouched; placement ≤ 12 questions; play L1 →
  level up; per-level records with baseline behavior; hidden tab pauses clock; 375 px; no console errors; `npm run build`.

### T10 — Kid test round (human)
- Mikaela: placement + L1 → L3 (or from her inferred level). Capture where she struggles, whether level-ups feel earned,
  answer times, whether the ladder order matches her difficulty.

## Operating loop

```
 Owner ⇄ Lead (decide; DECISIONS.md is the record)
            │
            ├─► Adversarial reviewer — fresh context each round; sees DECISIONS.md, PLAN.md, code, raw user feedback;
            │      never sees the Owner⇄Lead conversation → objections → Owner ⇄ Lead dispositions (DECISIONS §C)
            │
            ├─► Implementer — one per ticket, isolated worktree, branch v2/tN-*, owned files only, ticket text as spec
            │
            └─► Verifier — fresh context per ticket: runs test/lint/build; checks acceptance criteria one by one;
                   diffs against the ticket→file map (flags barrels, package.json, sw.js, contracts); flags unrequested
                   features and diff-budget overruns → pass: Lead merges to v2/integration · fail: back to implementer
                   (max 2 rounds, then escalate to Owner)
```

- Branching: `v2/integration` off `main`; one PR `v2/integration → main` at the end.
- Owner gates: after T0, after wave 1, after T7, after T8 screenshots, before merge/deploy.
- Nothing is pushed to `main` or deployed without the owner.
