# Math Rush V2 — Decision Log

Status per decision: PROPOSED / ACCEPTED / REVISED / DEFERRED / PENDING-SIM (value to be confirmed by the learner simulator).
Owner = Aneudy. Lead = Claude. Test user = Mikaela (grade 3). Secondary feedback = Adrian (older brother).

**Revision 3.** Every learning rule is executable: exact definitions in §B, all tunable numbers in the `RULES` table (§B0).
Nothing qualitative is left for an implementer to invent. If an implementer finds a case these rules don't decide, they
stop and report — they do not invent a rule.

---

## A. Owner directives (source material — decisions must satisfy these)

Revision 2 directives:
1. D1 — optimize level sizes for visible kid progression; ~10 levels; evaluate splitting early tables.
2. D2 — latency never determines mastery in L1–L9 (it only steers practice: slow-correct → more practice,
   fast-correct → less, incorrect → evidence against mastery). Level completion must not require every focus fact
   mastered; use % mastered, overall level accuracy, a small allowance of learning facts, no cluster of struggling facts.
   Unmastered facts follow the learner as review. No accidental perfection requirements.
3. D9 — 7×8 and 8×7 are one canonical concept; exact normalization rule, tested.
4. D5 — placement is a short, provisional adaptive staircase that feels like entering the game.
5. D3 — real elapsed time; latency tracked separately; accuracy qualifies records; mistakes gentle in UX.
6. D6 — anti-farming guardrail without a complicated economy.

Revision 3 directives:
7. Mikaela's start level: infer from **raw v1 attempts recomputed under v2 rules** (never v1 mastery scores).
   Recommendation only: unlock earlier levels, no retroactive XP/badges/records, recommend a start level, offer the
   warm-up as optional recalibration, allow any lower unlocked level. Insufficient or contradictory evidence → warm-up.
8. 30-minute session reconstruction is a **migration-only heuristic**; v2 session IDs are authoritative; reconstructed
   evidence is marked inferred. "Contradictory" is exact: an earlier level that merely lacks data is *insufficient*, not
   contradictory; contradiction requires the earlier level to be evidenced and clearly fail.
9. Keep ×6 as is; the universal success floor + carry-over caps handle the spike; the kid test decides.
10. Placement-skipped levels can later earn their normal one-time completion XP and Mastered badge by real play.
11. Records keyed skill + level + mode only (no input-method split).
12. **No synthetic time penalties.** Wrong answer → soft reveal → question ends → counts against accuracy → fact
    scheduled for reinforcement. No retyping the revealed answer. Records = fastest eligible real elapsed run.
13. Build the learner simulator before freezing thresholds: accuracy 60/70/75/80/85/90/95/100%, uniform, clustered-weak,
    slow-but-accurate, improving learners. Validate sessions-to-progression, stuck rates, and the Mixed threshold
    (prefer the simpler number if 85/88/90 behave alike).

---

## B0. RULES — every tunable number (single source of truth; code imports these)

