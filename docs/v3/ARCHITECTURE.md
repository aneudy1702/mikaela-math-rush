# Math Rush V3 — Architecture

Status: **APPROVED FOR WAVE 0A REVIEW.** Shapes below are the direction the reviewer must attack. They are not code, and they are not frozen, until the owner accepts the 0A findings.

V2 already has a skill interface, a question type, and a single optional concept hook. V3 promotes that hook from "the multiplication fact this question is about" into the unit of mastery for every skill. It does not replace the learning algorithm.

Authoritative V2 rules remain [docs/v2/DECISIONS.md](../v2/DECISIONS.md).

---

## What V2 is today

The engine is one multiplication skill.

- Mastery, selection, and level completion are keyed by a **canonical fact id** (`7x8` covers both 7×8 and 8×7).
- `MathSkill.conceptIdFor` returns that one id. It is optional.
- `Question` already carries `skillId`, a prompt, an answer type, and `correctAnswer`. It does not carry concept ids.
- Answer types already include `numeric`, `multiple-choice`, `fraction`, `text`, and `visual-selection`. The live play screen is still the numeric keypad.
- `LevelDef` is multiplication-shaped: tables, table facts, owned facts, gating facts, intro facts.
- The profile holds **one** `SkillProgress`, plus records, the raw log, and `player` XP. Storage key: `mikaela-math-rush:learner-v2`.
- Curriculum, learning, and progression are separate. Progression reads learning output. Learning does not generate questions.

V3 keeps that split.

```text
Curriculum   what to learn next     skill → level → concepts
Learning     what to practice now   concept mastery, inside the current level
Progression  why to continue        XP, player level, badges, records
```

Progression still never writes academic state. Learning still never generates questions. A skill plugin generates questions and distractors.

---

## The abstraction to freeze first

A **concept** is the smallest thing the learning engine tracks.

```text
multiplication.fact.7x8
division.fact.56÷7
fractions.compare.same-denominator
algebra.one-step.addition
```

A question is a way of testing concepts. `conceptIds` is an array so a later word problem can exercise more than one. V3 questions may still list a single concept.

```ts
interface ConceptRelationship {
  conceptId: string
  type: 'inverse' | 'prerequisite' | 'related' | 'equivalent'
}

interface LearningConcept {
  id: string
  skillId: string
  relationships?: ConceptRelationship[]
  metadata?: Record<string, unknown>
}

interface LevelDef {
  id: string
  skillId: string
  conceptIds: string[]
  gatingConceptIds?: string[]
  introConceptIds?: string[]
}

interface Question {
  id: string
  skillId: string
  conceptIds: string[]
  prompt: QuestionPrompt
  answer: AnswerDefinition
  difficulty: number
  metadata?: Record<string, unknown>
}
```

**Levels contain concepts. Concepts do not contain levels.** (O7)

A concept has one mastery record. Listing it on a mixed level or a review level does not copy that record. Multiplication already works this way in spirit: each core fact has one owner level for gating, and the mixed level practices all of them. `gatingConceptIds` and `introConceptIds` are how that owner/gating/intro split stays expressible. V2 behavior for those sets does not change.

Relationships are generic. (O8)

```text
division.fact.56÷7  inverse →  multiplication.fact.7x8
```

There is no `relatedMultiplicationFactId`. The session engine does not branch on `inverse` unless a future selection strategy explicitly reads relationships. Division's plugin may use the link when it builds distractors. The engine stays skill-blind.

Wave 0B turns this sketch into types that match the existing `Question` / `Answer` / `Result` contracts, instead of a second parallel question model. `conceptIdFor` becomes required and may return every concept the question exercises. Multiplication's canonical-id rule (D9) stays: `8×7` and `7×8` are one concept.

### What "one concept" means (O5, not solved here)

| Skill | One concept is | Example |
|---|---|---|
| Multiplication | One deterministic canonical fact | `multiplication.fact.7x8` |
| Fractions | A strategy, practiced by many instances | `fractions.compare.same-denominator` covers both 3/8 vs 5/8 and 7/12 vs 11/12 |
| Algebra | A procedure, across unlimited equations | `algebra.one-step.addition` covers both `x + 4 = 11` and `x + 17 = 39` |

V2's status rules were written for the first row. A correct easy fraction and a missed harder fraction currently update the same concept. That may be what we want. It also changes what "3 of the last 4" is evidence of.

The 0A reviewer must answer:

> Does the existing V2 evidence/status model still mean the same useful thing when the concept is a strategy instead of a fixed fact?

If yes, one learning policy covers all three skills. Question `difficulty` can still steer which instance is picked, without becoming a second mastery axis.

If no, stop. The smallest fix is a platform-level evidence policy, for example `classify(attempts) → status`, with Multiplication as the existing V2 policy. Do not add that type unless the review shows the single policy fails. A plugin must not invent its own mastery score or hidden evidence rules.

