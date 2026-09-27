import { describe, expect, it } from 'vitest'
import {
  isCanonicalFactId,
  isCoreFactId,
  levelIdOf,
  type SkillCurriculum,
} from '../contracts'
import { buildMultiplicationLevels } from '../content/multiplication/levels'
import {
  getCurriculum,
  getLevel,
  levelsUpTo,
  nextLevel,
  ownerLevelOf,
  reviewFactIds,
  scopeFactIds,
} from './curriculum'

const ALL_55: string[] = []
for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) ALL_55.push(`${a}x${b}`)

// D1 table: [kind, title, table, owned, gating, intro]
const D1: [string, string, number, number, number, number][] = [
  ['table', '×1 and ×2', 19, 19, 9, 10],
  ['table', '×10', 10, 8, 8, 0],
  ['table', '×5', 10, 7, 7, 0],
  ['table', '×3', 10, 6, 6, 0],
  ['table', '×4', 10, 5, 5, 0],
  ['table', '×6', 10, 4, 4, 0],
  ['table', '×7', 10, 3, 3, 0],
  ['table', '×8 and ×9', 19, 3, 3, 0],
  ['mixed', 'Mixed 1–10', 55, 0, 0, 0],
  ['speed', 'Speed challenge', 55, 0, 0, 0],
]

const cur = getCurriculum()
const levels = cur.levels

describe('D1 ladder', () => {
  it('is the multiplication grade-3 curriculum with 10 levels L1…L10', () => {
    expect(cur.skillId).toBe('multiplication')
    expect(cur.grade).toBe(3)
    expect(levels.map((l) => l.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => levelIdOf(i + 1)),
    )
    levels.forEach((l, i) => expect(l.index).toBe(i + 1))
  })

  it('matches the D1 table per level (kind, title, counts)', () => {
    D1.forEach(([kind, title, t, o, g, intro], i) => {
      const l = levels[i]!
      expect({
        kind: l.kind,
        title: l.title,
        t: l.tableFactIds.length,
        o: l.ownedFactIds.length,
        g: l.gatingFactIds.length,
        intro: l.introFactIds.length,
      }).toEqual({ kind, title, t, o, g, intro })
    })
  })

  it('owns every core fact exactly once (55 total)', () => {
    const owned = levels.flatMap((l) => l.ownedFactIds)
    expect(owned).toHaveLength(55)
    expect(new Set(owned).size).toBe(55)
    expect([...owned].sort()).toEqual([...ALL_55].sort())
  })

  it('has 45 gating and 10 intro facts; intro is exactly 1x1…1x10', () => {
    expect(levels.reduce((s, l) => s + l.gatingFactIds.length, 0)).toBe(45)
    const intro = levels.flatMap((l) => l.introFactIds)
    expect(intro).toEqual(Array.from({ length: 10 }, (_, i) => `1x${i + 1}`))
    expect(getLevel('L1').introFactIds).toEqual(intro)
  })

  it('partitions each level: owned = gating ∪ intro (disjoint), owned ⊆ table', () => {
    for (const l of levels) {
      expect([...l.gatingFactIds, ...l.introFactIds].sort()).toEqual(
        [...l.ownedFactIds].sort(),
      )
      const table = new Set(l.tableFactIds)
      for (const f of l.ownedFactIds) expect(table.has(f)).toBe(true)
      expect(new Set(l.tableFactIds).size).toBe(l.tableFactIds.length)
    }
  })

  it('matches the named D1 gating sets', () => {
    expect(getLevel('L1').gatingFactIds).toEqual([
      '2x2', '2x3', '2x4', '2x5', '2x6', '2x7', '2x8', '2x9', '2x10',
    ])
    expect(getLevel('L7').gatingFactIds).toEqual(['7x7', '7x8', '7x9'])
    expect(getLevel('L8').gatingFactIds).toEqual(['8x8', '8x9', '9x9'])
    expect(getLevel('L7').gatingConceptIds).toEqual([
      'multiplication.fact.7x7',
      'multiplication.fact.7x8',
      'multiplication.fact.7x9',
    ])
  })

  it('uses canonical core IDs everywhere', () => {
    for (const l of levels) {
      for (const f of [
        ...l.tableFactIds,
        ...l.ownedFactIds,
        ...l.gatingFactIds,
        ...l.introFactIds,
      ]) {
        expect(isCanonicalFactId(f), f).toBe(true)
        expect(isCoreFactId(f), f).toBe(true)
      }
    }
  })

  it('L9 and L10 tables are all 55 facts and own nothing', () => {
    for (const id of ['L9', 'L10']) {
      const l = getLevel(id)
      expect([...l.tableFactIds].sort()).toEqual([...ALL_55].sort())
      expect(l.tables).toEqual([])
      expect(l.ownedFactIds).toEqual([])
    }
  })

  it('table levels list the tables they present', () => {
    expect(levels.slice(0, 8).map((l) => l.tables)).toEqual([
      [1, 2], [10], [5], [3], [4], [6], [7], [8, 9],
    ])
  })

  it('is frozen and shared; buildMultiplicationLevels returns fresh copies', () => {
    expect(getCurriculum()).toBe(cur)
    expect(Object.isFrozen(cur.levels)).toBe(true)
    expect(Object.isFrozen(levels[0]!.tableFactIds)).toBe(true)
    const a = buildMultiplicationLevels()
    const b = buildMultiplicationLevels()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
    expect(a).toEqual(levels)
  })

  it('throws for an unknown skill', () => {
    expect(() => getCurriculum('division')).toThrow()
  })
})

