import type { LevelDef } from '../contracts'
import { MULTIPLICATION_SKILL_ID } from '../content/multiplication/plugin'

/**
 * Temporary Multiplication bridge.
 *
 * `gatingConceptIds` is the V3 curriculum contract. Live V2 evidence is still
 * keyed by canonical fact ids, so Multiplication completion still receives
 * `gatingFactIds`. Every other skill receives `gatingConceptIds` only.
 *
 * Remove the Multiplication branch when the session engine reads household
 * evidence keyed by concept id. Do not add another skill to this branch.
 */
export function completionGatingIds(level: LevelDef): readonly string[] {
  if (level.skillId === MULTIPLICATION_SKILL_ID) return level.gatingFactIds
  return level.gatingConceptIds
}
