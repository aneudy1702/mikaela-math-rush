# Math Rush V3 — Curriculum

Status: **SCOPE ACCEPTED, ORDER PROVISIONAL (O4).** Division, Fractions, and the Algebra proof are in V3. Exact Division and Fractions level order gets one education review before those plugins are built. That review does not reopen the platform architecture. Adding a fifth skill, or filling out Algebra, is a new brief.

Hierarchy:

```text
Grade band → Domain → Skill → Level → Concepts
```

A level lists concept ids. A concept is not owned by a single level field. Mastery follows the concept, so a mixed level and a focused level share one record. Grade recommends a starting path. It does not fence one.

---

## Multiplication — regression case

Existing V2 ladder, unchanged in content and rules. It is how we know V3 did not make Mikaela's game worse.

Owner levels, gating, intro facts, mixed consolidation, and the deferred speed level stay as in V2 D1. Canonical identity stays as in D9: `7×8` and `8×7` are `multiplication.fact.7x8`.

All V2 mastery and progress migrate onto these concepts. See [MIGRATION.md](MIGRATION.md).

---

## Division — first new plugin

Division is the inverse relationship, not a second universe of unrelated facts.

```text
7 × 8 = 56
56 ÷ 8 = 7
56 ÷ 7 = 8
```

Those are different concepts. The link is a generic relationship, not a division field:

```text
division.fact.56÷7  inverse →  multiplication.fact.7x8
```

The division plugin may use that when it builds distractors. The session engine does not learn what division means in order to store the link. (O8)

Proposed levels, within 100:

| Level | Focus |
|---|---|
| 1 | Divide by 1 and 2 |
| 2 | Divide by 10 |
| 3 | Divide by 5 |
| 4 | Divide by 3 |
| 5 | Divide by 4 |
| 6 | Divide by 6 |
| 7 | Divide by 7 |
| 8 | Divide by 8 and 9 |
| 9 | Mixed division within 100 |

This order mirrors the multiplication ladder so a child who knows ×2 meets ÷2 while that pattern is fresh. It is a proposal. One education review may reorder it before the plugin is built. Concept ids stay put; level membership can change. (O4)

Distractors come from nearby facts and from the matching multiplication product, not from random integers.

---

## Fractions — the assumption test

Fractions exist in V3 because they do not fit `number operator number`.

Proposed levels:

| Level | Concept family |
|---|---|
| 1 | Identify a fraction visually |
| 2 | Numerator and denominator |
| 3 | Fractions on a number line |
| 4 | Compare, same denominator |
| 5 | Compare, same numerator |
| 6 | Equivalent fractions |
| 7 | Mixed comparison |

Example concept ids:

```text
fractions.identify.visual
fractions.parts.numerator-denominator
fractions.number-line
fractions.compare.same-denominator
fractions.compare.same-numerator
fractions.equivalent
fractions.compare.mixed
```

These ids are **strategy-level**. `fractions.compare.same-denominator` is updated by both an easy pair (3/8 vs 5/8) and a harder pair (7/12 vs 11/12). That is coarser than `multiplication.fact.7x8`. Whether V2's status rules still mean the right thing at this grain is O5. This doc does not split the concept into one id per fraction pair, and it does not invent a fractions mastery score.

Levels 1 and 3 need visual choice. Later levels may be multiple choice or fraction choice. The prompt types already allowed in V2 (`expression`, `text`, `visual`) are the ones V3 uses; a new prompt type is a contract change.

This is not a full fractions course. Operations on fractions (add, subtract, multiply) are out of V3.

---

## Algebra — proof of platform

One skill: **One-Step Equations**. Not a freshman course.

```text
x + 4 = 11
3x = 18
x - 7 = 12
x / 4 = 6
```

A few levels, one per operation, plus a short mix if it still feels like the same plugin. Two-step equations, exponents, and graphing are out.

Concept ids:

```text
algebra.one-step.addition
algebra.one-step.multiplication
algebra.one-step.subtraction
algebra.one-step.division
```

Same grain problem as fractions, and the same open question (O5). `algebra.one-step.addition` covers `x + 4 = 11` and `x + 17 = 39`. V3 is explicitly testing whether strategy-level concepts can share the multiplication mastery rules. It is not pretending those two grains are the same thing.

Distractors are the mistakes a learner actually makes (operating on the wrong side, forgetting to invert), tagged with a `misconceptionId`, not nearby integers.

The success test is qualitative and specific: Adrian can play this skill in the same shell as Multiplication and recognize the product as his, not as a third-grade game with harder numbers pasted in.

---

## What the home screen may show beyond these skills

Exponents and Geometry may appear as **Coming later**. They are labels in the skill registry. They have no concepts, no questions, and no progress.

---

## Explicitly out of this curriculum

- ×11 / ×12 as anything other than the deferred V2 bonus
- Fraction arithmetic
- Decimals, percents, ratios
- Multi-step algebra, systems, functions
- Geometry content
- Word problems that exist only to prove multi-concept questions

`conceptIds` being an array is the hook for that last item. V3 does not have to ship a word-problem level to justify the array.
