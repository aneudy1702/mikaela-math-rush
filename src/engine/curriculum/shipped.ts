import { createAlgebraSkill } from '../content/algebra/plugin'
import { buildAlgebraLevels } from '../content/algebra/levels'
import { createDivisionSkill } from '../content/division/plugin'
import { buildDivisionLevels } from '../content/division/levels'
import { createFractionsSkill } from '../content/fractions/plugin'
import { buildFractionLevels } from '../content/fractions/levels'
import type { ConceptLevel, MathSkill } from '../contracts'
import { registerSkill } from './registry'

function register(skill: MathSkill, title: string, levels: readonly ConceptLevel[]): void {
  registerSkill({
    id: skill.id,
    grade: skill.grade,
    domain: skill.domain,
    title,
    levels,
  })
}

register(createDivisionSkill(() => 0), 'Division', buildDivisionLevels())
register(createFractionsSkill(() => 0), 'Fractions', buildFractionLevels())
register(createAlgebraSkill(() => 0), 'One-step equations', buildAlgebraLevels())