| Key | Value | Status | Meaning |
|---|---|---|---|
| `windowSize` | 4 | PENDING-SIM | counted attempts considered for status |
| `masteredMinCorrectInWindow` | 3 | PENDING-SIM | rule (b) |
| `fastTrackMinAttempts` | 2 | PENDING-SIM | rule (a) |
| `minDistinctSessionsForMastery` | 2 | PENDING-SIM | spacing |
| `struggleMinAttempts` | 3 | PENDING-SIM | |
| `struggleMaxCorrectInWindow` | 1 | PENDING-SIM | |
| `provisionalEnabled` | true | PENDING-SIM | sim compares on/off |
| `provisionalMinCorrect` | 3 | PENDING-SIM | in one session |
| `provisionalMinGapQuestions` | 8 | PENDING-SIM | intervening questions (live) |
| `provisionalMinGapMsInferred` | 60 000 | PENDING-SIM | inferred v1 evidence |
| `confirmDelayRange` | [9, 12] | PENDING-SIM | questions after first correct |
| `allowanceFraction` / `allowanceMin` | 0.2 / 1 | PENDING-SIM | a = max(1, ⌊0.2·n⌋) |
| `levelAccuracyMin` / `levelAccuracyWindow` | 0.85 / 20 | PENDING-SIM | table levels |
| `minSessionsAtLevel` | 2 | PENDING-SIM | |
| `maxStrugglingTableFacts` | 1 | PENDING-SIM | |
| `mixedAccuracyMin` | 0.88 | PENDING-SIM | sim compares 0.85 / 0.88 / 0.90 |
| `mixedWindow` / `mixedMinSessions` / `mixedMinDays` | 50 / 3 / 2 | PENDING-SIM | |
| `mixedMaxStruggling` | 2 | PENDING-SIM | |
| `statusWeight` | struggling 4 · learning 3 · new 2.5 · provisional 2 · mastered 1 | PENDING-SIM | |
| `slowness` (non-mastered only) | ≤3 s 0.8 · 3–6 s 1.0 · >6 s 1.3 | PENDING-SIM | median of last ≤4 correct latencies |
| `reviewShare` / `reviewShareWithCarried` | 0.15 / 0.25 | PENDING-SIM | |
| `introShareMaxL1` | 0.20 | PENDING-SIM | ×1 intro facts in L1 |
| `successFloor` | 0.40 | PENDING-SIM | |
| `carriedHardCap` | Quick 1 · Practice 2 · Rush 8 | PENDING-SIM | per session |
| `reintroduceDelayRange` / `laterCheckDelayRange` | [3, 8] / [5, 12] | ACCEPTED | existing |
| `recordMinAccuracy` | 0.90 | PENDING-SIM | |
| `dropDownOfferAccuracy` | 0.70 over first 2 sessions | PENDING-SIM | |
| `placementMaxQuestions` | 12 | PENDING-SIM | |
| `inferenceMaxAgeDays` | 30 | PROPOSED | |
| `inferenceSessionGapMs` | 1 800 000 | ACCEPTED | migration only |
| `inferenceMinAttemptsPerFact` | 3 | PROPOSED | |
| `clearFailAccuracy` / `clearFailMinAttempts` | 0.70 / 10 | PROPOSED | |
| XP numbers | see D6 | PENDING-SIM | sim reports XP/min |
| `rulesVersion` | 1 | ACCEPTED | bump when timing/record rules change |

---

## B. Decisions

### D0 — Scope  — ACCEPTED
Grade 3 → Multiplication, factors 1–10. ×11/×12 = deferred bonus level (not this sprint). Curriculum model:
`SkillCurriculum { skillId, grade, levels: LevelDef[] }`. No multi-course registry until a second skill exists.

### D1 — Level ladder  — REVISED
Every core fact has exactly one **owner level**. Owned facts are **gating** (count toward completion rule R1) or
**intro** (rule facts shown and practiced but not gating). Only ×1 is intro.

| L | Kind | Title | Table facts | Owned | Gating | Intro |
|---|---|---|---|---|---|---|
| 1 | table | ×1 and ×2 | 19 | 19 | 9 (2x2…2x10) | 10 (1x1…1x10) |
| 2 | table | ×10 | 10 | 8 | 8 | 0 |
| 3 | table | ×5 | 10 | 7 | 7 | 0 |
| 4 | table | ×3 | 10 | 6 | 6 | 0 |
| 5 | table | ×4 | 10 | 5 | 5 | 0 |
| 6 | table | ×6 | 10 | 4 | 4 | 0 |
| 7 | table | ×7 | 10 | 3 (7x7, 7x8, 7x9) | 3 | 0 |
| 8 | table | ×8 and ×9 | 19 | 3 (8x8, 8x9, 9x9) | 3 | 0 |
| 9 | mixed | Mixed 1–10 | 55 | 0 | — | — |
| 10 | speed | Speed challenge | 55 | 0 | — | — (DEFERRED, D7) |

