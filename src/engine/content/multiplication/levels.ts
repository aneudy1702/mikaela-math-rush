import {
  CORE_MAX_FACTOR,
  canonicalFactId,
  levelIdOf,
  parseFactId,
  type LevelDef,
} from '../../contracts'

/** Every core fact (factors 1–10) as a canonical ID, ordered by (min, max): 55 IDs. */
function coreFactIds(): string[] {
  const out: string[] = []
  for (let a = 1; a <= CORE_MAX_FACTOR; a++) {
    for (let b = a; b <= CORE_MAX_FACTOR; b++) out.push(canonicalFactId(a, b))
  }
  return out
}

/** D1 table levels in pedagogical order (L1–L8). */
const TABLE_LEVELS: readonly { title: string; tables: readonly number[] }[] = [
  { title: '×1 and ×2', tables: [1, 2] },
  { title: '×10', tables: [10] },
  { title: '×5', tables: [5] },
  { title: '×3', tables: [3] },
  { title: '×4', tables: [4] },
  { title: '×6', tables: [6] },
  { title: '×7', tables: [7] },
  { title: '×8 and ×9', tables: [8, 9] },
]

/** Only the ×1 facts are intro (non-gating) — D1. */
const INTRO_TABLE = 1

/**
 * D1 level ladder for multiplication (L1–L10).
 * Level IDs follow `levelIdOf(index)`; fact IDs are canonical (D9).
 * Returns a fresh, mutable array on each call.
 */
export function buildMultiplicationLevels(): LevelDef[] {
  const all = coreFactIds()
  const owned = new Set<string>()
  const levels: LevelDef[] = []

  TABLE_LEVELS.forEach((spec, i) => {
    const index = i + 1
    const tableFactIds = all.filter((f) => {
      const { a, b } = parseFactId(f)
      return spec.tables.includes(a) || spec.tables.includes(b)
    })
    const ownedFactIds = tableFactIds.filter((f) => !owned.has(f))
    for (const f of ownedFactIds) owned.add(f)
    const introFactIds = ownedFactIds.filter(
      (f) => parseFactId(f).a === INTRO_TABLE,
    )
    const gatingFactIds = ownedFactIds.filter((f) => !introFactIds.includes(f))
    levels.push({
      id: levelIdOf(index),
      index,
      kind: 'table',
      title: spec.title,
      tables: [...spec.tables],
      tableFactIds,
      ownedFactIds,
      gatingFactIds,
      introFactIds,
    })
  })

  const tail: { kind: LevelDef['kind']; title: string }[] = [
    { kind: 'mixed', title: 'Mixed 1–10' },
    // L10 exists on the ladder but is DEFERRED (D7): never completes this sprint.
    { kind: 'speed', title: 'Speed challenge' },
  ]
  for (const t of tail) {
    const index = levels.length + 1
    levels.push({
      id: levelIdOf(index),
      index,
      kind: t.kind,
      title: t.title,
      tables: [],
      tableFactIds: [...all],
      ownedFactIds: [],
      gatingFactIds: [],
      introFactIds: [],
    })
  }

  return levels
}
