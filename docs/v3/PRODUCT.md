# Math Rush V3 — Product Brief

Status: **APPROVED FOR WAVE 0A REVIEW.** Owner decisions below are accepted. Nothing is approved for implementation until a fresh reviewer challenges this set and the owner accepts the findings. Wave 0B (coding the contracts) waits on that.

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

A question is one way of testing one or more concepts. For Multiplication, one concept is one canonical fact. For Fractions and Algebra, one concept is a strategy practiced by many different questions. Whether the V2 status rules still mean the same thing at that coarser grain is **O5**, and it blocks contract coding. See [ARCHITECTURE.md](ARCHITECTURE.md).

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

V3 implements multiple choice and visual choice. Numeric input stays available from V2 and is not the default.

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

Each profile holds that small identity, per-skill progress, player XP, and `lastActivePath` (the last skill and level they played). There is no single academically privileged path.

### Upgrade

A V2 player becomes one local learner without losing multiplication progress, records, XP, badges, or raw answer history. Migration maps each multiplication fact onto a multiplication concept and does not recompute mastery. A retry must not run that map again over newer V3 progress. Rules: [MIGRATION.md](MIGRATION.md).

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

V2 fact status, selection, spacing, and level-completion rules stay the multiplication implementation. New skills plug into that engine. They do not replace it, and they do not invent a private mastery score. If O5 finds the V2 rules do not survive strategy-level concepts, the fix is one platform-level evidence policy, not a plugin exception.

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

Accepted items are not re-litigated by a builder. O5 stays open on purpose.

| # | Status | Decision |
|---|---|---|
| O1 | **Accepted** | V3 coding starts only after a fresh adversarial review of these docs, and only after the owner accepts that review. V2 kid testing stays on the V2 line. |
| O2 | **Accepted** | Multiple local learner profiles on one device. No accounts, cloud identity, password, email, or parent login. The PWA belongs to the household. Each learner's academic state, records, and XP are independent. |
| O3 | **Accepted** | `docs/v3/reference/stitch/` is the visual reference. Learning rules override it where they disagree. The evidence-pip text in that export is corrected to the 0–3 + gold rule. |
| O4 | **Provisional** | Division, Fractions, and the Algebra proof scopes are in V3. Exact Division and Fractions level order gets one education review before those plugins are built. Reordering levels does not reopen the platform architecture. Concept ids stay stable. |
| O5 | **Open. Wave 0A blocker** | Do the V2 status rules (`3` of the last `4`, spaced sessions, struggling / mastered) still mean the same thing when a concept is a strategy with many instances, not one fixed fact? Multiplication is the fixed-fact case. Fractions and Algebra are the strategy cases. A plugin does not answer this, and does not invent its own mastery score. |
| O6 | **Accepted** | Ask grade once per learner. Recommendation only. It never hides an available skill, and it is not placement. |
| O7 | **Accepted** | Levels reference concepts. A concept does not own a single level. One mastery record follows the concept across every level that lists it. |
| O8 | **Accepted** | Concept links are generic (`inverse`, `prerequisite`, `related`, `equivalent`). No division-only field. The session engine does not interpret those links unless a later selection strategy asks for them. |
| O9 | **Accepted** | A multiple-choice option may carry `misconceptionId`. The raw attempt stores the selected choice, correctness, and that id when present. No teacher UI in V3. |
| O10 | **Accepted** | V2 → V3 migration is version-aware. A retry, reload, or stale V2 backup never migrates again over newer V3 progress. |

---

## How to read the rest

[PLAN.md](PLAN.md) splits Wave 0 into review (0A) and contract coding (0B). 0B does not start from this file alone.
