import {
  levelIndexOf,
  type LevelDef,
  type LevelId,
  type SkillCurriculum,
} from '../contracts'
import { buildMultiplicationLevels } from '../content/multiplication/levels'
import { MULTIPLICATION_SKILL_ID } from '../content/multiplication/plugin'

/** D0: grade 3 → multiplication, factors 1–10. */
const MULTIPLICATION_GRADE = 3

function freezeLevel(level: LevelDef): LevelDef {
  Object.freeze(level.conceptIds)
  Object.freeze(level.gatingConceptIds)
  Object.freeze(level.introConceptIds)
  Object.freeze(level.tables)
  Object.freeze(level.tableFactIds)
  Object.freeze(level.ownedFactIds)
  Object.freeze(level.gatingFactIds)
  Object.freeze(level.introFactIds)
  return Object.freeze(level)
}

let multiplication: SkillCurriculum | null = null

function multiplicationCurriculum(): SkillCurriculum {
  if (!multiplication) {
    const levels = buildMultiplicationLevels().map(freezeLevel)
    multiplication = Object.freeze({
      skillId: MULTIPLICATION_SKILL_ID,
      grade: MULTIPLICATION_GRADE,
      levels: Object.freeze(levels) as LevelDef[],
    })
  }
  return multiplication
}

/** The curriculum for a skill (default: multiplication). Throws for an unknown skill. Frozen, shared. */
export function getCurriculum(skillId: string = MULTIPLICATION_SKILL_ID): SkillCurriculum {
  if (skillId === MULTIPLICATION_SKILL_ID) return multiplicationCurriculum()
  throw new Error(`Unknown skill: ${skillId}`)
}

/** Level by ID. Throws for an unknown level. */
export function getLevel(
  levelId: LevelId,
  curriculum: SkillCurriculum = getCurriculum(),
): LevelDef {
  const index = levelIndexOf(levelId)
  const level = curriculum.levels[index - 1]
  if (!level || level.id !== levelId) {
    throw new Error(`Unknown level: ${levelId}`)
  }
  return level
}

/** The level after `levelId` on the ladder, or null at the top. */
export function nextLevel(
  levelId: LevelId,
  curriculum: SkillCurriculum = getCurriculum(),
): LevelDef | null {
  const level = getLevel(levelId, curriculum)
  return curriculum.levels[level.index] ?? null
}

/** Levels L1 … levelId inclusive, in ladder order. */
export function levelsUpTo(
  levelId: LevelId,
  curriculum: SkillCurriculum = getCurriculum(),
): LevelDef[] {
  const level = getLevel(levelId, curriculum)
  return curriculum.levels.slice(0, level.index)
}

/** Owner level of a canonical fact, or null for facts outside the core space. */
export function ownerLevelOf(
  factId: string,
  curriculum: SkillCurriculum = getCurriculum(),
): LevelDef | null {
  return curriculum.levels.find((l) => l.ownedFactIds.includes(factId)) ?? null
}

/** D2 step 1 review pool: facts owned by earlier levels and not in this level's table. */
export function reviewFactIds(
  levelId: LevelId,
  curriculum: SkillCurriculum = getCurriculum(),
): string[] {
  const level = getLevel(levelId, curriculum)
  const table = new Set(level.tableFactIds)
  const out: string[] = []
  for (const l of curriculum.levels) {
    if (l.index >= level.index) break
    for (const f of l.ownedFactIds) if (!table.has(f)) out.push(f)
  }
  return out
}

/** D2 step 2 queue scope: this level's table facts plus every fact owned by levels ≤ it. */
export function scopeFactIds(
  levelId: LevelId,
  curriculum: SkillCurriculum = getCurriculum(),
): ReadonlySet<string> {
  const level = getLevel(levelId, curriculum)
  const scope = new Set<string>(level.tableFactIds)
  for (const l of levelsUpTo(levelId, curriculum)) {
    for (const f of l.ownedFactIds) scope.add(f)
  }
  return scope
}
