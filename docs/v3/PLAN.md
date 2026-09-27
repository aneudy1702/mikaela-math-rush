# Math Rush V3 — Plan

Status: **WAVE 0A IS THE NEXT STEP.** No V3 implementation, including contract code, starts before the owner accepts the 0A review.

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
| 0A | A fresh reviewer answers the questions below, including O5. Owner accepts or revises. No code. |
| 0B | Accepted shapes exist as types. Multiplication is expressible with no behavior change. Social types are not in the engine. |
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

## Wave 0A questions

The reviewer attacks the docs. They do not invent a second mastery system to be helpful, and they do not start a plugin.

1. Does the concept abstraction generalize learning semantics, or only the TypeScript shapes?
2. Can one concept appear in more than one level without a second mastery record?
3. Can Fractions reach mastered on repeated easy variants while failing harder instances of the same concept?
4. Can Algebra do the same?
5. Is question-instance difficulty needed inside evidence, or is it enough as a generator input, without a second mastery system?
6. Can a V2 → V3 migration replay after V3 has newer progress?
7. Can two local profiles leak progress, records, or XP into each other?
8. Does any shipped skill require Play, Results, XP, Records, or Session to branch on `skillId`?
9. Do distractor and misconception details stay generic, with no curriculum rules inside the engine?
10. Does any Stitch-derived UI component compute academic or XP state, or does it only render engine output?

Also still in scope: a skill that cannot plug into the session loop, a migration that recomputes mastery instead of mapping it, and any social feature that implies a backend.

## After 0A

Bring findings and proposed responses to the owner before Wave 0B or any other V3 implementation. V2 stays runnable the whole time.
