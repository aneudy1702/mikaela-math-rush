import type { ConceptLevel } from '../contracts'
import { buildMultiplicationLevels } from '../content/multiplication/levels'
import { MULTIPLICATION_SKILL_ID } from '../content/multiplication/plugin'
import type { LevelDef } from '../contracts'

export interface RegisteredSkill {
  id: string
  grade: number
  domain: string
  title: string
  levels: readonly ConceptLevel[]
}

const MULTIPLICATION_GRADE = 3

function conceptLevel(level: LevelDef): ConceptLevel {
  return {
    id: level.id,
    skillId: level.skillId,
    index: level.index,
    kind: level.kind,
    title: level.title,
    conceptIds: level.conceptIds,
    gatingConceptIds: level.gatingConceptIds,
    introConceptIds: level.introConceptIds,
  }
}

function multiplicationSkill(): RegisteredSkill {
  return {
    id: MULTIPLICATION_SKILL_ID,
    grade: MULTIPLICATION_GRADE,
    domain: 'operations-algebraic-thinking',
    title: 'Multiplication',
    levels: buildMultiplicationLevels().map(conceptLevel),
  }
}

const skills = new Map<string, RegisteredSkill>([
  [MULTIPLICATION_SKILL_ID, multiplicationSkill()],
])

/** Live skills. Additional plugins register themselves from the shipped module. */
export function listRegisteredSkills(): readonly RegisteredSkill[] {
  return [...skills.values()]
}

export function findRegisteredSkill(skillId: string): RegisteredSkill | undefined {
  return skills.get(skillId)
}

export function registerSkill(skill: RegisteredSkill): void {
  skills.set(skill.id, skill)
}

export function getRegisteredSkill(skillId: string): RegisteredSkill {
  const skill = skills.get(skillId)
  if (!skill) throw new Error(`Unknown skill: ${skillId}`)
  return skill
}

/** Concepts owned by earlier levels and not already on this level. */
export function reviewConceptIds(skillId: string, levelId: string): readonly string[] {
  const levels = getRegisteredSkill(skillId).levels
  const level = levels.find((item) => item.id === levelId)
  if (!level) throw new Error(`Unknown level: ${levelId}`)
  const here = new Set(level.conceptIds)
  const out: string[] = []
  for (const earlier of levels) {
    if (earlier.index >= level.index) break
    for (const id of earlier.conceptIds) if (!here.has(id)) out.push(id)
  }
  return out
}

export function ownerLevelOfConcept(skillId: string, conceptId: string): ConceptLevel | null {
  return (
    getRegisteredSkill(skillId).levels.find((level) => level.conceptIds.includes(conceptId)) ??
    null
  )
}
