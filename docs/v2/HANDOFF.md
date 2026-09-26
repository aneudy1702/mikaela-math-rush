# Math Rush V2 — Session Handoff

Read this first, then [DECISIONS.md](DECISIONS.md) (rev 4, owner-approved, authoritative) and [PLAN.md](PLAN.md)
(ticket graph + per-ticket carry-over). Evidence for every threshold: [SIM-REPORT.md](SIM-REPORT.md).

## Where things stand (2026-09-26)

- Branch `v2/integration` (pushed) — engine complete through **T7**. 344 tests green, build green, lint = 13
  pre-existing warnings in `App.tsx`/screens only.
- PR: https://github.com/aneudy1702/mikaela-math-rush/pull/2 (`v2/integration → main`, ready for review).
  **Do not merge until T8/T9 are done** — merging to `main` deploys to production (Vercel) and would migrate
  Mikaela's save while the old screens are still live.
- Done + independently verified + merged: T-SIM, T-SIM2, T0, T0.1, T0.3, T1, T2, T3, T4, T5, T6, T7.
- **T8 was interrupted mid-build** (usage limit). Partial, uncommitted work may exist in
  `.claude/worktrees/agent-a952b5b79a58aabb4/` (branch `worktree-agent-a952b5b79a58aabb4`) — it had written React code
  and was starting CSS. Either salvage it (`git status` there) or restart T8 from `v2/integration`.

## Remaining work

| Ticket | What | Owns | Gate |
|---|---|---|---|
| **T8** | App wiring + screens: Home (ladder, D10 marks, XP bar, records on completed levels, notices banner, drop-down offer, parent long-press unlock, gentle dismissible Practice nudge), Play (reveal card — tap card / "Got it" / Enter, never "Next"; hide/resume; read-only/storage-unavailable banner), Results (level-up, XP breakdown, badges, "Baseline set"), Placement warm-up, one-time start-level inference for migrated profiles. Uses `LevelSessionEngine`; legacy `SessionEngine` no longer used by the app. | `src/App.tsx`, `src/screens/**`, `src/components/**`, `src/index.css`, UI tests | Owner reviews screenshots, desktop + 375 px |
| **T8.1** | Remove legacy v1 code/fields: legacy `SessionEngine`/`QuestionOrchestrator`/`selectNextFact`/stretch bucket, speed-weighted mastery helpers, deprecated profile fields (`facts`, `bestTimeMsByMode`, `bestStreakByMode`, `gameXp`), dead `backup-required` reason, legacy placement exports. Also small follow-ups: T2 `buildSessionLogEntry` rejects `kind !== 'play'` + double-apply test; T3 test pinning `'v1-inferred-'` to `INFERRED_SESSION_PREFIX`; optional T1 L9/L10 `tables: [1..10]`. | engine files incl. `persistence/**`, contracts (deprecated fields only) | Verifier; no behavior change; migration of v1 saves must still work |
| **T9** | End-to-end validation in the browser: seed a v1 profile → loads as v2, v1 blob untouched; inference/warm-up ≤ 12 questions; play L1 → level-up; per-level records with "Baseline set"; hidden tab pauses clock; notices; 375 px; no console errors; `npm run build`. | verifier only | Owner approves merging PR #2 + deploy |
| **T10** | Kid test with Mikaela (human): does she get an inferred start level, where she struggles, whether level-ups feel earned, which modes she picks (Quick-only is slow — see SIM-REPORT), whether the ladder order matches her difficulty. | owner | Findings → new decisions |

The full T8 builder prompt is in the conversation that produced this file; it is reproducible from PLAN.md T8 +
this table + the "Carry to T8" list below.

## Carry to T8 (from verifiers — all must be honored)

- Construct `LevelSessionEngine` when play starts (clock starts at construction); clone `getProfile()`/`checkpoint()`
  before React state; never pass `questionSource`/`adoptProfile` (`@internal`).
- Save at `finish()`/`abandon()`, right after `hide()`, and when `AnswerOutcome.saveRecommended` (every 10 answers).
  Feed each `SaveResult` to `engine.reportSaveResult` (returns `PersistenceAlert[]`); show all of
  `persistenceAlerts()`, `lastLoad().notice`, `pendingNotices()`; call `acknowledgeNotices()` only after shown.
  `saved-trimmed` is not persisted as a notice — show it from the `SaveResult`.
- Call `finish()` after the last reveal is dismissed. A reveal survives hide/resume (`resume()` returns null while a
  reveal is pending).
- `inferStartLevel(profile, now, store.lastLoad())` only when `profile.migration` exists and no start decision yet;
  run once. Recommendation = unlock + suggestion, never XP/badges/celebration.
- `dropDownOffer(profile)` — offer only; persist dismissal in a separate UI-prefs key, not the profile.
- Placement: keep the probe from `nextProbe` in state; `placementRawAttempt` in a `kind: 'placement'` session;
  `applyPlacementResult` after placement attempts are folded into evidence; placement never earns anything.
- L10 is deferred: never render it, never unlock it (including parent unlock).
- "Baseline set" for `record.isBaseline`; pace line / best time only on completed levels; time shown neutrally.
- Use `playerLevelInfo(xp)` for the XP bar; `player.xp` is the only XP source (`gameXp` is dead).
- Contracts and barrels are frozen for builders; the Lead adds barrel lines in housekeeping commits.

## How we work (the owner's loop — keep it)

- **Owner (Aneudy) + Lead decide**; DECISIONS.md is the record. Owner signs off at gates (after each wave, T7, T8
  screenshots, before merge/deploy). Don't retune thresholds before the kid test unless a genuine contradiction appears.
- **Builders**: one agent per ticket, isolated git worktree off `v2/integration` (`git merge --ff-only v2/integration`
  first), owned files only, stop-and-report instead of inventing rules or editing contracts.
- **Checker**: a fresh-context agent per ticket (never the builder) verifies spec fidelity clause by clause, scope
  (diff vs owned files), green (test/lint/build, no new warnings), test quality, and does a trial merge. Fixes go back
  to the same builder; re-verification can reuse the same checker.
- **Lead** merges only after PASS (`git merge --no-ff`), runs tests/build on the merged branch, does small
  housekeeping commits (barrel exports, doc fixes), records rulings in DECISIONS.md, pushes `v2/integration`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push to `main` or deploy
  without the owner.

## Owner preferences learned this session

- Wants decisions explained with tradeoffs and a recommendation; is the "second brain", not the implementer.
- Hard rule: persistence must never silently alter/roll back mastery, XP, badges, records, or levels — always a
  visible notice.
- Speed never gates mastery before L10; slow-but-correct kids must progress like fast ones (D12 invariant, enforced
  by `tools/sim` and `tools/product-sim`).
- Kid UX: gentle mistakes (reveal card, no retype, no "Next"), visible progress every session, no synthetic time
  penalties, no retroactive awards.
- Watch usage: batch checks, reuse checkers for re-verification, prefer one checker for several small tickets.

## Useful commands

- Tests / lint / build: `npm test`, `npm run lint`, `npm run build`. Dev server: `npm run dev` (port 43127;
  `.claude/launch.json` config `dev`).
- Reference simulator: `node tools/sim/run.ts` (~90 s; exits non-zero if D12 fails).
- Product-code simulator: `node --import ./tools/product-sim/resolve-hooks.ts tools/product-sim/run.ts` (~130 s).