Invariants (T1 tests): owned sums to 55, each core fact owned exactly once; gating sums to 45; intro = 10.
Ordering is pedagogical (×2 doubles, ×10 add-a-zero, ×5 half of ×10, then 3, 4, 6, 7, 8/9), not product size;
T10 validates it with Mikaela.

### D2 — Fact status, selection, level completion  — REVISED (fully executable)

**Attempt record.** `{ factId (canonical), correct, latencyMs, atMs, sessionId, sessionInferred, levelId | null,
source: 'draw' | 'reintroduce' | 'later-check' | 'confirm' | 'placement' }`. There is no retype step (directive 12),
so every attempt is a first answer.

**Counted attempt** (mastery evidence): an attempt with no earlier *miss of the same fact in the same session*.
So after a miss, that fact's later attempts in that session (reintroduce, later-check, draws) never count. Carried-over
queue items in a new session do count (genuinely spaced). Non-counted attempts still update selection priority.

Let `C` = counted attempts of fact f (chronological), `W` = last `windowSize` (4) of `C`, `cW` = correct in `W`.

**Status** (L1–L9; latency never used), evaluated in this order:
1. **new** — `|C| = 0`.
2. **mastered** — either
   - (a) fast-track: `|C| ≥ 2`, every attempt in `C` correct, correct attempts in ≥ 2 distinct sessions, and at least
     one of those sessions is not inferred; or
   - (b) `|W| ≥ 3` and `cW ≥ 3`, with correct attempts in `W` spanning ≥ 2 distinct sessions.
3. **struggling** — `|W| ≥ 3` and `cW ≤ 1`. Kid-facing label: "practicing".
4. **provisional** (only if `provisionalEnabled`) — in the most recent session that contains counted attempts of f:
   ≥ 3 correct counted attempts, no miss of f in that session, consecutive counted attempts separated by ≥ 8
   intervening questions (live) or ≥ 60 s (inferred), and that session is not inferred.
5. **learning** — otherwise.

Consequences (tested in T4): one slip does not drop mastery (C C C M → 3/4 → mastered). Two misses in W → learning.
Provisional confirms naturally: the next session's first counted attempt correct → 4 correct across 2 sessions → rule (b).
Provisional revokes naturally: next session's first counted attempt missed → correct attempts in one session only →
learning (never struggling, since cW = 3). Quick sessions (10 questions) cannot produce provisional.

Threshold math: rule (b) = 75% of the last 4, not 90% (90% of 4 = 4/4, rejected). For true accuracy p at a check with
|W| = 4: P(mastered) = p⁴ + 4p³(1−p) → 0.99 / 0.95 / 0.82 / 0.65 at p = 0.95 / 0.90 / 0.80 / 0.70.
With 2–3 counted attempts only fast-track or cW = 3/3 apply (p² / p³) — the simulator reports the real distribution.

`everMastered` (per fact): set true the first time status becomes mastered (not provisional). Never unset. Drives the
+5 XP (D6). Set silently by migration/inference.

**Question selection** (per question, in order):
1. **Level pool** = table facts of current level (L1: intro facts capped at `introShareMaxL1` of draws).
   **Review pool** = facts owned by earlier levels, not in the table. **Carried** = review facts whose status is learning,
   struggling or provisional.
2. **Queue** — due reintroduce / later-check / confirm items are drawn first, subject to steps 4–5. Queue items for facts
   outside current + earlier levels are discarded.
3. **Pool choice** — review with probability `reviewShare` (0.15), or `reviewShareWithCarried` (0.25) while carried facts
   exist; otherwise level pool.
4. **Carried-hard cap** — at most `carriedHardCap` (Quick 1 · Practice 2 · Rush 8) draws per session of carried facts with
   status learning or struggling (queue included). Over cap → draw from level pool instead.
5. **Success floor** — "likely-correct" = mastered, provisional, placement-likely, or ≥ 2 counted attempts with ≥ 75%
   correct. Before each question, if `likelyDrawn / questionsSoFar < successFloor` and any likely candidate exists in the
   allowed pools, the draw is restricted to likely candidates; a due queue item that is not likely waits (max 3 questions).
   If no likely candidate exists (e.g. first L1 session), the floor is not enforced.
