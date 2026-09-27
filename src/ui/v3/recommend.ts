export interface ShippedSkill {
  id: string
  title: string
  grade: number
}

export const SHIPPED_SKILLS: readonly ShippedSkill[] = [
  { id: 'multiplication', title: 'Multiplication', grade: 3 },
  { id: 'division', title: 'Division', grade: 3 },
  { id: 'fractions', title: 'Fractions', grade: 4 },
  { id: 'algebra-one-step', title: 'One-Step Equations', grade: 6 },
]

export const COMING_LATER = [{ title: 'Geometry & Area' }] as const

export function skillTitle(skillId: string): string {
  return SHIPPED_SKILLS.find((skill) => skill.id === skillId)?.title ?? skillId
}

/** Grade is recommendation metadata. Continue reads lastActivePath instead. */
export function recommendedSkill(grade: number | undefined): ShippedSkill {
  if (grade == null) return SHIPPED_SKILLS[0]!
  const fit = SHIPPED_SKILLS.filter((skill) => skill.grade <= grade)
  return fit[fit.length - 1] ?? SHIPPED_SKILLS[0]!
}
