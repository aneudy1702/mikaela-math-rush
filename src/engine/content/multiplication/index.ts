export {
  ALL_FACT_IDS,
  CORE_FACTS,
  STRETCH_FACTS,
  bandForFactors,
  factsInBands,
  getFact,
  type MultFact,
} from './facts'

/** D9 canonical fact identity lives in contracts (strict parse). */
export { canonicalFactId, parseFactId } from '../../contracts'

export {
  MULTIPLICATION_SKILL_ID,
  createMultiplicationSkill,
  generateForFact,
  resetQuestionSeq,
} from './plugin'

export { CHOICE_COUNT, multiplicationChoices } from './choices'

export { buildMultiplicationLevels } from './levels'
