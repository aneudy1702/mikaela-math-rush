# Math Rush V3 — Product Brief

Status: **WAVE 1 COMPLETE.** O5 is closed. The kid app still loads the V2 profile. Division, Fractions, Algebra, and finished V3 screens are not started.

V2 remains the product kids can keep using. V3 is a new branch and a new brief. V2 thresholds, mastery rules, and the deployed app stay as they are. See [docs/v2/DECISIONS.md](../v2/DECISIONS.md).

Supporting docs: [ARCHITECTURE.md](ARCHITECTURE.md) · [CURRICULUM.md](CURRICULUM.md) · [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) · [MIGRATION.md](MIGRATION.md) · [SOCIAL_FUTURE.md](SOCIAL_FUTURE.md) · [PLAN.md](PLAN.md).

---

## Thesis

**Math Rush V3 turns the adaptive multiplication game into a reusable adaptive math platform.**

Three ideas are in the air: a new visual system, a broader math curriculum, and social competition. V3 implements the first two. Social competition is designed and stubbed, then built in V4.

V3 has to prove three things:

1. The Stitch arcade design system can replace the V2 UI and the learning experience still holds.
2. The learning engine can track **multiple math skills**, not only multiplication facts.
3. A child of a different age can open the same product and get a curriculum path that fits them.

Division and Fractions are the real new curricula. Algebra is a small proof that the platform is not still an elementary multiplication engine in a new shirt.

---

## Who it is for

| Person | Role in V3 |
|---|---|
| Mikaela | Grade 3. Existing V2 player. Multiplication must survive the upgrade intact. She can also start Division or Fractions. |
| Adrian | Older sibling. The Algebra proof exists so the product can feel intended for him. |
| A new Grade 3 learner | Opens Math Rush with no history and can choose Multiplication, Division, or Fractions. |
| Owner (Aneudy) | Decides scope. Signs the brief before implementation agents start. |

The brand is **Math Rush**. Mikaela and Adrian are learner names, not the product name.

The installed PWA, title, logo, loading screen, navigation, and metadata all say Math Rush.

---

## What V3 ships

### Identity

One product, one name. The installed PWA belongs to the household, not to Mikaela.

Opening the app asks who is playing. Each learner is a local profile: a stable id, a display name, an optional grade, an optional avatar. No password, email, parent account, login, or sync.

Grade is asked once, in the child's words: "What grade are you in?" The follow-up is that we use it to recommend a starting path, and they can play any available skill. Grade never blocks a skill. A skill's own placement, if it has one, is separate from this question.

### Design

The latest Stitch export is the visual source of truth. V3 extracts tokens, primitives, and game components from it. Screens are composed from those pieces. Stitch HTML is not copied screen by screen. Direction and component list: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

### Learning model

V2 mastery is a **multiplication fact**. V3 mastery is a **concept**: the smallest thing the engine tracks.

A concept does not belong to one level. Levels list the concepts they practice. The same concept can sit in a focused level, a mixed level, and a review level without a second mastery record.

A question is one way of testing one or more concepts. For Multiplication, one concept is one canonical fact. For Fractions and Algebra, one concept is a strategy practiced by many question instances. All four skills use the same concept status model. There is no per-skill mastery policy.

Two platform rules keep that model meaningful for a strategy (O5, closed):

1. A miss suppresses evidence only for that same question instance, not for every other instance of the concept.
2. Level completion can never treat zero mastered gating concepts as enough.

Difficulty steers which instance is generated. It is not a second mastery score. If kid testing later shows a strategy concept is too coarse, that is a new decision.

Curriculum shape:

```text
Grade band → Domain → Skill → Level → Concepts
```

Detail and the actual skill scopes: [CURRICULUM.md](CURRICULUM.md). Contracts: [ARCHITECTURE.md](ARCHITECTURE.md).

### Skills in this release

| Skill | Role |
|---|---|
| Multiplication | Existing V2 content. The regression case. Progress migrates. |
| Division | First new plugin. Built from the relationship to multiplication, not a second unrelated fact list. |
| Fractions | The assumption-breaker. Questions are not `number operator number`. |
| Algebra: One-Step Equations | A few levels only. Proof that an older learner fits the same play loop. |

### Play

Multiple choice is the default answer interaction, from the kids' own feedback.

V3 implements multiple choice, fraction choice, and visual choice, using the existing answer-type names `multiple-choice`, `fraction`, and `visual-selection`. Numeric input stays available from V2 and is not the default.

Wrong choices are plausible misconceptions owned by each skill, not random numbers. A choice may carry a `misconceptionId`. The attempt stores the selected choice, whether it was correct, and that id when it exists. V3 does not show this in the UI.

The play loop does not know which plugin generated the question.

### Home

Home is a skill hub, not a door into Multiplication.

A returning player sees who they are and their player level. **Continue** is the last skill they played. **Recommended next** is a separate suggestion from grade and progress. Those are not the same row.

A Grade 3 player and an older player use the same app. Their profiles do not share XP, records, or academic progress.