6. **Weighted pick** within the chosen pool: weight = `statusWeight[status] × slowness`, slowness = 1.0 for mastered
   facts and facts with no correct attempts. Exclude the last 3 facts shown.
7. **Confirm scheduling** (Practice/Rush only, `provisionalEnabled`): after a fact's first correct counted attempt in the
   session, schedule one `confirm` item `confirmDelayRange` questions later, up to two per fact per session, only if the
   session has room.

**Table-level completion (L1–L8)** — evaluated at session end. G = gating facts of the level, n = |G|,
a = max(`allowanceMin`, ⌊`allowanceFraction`·n⌋), M = mastered in G, P = provisional in G, T = table facts.
- **R1** `M + P ≥ n − a` and `M ≥ ⌈(n − a)/2⌉` → L1 8/9 · L2 7/8 · L3 6/7 · L4 5/6 · L5 4/5 · L6 3/4 · L7 2/3 · L8 2/3.
- **R2** no fact in G is struggling.
- **R3** at most `maxStrugglingTableFacts` (1) struggling facts in T (intro and earlier-owned table facts included).
- **R4** first-answer accuracy ≥ `levelAccuracyMin` (85%) over the last `levelAccuracyWindow` (20) answers at this level
  with source draw or confirm. Fewer than 20 such answers → R4 fails.
- **R5** ≥ `minSessionsAtLevel` (2) finished sessions at this level.
"Most facts" = R1. "Allowed incomplete" = a (learning or provisional, never struggling). "Real sore spot" = struggling.

**Mixed level (L9) completion** — over answers at L9 with source draw or confirm: last `mixedWindow` (50) accuracy ≥
`mixedAccuracyMin`, spanning ≥ `mixedMinSessions` (3) sessions on ≥ `mixedMinDays` (2) calendar days, any mode, and at
most `mixedMaxStruggling` (2) struggling facts among all 55.

**Carry-over.** Nothing blocks progression beyond R1–R5. Unmastered facts become carried review.

**Per-level answer buffer** (contract): `SkillProgress.levelAnswers[levelId]` keeps the last 50
`{ correct, source, sessionId, dayKey }` — R4 and the L9 rule read only this.

### D3 — Personal records and wrong-answer flow  — REVISED
- **Wrong answer:** soft reveal ("7 × 8 = 56"), stays until the kid taps Next / presses Enter; the question ends; the miss
  counts; reinforcement is scheduled. No retyping. The session clock keeps running (real time).
- **Clock:** real elapsed gameplay time. When the app is hidden (visibilitychange), the clock pauses and the on-screen
  question is discarded (not counted, not logged); a new question is drawn on resume.
- Answer latency tracked per attempt, never used in records.
- **Key:** `skillId + levelId + mode + rulesVersion`.
- **Eligible:** run completed and accuracy ≥ `recordMinAccuracy` (90%) over answers with source draw or confirm.
- **Record = fastest eligible real elapsed time.** First eligible run at a key = baseline (no "new record" moment/XP/badge).
- Shown (play pace line, best time, record moments) only on completed levels and L10. On incomplete levels records are
  tracked silently; play shows fact progress instead; results show the time neutrally.
- v1 mode-only bests dropped.
- Accepted limitation: a fast wrong answer still skips a hard fact, bounded by the 90% gate (≤ 1 per Quick, ≤ 2 per
  Practice) and costing a miss plus later reinforcement. No penalty (directive 12).
- Accepted limitation: the adaptive mix eases as she improves, so later runs at a level are slightly easier.

### D4 — Level-up  — ACCEPTED
Automatic at session end when completion passes; celebrated; next level unlocked and made current. Kid can replay any
unlocked level. No skipping ahead except placement, inference, or parent unlock (long-press, not kid-discoverable).
Drop-down offer: if the first 2 sessions at a placement- or inference-recommended start level have accuracy < 70%,
the game offers (never forces) the level below.

