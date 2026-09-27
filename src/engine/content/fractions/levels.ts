import { levelIdOf, type ConceptLevel } from '../../contracts'
import { FRACTION_CONCEPTS, FRACTIONS_SKILL_ID } from './catalog'

export function buildFractionLevels(): ConceptLevel[] {
  return FRACTION_CONCEPTS.map((concept, offset) => {
    const index = offset + 1
    return {
      id: levelIdOf(index),
      skillId: FRACTIONS_SKILL_ID,
      index,
      kind: 'table',
      title: concept.title,
      conceptIds: [concept.id],
      gatingConceptIds: [concept.id],
      introConceptIds: [],
    }
  })
}
