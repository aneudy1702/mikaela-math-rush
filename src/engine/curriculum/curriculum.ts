import type { LevelDef, LevelId, SkillCurriculum } from '../contracts'

/** T1 implements every function in this file (D1). Stubs throw until then. */

/** The curriculum for a skill (default: multiplication). Throws for an unknown skill. */
export function getCurriculum(skillId?: string): SkillCurriculum {
  void skillId
  throw new Error('not implemented: getCurriculum')
}

/** Level by ID. Throws for an unknown level. */
export function getLevel(
  levelId: LevelId,
  curriculum?: SkillCurriculum,
): LevelDef {
  void levelId
  void curriculum
  throw new Error('not implemented: getLevel')
}

/** The level after `levelId` on the ladder, or null at the top. */
export function nextLevel(
  levelId: LevelId,
  curriculum?: SkillCurriculum,
): LevelDef | null {
  void levelId
  void curriculum
  throw new Error('not implemented: nextLevel')
}

/** Levels L1 … levelId inclusive, in ladder order. */
export function levelsUpTo(
  levelId: LevelId,
  curriculum?: SkillCurriculum,
): LevelDef[] {
  void levelId
  void curriculum
  throw new Error('not implemented: levelsUpTo')
}

/** Owner level of a canonical fact, or null for facts outside the core space. */
export function ownerLevelOf(
  factId: string,
  curriculum?: SkillCurriculum,
): LevelDef | null {
  void factId
  void curriculum
  throw new Error('not implemented: ownerLevelOf')
}

/** D2 step 1 review pool: facts owned by earlier levels and not in this level's table. */
export function reviewFactIds(
  levelId: LevelId,
  curriculum?: SkillCurriculum,
): string[] {
  void levelId
  void curriculum
  throw new Error('not implemented: reviewFactIds')
}

/** D2 step 2 queue scope: this level's table facts plus every fact owned by levels ≤ it. */
export function scopeFactIds(
  levelId: LevelId,
  curriculum?: SkillCurriculum,
): ReadonlySet<string> {
  void levelId
  void curriculum
  throw new Error('not implemented: scopeFactIds')
}