### D5 — Placement warm-up  — REVISED
- Look: gameplay, no timer, no score, "warm-up run". Optional; retakeable; skipping = start L1. Slow-correct = correct.
- **Probe level k:** 2 gating facts — the hardest (largest product) + 1 random other gating fact. 2/2 pass · 0/2 fail ·
  1/2 → 1 tiebreaker random gating fact decides.
- **Staircase:** probe L1 → L3 → L5 → L7 → L8 while passing. On the first fail at k > 1: if k − 1 was jumped over,
  probe k − 1 (back-probe). Start = k − 1 if the back-probe fails, else k. L1 fail → start L1. L8 pass → start L9.
- **Cap:** `placementMaxQuestions` (12). If reached, start = lowest level not yet passed.
- Jumped-over levels below the start count as passed. Passed levels are **unlocked, not completed**: no XP, no badges.
  They can later be completed by play for normal rewards (directive 10).
- Probed attempts are real attempts (source placement, live session). Unprobed gating facts of passed levels + all
  intro facts get a `placementLikely` flag used only by the success floor; cleared on the fact's first counted attempt.

### D5b — Start level for existing v1 profiles (Mikaela)  — PROPOSED
1. Take v1 `recentAttempts` (≤ 8 per fact) with `atMs` within `inferenceMaxAgeDays` (30) of migration. Older → ignored.
2. Reconstruct sessions: all attempts sorted by time; a gap ≥ 30 min starts a new session. Mark `sessionInferred: true`,
   `source: 'draw'`, `levelId: null`. Migration only; v2 IDs authoritative afterwards.
3. Recompute status under D2 (fast-track and provisional cannot come from inferred-only evidence).
4. Per table level L1–L8 (n, a as in D2):
   - **Evidenced:** ≥ n − a gating facts have ≥ `inferenceMinAttemptsPerFact` (3) counted attempts.
   - **Passes:** evidenced, R1 with M ≥ n − a (no provisional), R2, R3, and counted accuracy on gating facts ≥ 85%.
   - **Clearly fails:** evidenced and (≥ 2 gating facts struggling, or counted accuracy on gating facts < 70% over ≥ 10
     counted attempts).
5. Walk L1 → L8; s = first level that does not pass.
   - L1 not evidenced → **insufficient** → warm-up.
   - s not evidenced and some level > s passes → **insufficient** → warm-up.
   - s clearly fails and some level > s passes → **contradictory** → warm-up.
   - Otherwise recommend s (L9 if L1–L8 all pass).
6. Recommendation: unlock L1..s, current = s, set `everMastered` silently; no XP, badges, records or celebrations.
   Offer the warm-up as optional recalibration; allow any lower unlocked level.

### D6 — Player progression  — REVISED
"Progress level" = the lowest unlocked level not yet completed (her frontier).
- **Per correct answer:** +1 on the progress level (and any uncompleted level); on completed levels +1 per 5 correct.
- **Completion bonus:** Quick 10 · Practice 25 · Rush 100. On completed levels × 0.2 (2 · 5 · 20), except the first
  finish of each level+mode, which pays full. Perfect session (100% of draw/confirm answers) +50% of the bonus paid.
- **One-time events:** fact `everMastered` becomes true +5 · level completed by play +100 · badges (no XP).
- **Record beaten** (not baseline) on the progress level only: +25, at most once per calendar day overall.
- Placement, inference and migration: 0 XP.
- **Player level:** XP to reach level L = 25·L·(L−1) (L2 = 50, L5 = 500, L10 = 2 250, L20 = 9 500, L30 = 21 750).
  Titles: 1 Rookie · 5 Number Ninja · 10 Math Racer · 20 Math Wizard · 30 Math Legend.
- **Badges (one-time):** First Run (finish any session) · Hot Streak (10 correct in a row) · On Fire (25 in a row) ·
  Perfect Session · Level Mastered ×N (level completed by play) · Comeback Kid (a fact missed in one session is answered
  correctly as its first counted attempt in a later session) · Record Breaker (5 records beaten) · 3-Day Streak ·
  Speedster (beat own record on a completed level).