describe('helpers', () => {
  it('getLevel returns by ID and throws on unknown/malformed IDs', () => {
    expect(getLevel('L3').title).toBe('×5')
    expect(() => getLevel('L11')).toThrow()
    expect(() => getLevel('L0')).toThrow()
    expect(() => getLevel('3')).toThrow()
    expect(() => getLevel('L03')).toThrow()
  })

  it('nextLevel walks the ladder and returns null at the top', () => {
    expect(nextLevel('L1')?.id).toBe('L2')
    expect(nextLevel('L8')?.id).toBe('L9')
    expect(nextLevel('L9')?.id).toBe('L10')
    expect(nextLevel('L10')).toBeNull()
    expect(() => nextLevel('L42')).toThrow()
  })

  it('levelsUpTo is inclusive and ordered', () => {
    expect(levelsUpTo('L1').map((l) => l.id)).toEqual(['L1'])
    expect(levelsUpTo('L4').map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4'])
    expect(levelsUpTo('L10')).toHaveLength(10)
  })

  it('ownerLevelOf maps every core fact; non-core/non-canonical → null', () => {
    expect(ownerLevelOf('1x7')?.id).toBe('L1')
    expect(ownerLevelOf('2x10')?.id).toBe('L1')
    expect(ownerLevelOf('5x10')?.id).toBe('L2')
    expect(ownerLevelOf('3x5')?.id).toBe('L3')
    expect(ownerLevelOf('9x9')?.id).toBe('L8')
    expect(ownerLevelOf('11x12')).toBeNull()
    expect(ownerLevelOf('8x7')).toBeNull()
    for (const f of ALL_55) expect(ownerLevelOf(f)).not.toBeNull()
  })

  it('reviewFactIds: earlier-owned facts minus this table', () => {
    expect(reviewFactIds('L1')).toEqual([])
    // L2 (×10): L1 owned 19, of which 1x10 and 2x10 are in the ×10 table.
    const r2 = reviewFactIds('L2')
    expect(r2).toHaveLength(17)
    expect(r2).not.toContain('1x10')
    expect(r2).not.toContain('2x10')
    // L9: every fact owned by L1–L8 is in its table → empty.
    expect(reviewFactIds('L9')).toEqual([])
    for (const id of ['L3', 'L5', 'L8']) {
      const l = getLevel(id)
      for (const f of reviewFactIds(id)) {
        expect(l.tableFactIds).not.toContain(f)
        expect(ownerLevelOf(f)!.index).toBeLessThan(l.index)
      }
    }
  })

  it('scopeFactIds: this table plus everything owned at levels ≤ it', () => {
    expect(scopeFactIds('L1').size).toBe(19)
    // L2: 19 (L1) + 8 new ×10 facts.
    expect(scopeFactIds('L2').size).toBe(27)
    expect(scopeFactIds('L8').size).toBe(55)
    expect(scopeFactIds('L9').size).toBe(55)
    const s3 = scopeFactIds('L3')
    for (const f of getLevel('L3').tableFactIds) expect(s3.has(f)).toBe(true)
    expect(s3.has('3x4')).toBe(false)
  })

  it('helpers accept an explicit curriculum', () => {
    const custom: SkillCurriculum = {
      skillId: 'x',
      grade: 1,
      levels: buildMultiplicationLevels().slice(0, 2),
    }
    expect(nextLevel('L2', custom)).toBeNull()
    expect(() => getLevel('L3', custom)).toThrow()
    expect(levelsUpTo('L2', custom)).toHaveLength(2)
  })
})
