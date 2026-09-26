// D1 level ladder (fact space mirrors src/engine/content/multiplication/facts.ts CORE_FACTS: factors 1–10).

export interface LevelDef {
  id: number
  kind: 'table' | 'mixed'
  title: string
  tables: number[]
  tableFactIds: string[]
  ownedFactIds: string[]
  gatingFactIds: string[]
  introFactIds: string[]
}

export function factId(a: number, b: number): string {
  return `${Math.min(a, b)}x${Math.max(a, b)}`
}

export function factors(id: string): [number, number] {
  const [a, b] = id.split('x').map(Number)
  return [a!, b!]
}

export function product(id: string): number {
  const [a, b] = factors(id)
  return a * b
}

export const ALL_FACTS: string[] = (() => {
  const out: string[] = []
  for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) out.push(factId(a, b))
  return out
})()

const TABLE_ORDER: { title: string; tables: number[] }[] = [
  { title: '×1 and ×2', tables: [1, 2] },
  { title: '×10', tables: [10] },
  { title: '×5', tables: [5] },
  { title: '×3', tables: [3] },
  { title: '×4', tables: [4] },
  { title: '×6', tables: [6] },
  { title: '×7', tables: [7] },
  { title: '×8 and ×9', tables: [8, 9] },
]

function build(): LevelDef[] {
  const owned = new Set<string>()
  const levels: LevelDef[] = []
  TABLE_ORDER.forEach((t, i) => {
    const table = ALL_FACTS.filter((f) => {
      const [a, b] = factors(f)
      return t.tables.includes(a) || t.tables.includes(b)
    })
    const own = table.filter((f) => !owned.has(f))
    own.forEach((f) => owned.add(f))
    // Only ×1 is intro (L1).
    const intro = i === 0 ? own.filter((f) => factors(f)[0] === 1) : []
    const gating = own.filter((f) => !intro.includes(f))
    levels.push({ id: i + 1, kind: 'table', title: t.title, tables: t.tables, tableFactIds: table, ownedFactIds: own, gatingFactIds: gating, introFactIds: intro })
  })
  levels.push({ id: 9, kind: 'mixed', title: 'Mixed 1–10', tables: [], tableFactIds: [...ALL_FACTS], ownedFactIds: [], gatingFactIds: [], introFactIds: [] })
  return levels
}

export const LEVELS: LevelDef[] = build()

export function getLevel(id: number): LevelDef {
  const l = LEVELS[id - 1]
  if (!l) throw new Error(`no level ${id}`)
  return l
}

/** Facts owned by levels strictly below `id` and not in its table (D2 step 1 review pool). */
export function reviewPool(id: number): string[] {
  const lvl = getLevel(id)
  const table = new Set(lvl.tableFactIds)
  const out: string[] = []
  for (const l of LEVELS) if (l.id < id) for (const f of l.ownedFactIds) if (!table.has(f)) out.push(f)
  return out
}

/** Facts in current + earlier levels (queue scope, D2 step 2). */
export function scopeFacts(id: number): Set<string> {
  const s = new Set<string>(getLevel(id).tableFactIds)
  for (const l of LEVELS) if (l.id <= id) for (const f of l.ownedFactIds) s.add(f)
  return s
}

export const OWNER_LEVEL: Map<string, number> = new Map()
for (const l of LEVELS) for (const f of l.ownedFactIds) OWNER_LEVEL.set(f, l.id)

// ---- Invariants (D1) ----
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`curriculum invariant failed: ${msg}`)
}
{
  const expected = [
    [19, 19, 9, 10],
    [10, 8, 8, 0],
    [10, 7, 7, 0],
    [10, 6, 6, 0],
    [10, 5, 5, 0],
    [10, 4, 4, 0],
    [10, 3, 3, 0],
    [19, 3, 3, 0],
  ]
  expected.forEach(([t, o, g, i], idx) => {
    const l = LEVELS[idx]!
    assert(l.tableFactIds.length === t && l.ownedFactIds.length === o && l.gatingFactIds.length === g && l.introFactIds.length === i, `L${idx + 1} counts`)
  })
  const allOwned = LEVELS.flatMap((l) => l.ownedFactIds)
  assert(ALL_FACTS.length === 55, '55 core facts')
  assert(allOwned.length === 55 && new Set(allOwned).size === 55, 'owned = 55, each exactly once')
  assert(LEVELS.reduce((s, l) => s + l.gatingFactIds.length, 0) === 45, 'gating = 45')
  assert(LEVELS.reduce((s, l) => s + l.introFactIds.length, 0) === 10, 'intro = 10')
  assert(getLevel(7).gatingFactIds.join() === '7x7,7x8,7x9', 'L7 gating')
  assert(getLevel(8).gatingFactIds.join() === '8x8,8x9,9x9', 'L8 gating')
  assert(getLevel(1).gatingFactIds.join() === '2x2,2x3,2x4,2x5,2x6,2x7,2x8,2x9,2x10', 'L1 gating')
}
