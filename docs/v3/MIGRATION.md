# Math Rush V3 — Migration

Status: **WAVE 1.** The household store maps a V2 profile into a V3 learner and stamps the household. Fact ids in that copy become concept ids. The V2 blob is not written or deleted. The running kid app still loads the V2 profile, so Multiplication completion keeps its fact-id adapter until that app reads the household.

---

## Requirement

A V2 player upgrades to V3 without losing:

- multiplication progress (level position, unlocked and completed levels, fact/concept status)
- personal records
- XP, player level, and badges
- raw answer history

Mastery is **mapped**, not recomputed. Running V3 status rules over the old log and hoping the numbers match is not the migration.

```text
multiplication fact  →  multiplication concept
```

`7x8` becomes `multiplication.fact.7x8`. Evidence, ever-mastered, and level membership move with it. D9 still holds: orientations that were already one canonical fact stay one concept.

---

## What V2 actually stores

Current key: `mikaela-math-rush:learner-v2`.

The V2 profile is a single multiplication `SkillProgress`, a raw log, records, a session log, and `player`. The V1 blob, if it is still present under the V1 key, stays untouched. V3 does not reopen V1 migration except by going through the already-migrated V2 profile.

V3 writes a **new key** and leaves the V2 blob in place as a backup. The same rule as V2's upgrade from V1.

The product name changes. The storage key should stop saying `mikaela-math-rush` for the V3 blob. Wave 0 picks the new key. The reader still knows the old key.

---

## Map

| V2 | V3 |
|---|---|
| `learnerName` | `displayName` |
| single `progress` | `skills.multiplication` |
| canonical fact id | `multiplication.fact.<id>` |
| fact evidence and status | concept evidence and status, copied |
| level ids on the multiplication ladder | same level ids |
| `records` | same records, skill id set to multiplication |
| `rawLog` attempts | kept, fact id rewritten to the concept id |
| `player` | copied |
| `pendingReinforcements` | kept, ids rewritten |
| no grade | `grade` unset until the player answers O6 |

`lastActivePath` for a migrated learner is their V2 multiplication level, so Continue opens the same place they left. Grade stays unset until they are asked (O6). The migrated learner is the first profile in the household roster. No second learner is invented, and nothing is copied onto a sibling.

Chosen-distractor and `misconceptionId` are empty on historical attempts. V2 had no choices to record.

---

## Idempotency (O10)

Migration is stamped on the household, not inferred from whether the learner still exists.

```ts
interface HouseholdMigrationStamp {
  source: 'learner-v2'
  completed: true
  completedAtMs: number
  migratedLearnerId: string
}
```

The entry point runs only when the V2 blob is present and `household.migration.completed` is not already true. A retry, a reload, or a crash after the stamp is written does not run it again.

```text
migration(migration(v2Profile)) must not happen
```

Deleting the migrated learner does not clear the stamp and does not recreate that learner from the V2 backup. A later explicit restore may read the backup. Migration itself does not.

The V2 key is never written or deleted by this path.

Tests:

1. Migrate a fixture, play further (new attempts, new XP), run the entry point again. The post-play V3 state is unchanged. A second learner added after migration is unchanged.
2. Migrate, delete the migrated learner, run the entry point again. The learner is not recreated. The stamp remains. The V2 blob is byte-for-byte unchanged.

Migrated multiplication attempts use the concept id as `instanceKey`, so their evidence matches V2. `misconceptionId` stays empty. Grade stays unset until O6 is asked.

---

## Failure behavior

Carried forward from V2 persistence:

- A corrupt V3 payload does not wipe a good V2 save.
- A partial migration does not silently drop mastery, XP, badges, records, or levels.
- The UI shows a notice when something was quarantined, trimmed, or could not be read.
- The V2 key is never deleted by a V3 save.

Tests use a fixture profile with real multiplication progress, records, XP, badges, and a raw log. The assertion is equality of those outcomes after migration, not "the profile loads."

---

## Out of this track

- Changing V2 mastery formulas
- Re-inferring a start level
- Granting retroactive XP for Division, Fractions, or Algebra
- Migrating social or leaderboard data (there is none)
