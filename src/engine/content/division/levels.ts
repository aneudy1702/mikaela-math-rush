import { levelIdOf, type ConceptLevel } from '../../contracts'
import { DIVISION_CONCEPTS, DIVISION_SKILL_ID, type DivisionConcept } from './concepts'

const TABLE_LEVELS: readonly { title: string; divisors: readonly number[] }[] = [
  { title: 'Divide by 1 and 2', divisors: [1, 2] },
  { title: 'Divide by 10', divisors: [10] },
  { title: 'Divide by 5', divisors: [5] },
  { title: 'Divide by 3', divisors: [3] },
  { title: 'Divide by 4', divisors: [4] },
  { title: 'Divide by 6', divisors: [6] },
  { title: 'Divide by 7', divisors: [7] },
  { title: 'Divide by 8 and 9', divisors: [8, 9] },
]

function ownedBy(divisors: readonly number[]): DivisionConcept[] {
  const set = new Set(divisors)
  return DIVISION_CONCEPTS.filter((concept) => set.has(concept.divisor))
}

export function buildDivisionLevels(): ConceptLevel[] {
  const levels: ConceptLevel[] = TABLE_LEVELS.map((spec, offset) => {
    const owned = ownedBy(spec.divisors)
    const introConceptIds = owned.filter((concept) => concept.divisor === 1).map((concept) => concept.id)
    const gatingConceptIds = owned.filter((concept) => concept.divisor !== 1).map((concept) => concept.id)
    const index = offset + 1
    return {
      id: levelIdOf(index),
      skillId: DIVISION_SKILL_ID,
      index,
      kind: 'table',
      title: spec.title,
      conceptIds: [...gatingConceptIds, ...introConceptIds],
      gatingConceptIds,
      introConceptIds,
    }
  })

  const index = levels.length + 1
  levels.push({
    id: levelIdOf(index),
    skillId: DIVISION_SKILL_ID,
    index,
    kind: 'mixed',
    title: 'Mixed division within 100',
    conceptIds: [],
    gatingConceptIds: [],
    introConceptIds: [],
  })
  return levels
}
