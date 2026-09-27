import { levelIdOf, type ConceptLevel } from '../../contracts'
import { ALGEBRA_CONCEPTS, ALGEBRA_SKILL_ID } from './catalog'

export function buildAlgebraLevels(): ConceptLevel[] {
  const focused: ConceptLevel[] = ALGEBRA_CONCEPTS.map((concept, offset) => {
    const index = offset + 1
    return {
      id: levelIdOf(index),
      skillId: ALGEBRA_SKILL_ID,
      index,
      kind: 'table',
      title: concept.title,
      conceptIds: [concept.id],
      gatingConceptIds: [concept.id],
      introConceptIds: [],
    }
  })
  const index = focused.length + 1
  focused.push({
    id: levelIdOf(index),
    skillId: ALGEBRA_SKILL_ID,
    index,
    kind: 'mixed',
    title: 'Mixed one-step equations',
    conceptIds: [],
    gatingConceptIds: [],
    introConceptIds: [],
  })
  return focused
}
