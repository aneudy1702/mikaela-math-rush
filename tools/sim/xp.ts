// D6 XP for one finished session.
import type { Mode, Rules } from './rules.ts'

export interface XpInput {
  mode: Mode
  /** Level was already completed before this session (replay). */
  levelCompletedBefore: boolean
  /** Level is the progress level (lowest unlocked not completed). */
  isProgressLevel: boolean
  correct: number
  perfect: boolean
  /** First finish of this level+mode (pays full bonus even on a completed level). */
  firstFinishLevelMode: boolean
  newlyMastered: number
  levelCompletedNow: boolean
  recordBeaten: boolean
  recordXpAvailableToday: boolean
}

export interface XpBreakdown {
  perCorrect: number
  bonus: number
  perfect: number
  factMastered: number
  levelCompleted: number
  record: number
  total: number
  /** perCorrect + bonus + perfect (repeatable part). */
  repeatable: number
}

export function xpForSession(i: XpInput, r: Rules): XpBreakdown {
  const x = r.xp
  const perCorrect = i.levelCompletedBefore ? Math.floor(i.correct / x.completedLevelCorrectPerXp) : i.correct * x.perCorrect
  const fullBonus = x.completionBonus[i.mode]
  const bonus = i.levelCompletedBefore && !i.firstFinishLevelMode ? fullBonus * x.completedLevelBonusMultiplier : fullBonus
  const perfect = i.perfect ? bonus * x.perfectBonusFraction : 0
  const factMastered = i.newlyMastered * x.factMastered
  const levelCompleted = i.levelCompletedNow ? x.levelCompleted : 0
  const record = i.recordBeaten && i.isProgressLevel && i.recordXpAvailableToday ? x.recordBeaten : 0
  const repeatable = perCorrect + bonus + perfect
  return { perCorrect, bonus, perfect, factMastered, levelCompleted, record, total: repeatable + factMastered + levelCompleted + record, repeatable }
}
