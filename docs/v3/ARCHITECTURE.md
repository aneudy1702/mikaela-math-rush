# Math Rush V3 — Architecture

Status: **WAVE 0A COMPLETE.** The shapes below are the Wave 0B contracts. The running save is still the V2 profile until migration. New skill plugins and UI are not this wave.

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
  index: number
  kind: 'table' | 'mixed' | 'speed'
  title: string
  conceptIds: string[]
  gatingConceptIds: string[]
  introConceptIds: string[]
}

interface Question {
  id: string
  skillId: string
  conceptIds: string[]
  /** Semantic instance. Required. Independent of choice order and other presentation. */
  instanceKey: string
  difficulty: number
  prompt: QuestionPrompt
  answerType: AnswerType
  correctAnswer: unknown
  choices?: AnswerChoice[]
  metadata?: Record<string, unknown>
}
```

`AnswerType` is the list already in the engine: `numeric`, `multiple-choice`, `fraction`, `text`, `visual-selection`. V3 does not rename these. `multiple-choice` is the default. `fraction` is a stacked fraction choice. `visual-selection` is a diagram tile. `numeric` stays available and is not the default. `text` stays in the union because it already exists; no V3 skill needs a new member to ship.

`LevelDef` keeps `index`, `kind`, and `title` because level order, mixed-versus-table completion, and the ladder UI read them. Multiplication-only lists (`tables`, `tableFactIds`, `ownedFactIds`, and the fact-id copies of gating and intro) stay until evidence is keyed by concept id. Until then, table completion still reads `gatingFactIds`. `gatingConceptIds` is that same membership written as concept ids, and the allowance clamp uses that count. Wave 0B adds the concept fields. It does not delete the fact fields in the same step.

Owned facts in V2 are gating plus intro. That reconstruction stays valid, so a separate `ownedConceptIds` field is not required.

**Levels contain concepts. Concepts do not contain levels.** (O7)

A concept has one mastery record. Listing it on a mixed level or a review level does not copy that record. Multiplication already works this way in spirit: each core fact has one owner level for gating, and the mixed level practices all of them. `gatingConceptIds` and `introConceptIds` are how that owner/gating/intro split stays expressible. V2 behavior for those sets does not change.

Relationships are generic. (O8)

```text
division.fact.56÷7  inverse →  multiplication.fact.7x8
```

There is no `relatedMultiplicationFactId`. The session engine does not branch on `inverse` unless a future selection strategy explicitly reads relationships. Division's plugin may use the link when it builds distractors. The engine stays skill-blind.

Wave 0B turns this sketch into types on the existing `Question` / `Answer` / `Result` contracts. There is no second question model and no `AnswerDefinition`. `question.conceptIds` lists every concept the question exercises. Multiplication's `conceptIdFor` still returns the canonical fact id (`7x8`) because live evidence and selection are keyed that way. `conceptIds` and `instanceKey` use `multiplication.fact.7x8`, so `8×7` and `7×8` stay one instance. Suppression reads `instanceKey` and falls back to `factId` when an older attempt has none.

### One status model (O5, closed)

| Skill | One concept is | Instance |
|---|---|---|
| Multiplication | One canonical fact | `instanceKey` equals the concept id, so `7×8` and `8×7` stay one instance |
| Division | One fact, linked to multiplication by an `inverse` relationship | the division fact's own instance |
| Fractions | A strategy | `3/8\|5/8` and `7/12\|11/12` are different instances of `fractions.compare.same-denominator` |
| Algebra | A procedure | `x+4=11` and `x+17=39` are different instances of `algebra.one-step.addition` |

`instanceKey` names the semantic question. It does not include choice order or other presentation.

V2 suppresses later attempts of the same fact after a miss in the session, because the reveal showed that fact. V3 suppresses later attempts of the same `instanceKey`. A miss on `3/8|5/8` does not suppress `7/12|11/12`. Re-presenting the missed instance still follows the existing replay rule.

There is no `EvidencePolicy` type. Status order, the window, spacing, and "latency never decides mastery" stay the V2 rules, applied to concepts. Difficulty is a generation and selection input. Mastery math does not read it. Each strategy plugin, when it is built, needs deterministic tests that its generator covers the intended instance range. That is not a second evidence axis. If a concept later proves too coarse, that is a new decision.

### Level completion clamp

The existing allowance is `max(allowanceMin, floor(allowanceFraction × n))`. V3 clamps it:

```ts
allowance = Math.min(existingAllowance, Math.max(0, gatingConceptCount - 1))
```

A level with one gating concept has allowance 0, so that concept must be mastered. Multiplication's real ladders stay on the same allowance they have today. Tests cover gating sizes 1, 2, and 3, plus those real levels.

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
- `generateDistractors(question, context)` where `context` is the smallest explicit slice the plugin needs (the concepts on the question and their status). It is not a `LearnerProfile`. The plugin does not read another skill, the raw log, XP, or records to invent a private score.

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

Level completion stays rules R1–R5, with the allowance clamp above. While multiplication evidence is keyed by fact id, R1 reads `gatingFactIds`. `gatingConceptIds` is that same set in concept-id form. New skills use it once their evidence is keyed that way. A plugin does not supply its own completion score.

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

`LevelDef` gains concept membership beside the existing multiplication fact lists. Those fact lists remain until Multiplication's ladder tests pass on the concept fields alone. `kind` still selects table rules versus mixed consolidation.

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

// TypeScript name: LearnerProfileV3, beside the live V2 LearnerProfile.
interface LearnerProfile {
  identity: LocalLearnerIdentity
  lastActivePath?: { skillId: string; levelId: string }
  skills: Record<string, SkillProgress>
  player: PlayerProgress
  records: Record<string, PersonalRecord>
  rawLog: RawLog
  sessionLog: SessionLogEntry[]
  pendingReinforcements: PendingReinforcement[]
}

interface HouseholdMigrationStamp {
  source: 'learner-v2'
  completed: true
  completedAtMs: number
  migratedLearnerId: string
}

interface Household {
  activeLearnerId: string | null
  learners: Record<string, LearnerProfile>
  migration?: HouseholdMigrationStamp
}
```