Creating thousands of fraction concepts to fake fact-level granularity is not the alternative on the table. The open idea, if a single concept is too coarse, is concept plus instance difficulty, still inside one status model.

### What stays algorithmically

For Multiplication, these V2 behaviors move onto concepts without a new formula:

- Fact status (`new` / `learning` / `mastered` / `struggling`)
- Counted attempts, spacing, and the evidence window
- Level-scoped selection, review share, success floor, carried review
- Table and mixed completion rules R1–R5
- Records keyed by skill + level + mode
- XP, player level, badges
- Raw attempt history as the source of truth

Latency still does not decide mastery.

### What each new skill must supply

A skill plugin owns:

- its concept catalog and level ladder
- question generation
- answer evaluation
- `generateDistractors(question, learner)`

Distractors are part of the learning engine. A wrong choice should be a plausible misconception. (O9)

```ts
interface AnswerChoice {
  id: string
  value: AnswerValue
  misconceptionId?: string
}
```

```text
7 × 8
  49  square-neighbor
  54  nearby-fact
  64  8x8
  56  correct

x + 4 = 11
  15  added-instead-of-subtracted
   7  correct
   4  copied-constant
```

The raw attempt stores the selected choice id, whether it was correct, and `misconceptionId` when the choice had one. V3 does not build a teacher view on top of that.

`3x + 5 = 20` is out of V3 scope (two-step).

Level completion for Multiplication stays V2 rules R1–R5, read off `gatingConceptIds`. Whether Fractions and Algebra can use that same status to decide completion is part of O5, not a per-plugin invention.

---

## Curriculum hierarchy

```text
Grade band
  └── Domain
        └── Skill
              └── Level
                    └── Concepts
```

Grade band is metadata for recommendations. A younger learner can move ahead. An older learner can practice earlier material. The home screen reads grade to suggest a path. It does not hide a skill because of grade.

`LevelDef` cannot stay a list of times-table fact ids if Division, Fractions, and Algebra share it. The concept list above is the replacement. The multiplication adapter fills today's gating, intro, and owned sets from `gatingConceptIds` and `introConceptIds` so V2 tests still describe the same ladder.

---

## Profiles

The device stores a household roster. The learning engine receives one learner at a time. (O2)

```ts
interface LocalLearnerIdentity {
  id: string
  displayName: string
  grade?: number
  avatarId?: string
}

interface LearnerProfile {
  identity: LocalLearnerIdentity
  /** Last skill and level this learner played. Not a privileged academic path. */
  lastActivePath?: { skillId: string; levelId: string }
  skills: Record<string, SkillProgress>
  player: {
    xp: number
    level: number
    badges: Badge[]
  }
}
```

No password, email, parent account, or sync fields exist on these types.

`player` is global across skills **for that learner**. It is not global across the household. Academic progress and records stay per learner, per skill. A Division time never compares with a Multiplication time, and Mikaela's XP never appears on Adrian's profile.

Switching learners is a load of a different profile. It is not a merge.

---

## Answer interactions

```ts
type AnswerType =
  | 'multiple-choice'
  | 'numeric-input'
  | 'fraction-choice'
  | 'visual-choice'
```

| Type | V3 |
|---|---|
| Multiple choice | Default for fact-like skills. |
| Visual choice | Required for the early fraction levels. |
| Fraction choice | Used where the choice itself is a fraction, if visual choice is the wrong shape. Wave 0 picks one representation and deletes the duplicate. |
| Numeric input | Still supported. Not the default. |

The renderer is a registry of answer components keyed by `AnswerType`. Play does not switch on `skillId`.

---

## Home, without new learning rules

Home reads:

- the active learner's name, grade, and player level
- `lastActivePath` for **Continue**
- grade plus skill progress for a separate **Recommended next** row
- the skill registry for everything else (start, explore, coming later)

"Coming later" skills (Exponents, Geometry, and anything else we want visible) are registry entries with no plugin. They render. They do not generate questions.

---

## Social contracts, unused by the engine

Social types are not part of the engine freeze. They live outside it, in `src/social/` (contracts and fixtures only), and only when the mock screens need them. Session, learning, curriculum, and persistence do not import that folder. See [SOCIAL_FUTURE.md](SOCIAL_FUTURE.md).

---

## Persistence boundary

V3 uses a new storage key and leaves the V2 blob in place as a backup, the same pattern V2 used for V1.

The persistence rule carries forward: no path silently changes mastery, XP, badges, records, or level position. A failed or partial migration surfaces a notice. Detail: [MIGRATION.md](MIGRATION.md).

---

## Wave 0 exit

Wave 0A is done when the reviewer has answered the questions in [PLAN.md](PLAN.md), including O5, and the owner has accepted or revised the findings.

Wave 0B is done when those accepted shapes exist as types: concept, level membership, relationships, question, answer choice, misconception on the attempt, household roster, and the V2→V3 migration map. Multiplication is described entirely in those types without a behavior change. Social types are not required for that exit.
