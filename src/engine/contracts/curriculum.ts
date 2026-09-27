/** D0/D1 curriculum contracts. */

/**
 * Level identifier, unique within a skill. Frozen format: `L<index>` with the 1-based
 * ladder index ("L1" … "L10"). Use `levelIdOf` / `levelIndexOf` instead of string math.
 */
export type LevelId = string

export type LevelKind = 'table' | 'mixed' | 'speed'

export interface LevelDef {
  id: LevelId
  skillId: string
  /** 1-based position on the ladder. `id === levelIdOf(index)`. */
  index: number
  kind: LevelKind
  title: string
  /** Concepts this level owns (gating plus intro). */
  conceptIds: string[]
  /** Owned concepts that count toward completion rule R1. */
  gatingConceptIds: string[]
  /** Owned concepts shown and practiced but not gating. */
  introConceptIds: string[]
  /**
   * Times tables this level presents (empty for mixed/speed).
   * Multiplication-only until evidence is keyed by concept id.
   */
  tables: number[]
  /** Every canonical fact presented at this level (L9/L10: all 55). */
  tableFactIds: string[]
  /** Facts whose owner level is this one (each core fact has exactly one owner). */
  ownedFactIds: string[]
  /**
   * Owned facts that count toward completion rule R1.
   * Table completion still reads this while evidence keys are fact ids.
   * `gatingConceptIds` is the same membership in concept-id form.
   */
  gatingFactIds: string[]
  /** Owned facts shown and practiced but not gating (only ×1, at L1). */
  introFactIds: string[]
}

export interface SkillCurriculum {
  skillId: string
  grade: number
  levels: LevelDef[]
}

const LEVEL_ID_RE = /^L([1-9]\d*)$/

export function levelIdOf(index: number): LevelId {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Invalid level index: ${index}`)
  }
  return `L${index}`
}

/** Inverse of `levelIdOf`. Throws on a malformed ID. */
export function levelIndexOf(levelId: LevelId): number {
  const m = LEVEL_ID_RE.exec(levelId)
  if (!m) throw new Error(`Invalid levelId: ${levelId}`)
  return Number(m[1])
}

export function isLevelId(value: unknown): value is LevelId {
  return typeof value === 'string' && LEVEL_ID_RE.test(value)
}

export const FIRST_LEVEL_ID: LevelId = 'L1'