No password, email, parent account, or sync fields exist on these types.

No gameplay lives in `Household`. It holds only `activeLearnerId`, the roster, and `migration`. Skills, XP, badges, records, attempts, sessions, and pending practice sit on the learner. Switching learners loads a different profile. It does not merge.

### XP frontier (O11)

Practice-versus-replay classification uses `progressLevelId` of the **skill being played**. Finished Multiplication does not mark new Division as replay. Finished Division does not mark Algebra as replay.

The resulting XP is added to that learner's `player`. The daily record XP bonus stays once per learner per calendar day (`lastRecordXpDayKey`). A later record the same day is still stored. Only the bonus is skipped.

---

## Answer interactions

```ts
type AnswerType =
  | 'numeric'
  | 'multiple-choice'
  | 'fraction'
  | 'text'
  | 'visual-selection'
```

| Type | V3 |
|---|---|
| `multiple-choice` | Default. |
| `visual-selection` | Diagram tiles, including early fraction levels. |
| `fraction` | The choice itself is a stacked fraction. |
| `numeric` | Still supported. Not the default. |
| `text` | Already in the engine. No V3 skill requires it. |

The evidence component receives academic state and does not derive it:

```ts
interface EvidenceMarksView {
  marks: 0 | 1 | 2 | 3
  mastered: boolean
}
```

V2's `MASTERED_DISPLAY_VALUE` (4) is a display encoding for the current screens. V3 pips do not read that integer as a fourth mark. Wave 0B defines `EvidenceMarksView`. It does not rebuild the play screen.

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

Wave 0A is complete. The consistency check on this revision was clean.

Wave 0B is done when these exist as types, with Multiplication's current behavior intact: concept, level membership, relationships, `instanceKey`, answer choice, misconception on the attempt, the allowance clamp, `EvidenceMarksView`, the narrow distractor context, the household roster and migration stamp, and per-skill XP frontier. Social types are not part of that exit. New skill plugins and UI are not part of that exit.
