import { createAlgebraSkill } from '../../engine/content/algebra/plugin'
import { createDivisionSkill } from '../../engine/content/division/plugin'
import { createFractionsSkill } from '../../engine/content/fractions/plugin'
import { createMultiplicationSkill } from '../../engine/content/multiplication/plugin'
import type { MathSkill } from '../../engine/contracts'
import '../../engine/curriculum/shipped'

const FACTORIES = new Map<string, () => MathSkill>([
  ['multiplication', () => createMultiplicationSkill()],
  ['division', () => createDivisionSkill()],
  ['fractions', () => createFractionsSkill()],
  ['algebra-one-step', () => createAlgebraSkill()],
])

export function skillFor(skillId: string): MathSkill {
  const make = FACTORIES.get(skillId)
  if (!make) throw new Error(`Unknown skill: ${skillId}`)
  return make()
}
