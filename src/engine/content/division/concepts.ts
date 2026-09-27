import { canonicalFactId, multiplicationConceptId, type ConceptRelationship } from '../../contracts'

export const DIVISION_SKILL_ID = 'division'

export interface DivisionConcept {
  id: string
  dividend: number
  divisor: number
  quotient: number
  inverseConceptId: string
}

export function divisionConceptId(dividend: number, divisor: number): string {
  return `division.fact.${dividend}÷${divisor}`
}

/** Every ÷ fact within 100 whose divisor and quotient are 1–10. 56÷7 and 56÷8 stay distinct. */
export function buildDivisionConcepts(): DivisionConcept[] {
  const concepts: DivisionConcept[] = []
  for (let divisor = 1; divisor <= 10; divisor++) {
    for (let quotient = 1; quotient <= 10; quotient++) {
      const dividend = divisor * quotient
      if (dividend > 100) continue
      concepts.push({
        id: divisionConceptId(dividend, divisor),
        dividend,
        divisor,
        quotient,
        inverseConceptId: multiplicationConceptId(canonicalFactId(divisor, quotient)),
      })
    }
  }
  return concepts
}

export const DIVISION_CONCEPTS: readonly DivisionConcept[] = buildDivisionConcepts()

export function divisionRelationships(
  concepts: readonly DivisionConcept[] = DIVISION_CONCEPTS,
): ConceptRelationship[] {
  return concepts.map((concept) => ({
    fromId: concept.id,
    toId: concept.inverseConceptId,
    kind: 'inverse',
  }))
}

export function divisionConceptById(id: string): DivisionConcept | undefined {
  return DIVISION_CONCEPTS.find((concept) => concept.id === id)
}