- XP/badges never read or write academic mastery fields (they read status and events only).
- Sim check: XP per minute on the progress level must exceed replaying any completed level, every mode.

### D7 — Level 10 speed challenge  — DEFERRED
Mixed 1–10 Quick at ≥ 90% accuracy against targets from her own L9 median answer time (bronze 1.0× · silver 0.85× ·
gold 0.7×). Not built this sprint.

### D8 — Process  — ACCEPTED
See PLAN.md "Operating loop". Learner simulator (T-SIM) runs before thresholds are frozen.

### D9 — Canonical fact identity  — ACCEPTED (frozen in T0)
- `factId = \`${min(a,b)}x${max(a,b)}\``, integer factors 1–12, base 10, no leading zeros, lowercase `x`.
  `parseFactId` must reject non-canonical strings ("07x8", "8x7").
- Orientation lives only in question metadata (`a`, `b`) and optional attempt analytics; never splits mastery.
  Generator presents either orientation ≈ 50/50.
- Every store/lookup uses the canonical ID: mastery, queue, placement, levels, records, migration (re-canonicalize and
  merge stray keys).
- Generic hook: `MathSkill.conceptIdFor(question)`; commutative normalization is multiplication-specific.
- Question requests with target facts must be honored exactly; the band/stretch fallback in `resolvePool` is removed (T5).
- Tests: 100 ordered pairs 1–10 → 55 IDs; answering 8×7 updates `7x8`; migration merges a stray `8x7`.

---

## C. Review dispositions

### Round 1
| # | Finding | Disposition |
|---|---|---|
| B1 | Mixed levels instant/unfinishable | L9 rolling rule (D2) |
| B2 | L1 too big; typo cost; no escape hatch | New ladder + gating/intro (D1), 3-of-4 (D2), parent unlock (D4) |
| B3 | Focus vs owned undefined | Table / owned / gating / intro (D1), success floor (D2) |
| B4–B5 | T0 freeze + barrels | PLAN T0 ownership + compat |
| B6 | Stale SW wipes save | New key, v1 backup, SW cache bump |
| B7 | Queue bypasses level scope | Queue filtering (D2 step 2) |
| B8 | Mikaela's start level | D5b |
| S | Miss-hold exploit, first-run record, farming, pace pressure, typo → struggling, placement pre-credit | D3, D6, D2, D5 |

### Round 2
| # | Finding | Disposition |
|---|---|---|
| 1 | L9 broken for Quick players | Rolling any-mode rule; threshold PENDING-SIM |
| 1 | Pace estimates optimistic | Replaced by simulator output |
| 2 | Speed leaks via old exports, slowness on mastered, records on incomplete levels | Old exports delegate to `factStatus` (T4); slowness 1.0 for mastered; records hidden on incomplete levels |
| 3 | Placement order bug, unprobed levels, over-placement, floor after placement | Back-probe before stop; jumped = passed; hardest + random probe; `placementLikely` |
| 4 | Queue skips floor; carried facts too hard | Floor covers queue; carried-hard cap. ×6 kept (owner) |
| 5 | Record XP farm, per-minute farm, `everMastered` missing | Progress-level only + daily cap; replay per-correct ÷5; `everMastered` |
| 6 | Visibility abuse, guess-then-copy, reinforcement inflates gates | Discard question on hide; no retype (owner); gates use draw/confirm only. +5 s penalty rejected (owner) |
| Math | Single miss dropped mastery; reinforcement counted as evidence | "Last correct" removed; counted-attempt rule |
| Plan | Stub/barrel ownership, contract gaps, T3↔T4 | PLAN T0 revised; events typed in T0 |
| 7 | L1 first level-up ~2× others | Gating ×2 / intro ×1 (D1) |
| 8 | 2-session rule | Kept for mastery; provisional mastery adopted for visible progress; on/off PENDING-SIM |
| 9 | Inference: 70% = perfection on small levels; stale data; "clearly fails" undefined | n − a facts with ≥ 3 attempts; 30-day cutoff; exact clear-fail rule (D5b) |
