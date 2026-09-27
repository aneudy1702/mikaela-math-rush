# Math Rush V4 — Social, designed in V3

Status: **DRAFT.** V3 designs this and stops. V4 builds it. The nickname for that release is **Social Rush**.

---

## Why it waits

Stitch already shows a leaderboard, a race lobby, a multiplayer race, a podium, and team ideas. Those screens belong in the V3 design system so the visual language covers them.

A real room is a different product: identity, accounts, networking, backend state, sync, reconnect, cheating, child safety, moderation, and room lifecycle. That is V4.

V3 does not add cloud accounts to sneak a leaderboard in early.

---

## What V3 does build

Polished screens, plus types and fixtures **outside the engine**:

```text
src/social/contracts/
src/social/fixtures/
```

```ts
CompetitionContext
LeaderboardEntry
RaceParticipant
RaceResult
```

Wave 0 does not add these to `src/engine` just because contracts are being frozen. The mock screens are the first thing allowed to import `src/social`.

Screens:

- Leaderboard
- Race lobby
- Multiplayer race
- Podium

They render against checked-in mock data. Copy on those screens makes the demo nature obvious to a parent, without looking like a broken feature to a child. No network calls. Session finish does not submit a score anywhere.

The learning engine, profile migration, and skill plugins do not import these types.

---

## What V4 would have to answer first

These are not V3 decisions. They are the list that keeps V3 from "just adding Firebase."

- Who a child is across devices, without a public directory of children
- What a race shares (skill, level, question set) and what it must not share
- How a dropped connection ends a race
- How a score is trusted
- Whether a leaderboard is the household, a private group, or nobody
- How a parent turns competition off

Until those have a brief of their own, the mock screens are the feature.