### Profiles

```text
Math Rush

Who's playing?

[Mikaela]  Grade 3
[Adrian]   Grade 9
+ Add learner
```

Each profile holds that identity plus every piece of gameplay state: skills, player XP and badges, records, the raw log, the session log, last active path, and pending practice. None of that is stored once for the household. Mikaela and Adrian never inherit each other's mastery, XP, badges, records, attempts, sessions, or pending practice.

The household record is the roster, the active learner pointer, and migration metadata. It is not a shared game save.

### Upgrade

A V2 player becomes one local learner without losing multiplication progress, records, XP, badges, or raw answer history. Migration maps each multiplication fact onto a multiplication concept and does not recompute mastery. The household save is stamped once when that finishes. Deleting the migrated learner does not run migration again, and does not recreate them from the V2 backup. Rules: [MIGRATION.md](MIGRATION.md).

### Social, designed only

Leaderboard, race lobby, multiplayer race, and podium stay in the design system, with contracts and screens fed by mock data. Real rooms, accounts, and a cross-device leaderboard are V4. See [SOCIAL_FUTURE.md](SOCIAL_FUTURE.md).

---

## What V3 does not ship

- Real-time multiplayer, public leaderboards, chat, or friends
- A complete Grade 3–9 curriculum
- A full Algebra course, a teacher dashboard, or classroom management
- AI-generated curriculum
- Cloud accounts, unless a requirement in this brief cannot be met without them
- A rewrite of the V2 learning algorithm

V2 fact status, selection, spacing, and level-completion rules stay the one concept status model. New skills plug into that engine. They do not replace it, and they do not invent a private mastery score. O5 is closed without an `EvidencePolicy` type: instance-scoped suppression and the completion clamp are platform rules, shared by every skill.

---

## Success criteria

V3 is done when all of these are true:

1. **Mikaela** updates from V2 and continues Multiplication with her progress, records, XP, badges, and answer history intact. Adrian can exist on the same install without receiving any of that state.
2. **A new Grade 3 learner** can enter Math Rush and choose Multiplication, Division, or Fractions.
3. **Adrian** can choose the Algebra proof and the session feels like the product is for him too.
4. **Play, results, XP, records, and the session engine** run a question without caring which skill plugin produced it.
5. **Adding another skill** does not require rewriting Home, Play, Results, XP, records, the session engine, or the learning engine.
6. **The Stitch look** lives in shared tokens and components. Screen-specific CSS is not a second design system.
7. **Social screens** look finished and are obviously running on mocked or local data.

Kid testing (Mikaela, Adrian, and friends) is the last gate, after the migration and a full browser/PWA pass. It is how we learn whether the new curricula feel right. It is not where we invent the platform contracts.

---

## Owner decisions

Accepted items are not re-litigated by a builder.

| # | Status | Decision |
|---|---|---|
| O1 | **Accepted** | Wave 0A is accepted. Contract code is Wave 0B, and only after this revision passes a consistency check. V2 kid testing stays on the V2 line. |
| O2 | **Accepted** | Multiple local learner profiles on one device. No accounts. Gameplay state lives on the learner. The household holds the roster, the active learner pointer, and migration metadata only. |
| O3 | **Accepted** | `docs/v3/reference/stitch/` is the visual reference. Learning rules override it. Evidence UI is `{ marks: 0\|1\|2\|3, mastered: boolean }`. |
| O4 | **Provisional** | Division, Fractions, and the Algebra proof scopes are in V3. Level order gets one education review before those plugins. That review is not Wave 0B. |
| O5 | **Closed** | One status model for every skill. A miss suppresses the same `instanceKey` only. The existing allowance is clamped with `min(existing, max(0, n − 1))`, so a level cannot complete with zero gating concepts mastered. Larger multiplication levels keep their current allowance. No `EvidencePolicy` type. Difficulty stays outside status. |
| O6 | **Accepted** | Ask grade once per learner. Recommendation only. It never hides an available skill, and it is not placement. |
| O7 | **Accepted** | Levels reference concepts. A concept does not own a single level. One mastery record follows the concept across every level that lists it. |
| O8 | **Accepted** | Concept links are generic (`inverse`, `prerequisite`, `related`, `equivalent`). No division-only field. The session engine does not interpret those links unless a later selection strategy asks for them. |
| O9 | **Accepted** | A choice may carry `misconceptionId`. The attempt stores the selected choice, correctness, and that id when present. The distractor function does not receive the full learner profile. No teacher UI in V3. |
| O10 | **Accepted** | Migration is stamped once on the household. A completed stamp stays completed. Deleting the migrated learner does not rerun migration or recreate them from the V2 backup. |
| O11 | **Accepted** | Practice-versus-replay XP uses that learner's frontier on the skill being played. Player XP stays on the learner. The daily record XP bonus is once per learner per day. The record itself is still saved when the bonus is already spent. |

---

## How to read the rest

[PLAN.md](PLAN.md) is the wave order. Wave 0B freezes the types these decisions name. It does not build a new skill or a new screen.
