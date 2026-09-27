# Math Rush V3 — Plan

Status: **WAVE 2 COMPLETE.** Division, Fractions, and Algebra plugins are on `v3/integration`. The kid app still loads the V2 profile. Shared session integration and finished V3 screens are not started.

`gatingConceptIds` is the V3 curriculum contract. Multiplication completion still adapts through `gatingFactIds` until evidence is stored by concept id. That removal belongs to the engine and persistence integration. New skills do not use the fact-id path.

V2 stays on its own line ([docs/v2/PLAN.md](../v2/PLAN.md)). V3 work lands on a new branch. It does not retune V2, and it does not deploy over the app kids are testing.

---

## Roles

One architecture reviewer freezes the Wave 0 contracts. After that, tracks run in parallel. Each track gets a fresh verifier before it merges. Integration waits until the tracks it depends on have passed.

A track that needs a contract change stops and reports. It does not edit the frozen types.

---

## Tracks

| Track | Owns | Does not own |
|---|---|---|
| A. Design system | Stitch → tokens → primitives → game components | Learning logic, persistence |
| B. Curriculum platform | Registry, concept model, skill plugin contract, question and distractor types | UI |
| C. Division | Curriculum, generator, distractors, tests | Home, session shell |
| D. Fractions | Curriculum, visual and choice questions, distractors, tests | Home, session shell |
| E. Algebra proof | One-step equations plugin only | Any other algebra |
| F. Migration | V2 → V3 map and fixtures | New curricula |

---

## Waves

```text
Wave 0A  Adversarial review of the abstractions (no code)
              │
Wave 0B  Code the frozen contracts, only after the owner accepts 0A
              │
Wave 1   Design system  ·  Curriculum core  ·  V2→V3 migration
              │
Wave 2   Division  ·  Fractions  ·  Algebra proof
              │
Wave 3   Question renderer + adaptive-engine integration
              │
Wave 4   Home, skill hub, Play, Results, Progress
              │
Wave 5   Leaderboard + race UI on mock data
              │
Wave 6   Migration rehearsal + browser / PWA regression
              │
Wave 7   Kid test: Mikaela, Adrian, friends
```

| Wave | Gate |
|---|---|
| 0A | **Complete.** Findings accepted, O5 closed, consistency check clean. |
| 0B | **Contracts in place.** Types, instance suppression, allowance clamp, household stamp, and the per-skill XP frontier are in the engine with tests. Multiplication behavior is unchanged. The app still loads the V2 profile. No new skill plugin. No UI. Social types stay out of the engine. |
| 1 | Tokens and components render without skill code. Registry loads Multiplication only. A V2 fixture becomes a V3 profile with progress intact, in tests. |
| 2 | Each new skill generates questions, grades them, and emits distractors. Tests do not boot the app. |
| 3 | One play loop runs a scripted session for every shipped skill. XP and records still do not write academic state. |
| 4 | Home shows a different continue-path for a Grade 3 profile and an older profile. Phone and desktop. |
| 5 | Social screens render from fixtures and perform no network I/O. |
| 6 | Upgrade from a real V2 save in the browser. PWA name is Math Rush. V2 key still present afterward. |
| 7 | Human. Findings become new decisions, not silent threshold edits. |

---

## Working rules

- V2 documents and V2 mastery numbers are read-only during V3.
- No cloud account, no realtime room, no new learning formula inside a skill plugin.
- Green tests for the track before a verifier is asked to look.
- Track A reads `docs/v3/reference/stitch/`. It does not drop that HTML into `src/ui/screens`.

---

## Wave 0A outcome

The review's findings are accepted with the refinements now written through this set. O5 is closed: one status model, instance-scoped suppression, completion clamp, difficulty outside status.

The consistency check looks only for contradictions among these decisions. It does not reopen O5 and it does not start a plugin.

## Wave 0B

Implement the frozen contracts and the two platform behaviors, with tests:

- `instanceKey` required on an evidence-eligible question. Multiplication sets it to the canonical concept id. A miss suppresses that instance only. Regression: multiplication evidence unchanged; `3/8|5/8` does not suppress `7/12|11/12`; repeating the missed instance still follows the existing rule.
- Allowance clamp. Gating sizes 1, 2, 3, and the real multiplication levels. Multiplication outcomes unchanged.
- Learner-owned `skills`, `player`, `records`, `rawLog`, `sessionLog`, `lastActivePath`, and pending reinforcements. Household holds the roster, the active learner pointer, and the migration stamp only.
- Migration stamp includes source, completion, and migrated learner id. Deleted-learner case does not rerun migration.
- Existing `AnswerType` names. `LevelDef` gains concept fields and keeps `index`, `kind`, and `title`. Multiplication fact lists stay until the ladder is proven on concept ids.
- `EvidenceMarksView`. Distractor context is not a full profile.
- XP frontier is per skill. Daily record bonus is per learner. The record is saved even when the bonus is spent.

Do not build Division, Fractions, Algebra, or UI in this wave. V2 stays runnable.
