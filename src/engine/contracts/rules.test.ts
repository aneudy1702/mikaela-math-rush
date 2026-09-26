import { describe, expect, it } from 'vitest'
import { RULES, SPEC_CONSTANTS } from './rules'
import { levelIdOf, levelIndexOf, isLevelId } from './curriculum'
import { recordKeyId } from './records'

describe('RULES (DECISIONS §B0 revision 4)', () => {
  it('matches §B0 exactly', () => {
    expect(RULES).toEqual({
      windowSize: 4,
      masteredMinCorrectInWindow: 3,
      fastTrackMinAttempts: 2,
      minDistinctSessionsForMastery: 2,
      struggleMinAttempts: 3,
      struggleMaxCorrectInWindow: 1,
      allowanceFraction: 0.2,
      allowanceMin: 1,
      levelAccuracyMin: 0.85,
      levelAccuracyWindow: 20,
      minSessionsAtLevel: 2,
      maxStrugglingTableFacts: 1,
      mixedAccuracyMin: 0.85,
      mixedMinAnswers: 50,
      mixedMinSessions: 3,
      mixedMinDays: 2,
      mixedMaxStruggling: 2,
      evidenceBufferMax: 300,
      statusWeight: { struggling: 4, learning: 3, new: 2.5, mastered: 1 },
      fluencySlowness: { fastMaxMs: 3000, slowOverMs: 6000, fast: 0.8, mid: 1.0, slow: 1.3, sampleSize: 4 },
      reviewShare: 0.15,
      reviewShareWithCarried: 0.25,
      introShareMaxL1: 0.2,
      successFloor: 0.4,
      carriedHardCap: { quick: 1, practice: 2, rush: 8 },
      reintroduceDelayRange: [3, 8],
      laterCheckDelayRange: [5, 12],
      recordMinAccuracy: 0.9,
      dropDownOfferAccuracy: 0.7,
      dropDownOfferSessions: 2,
      placementMaxQuestions: 12,
      inferenceMaxAgeDays: 30,
      inferenceSessionGapMs: 1_800_000,
      inferenceMinAttemptsPerFact: 3,
      clearFailAccuracy: 0.7,
      clearFailMinAttempts: 10,
      marksMax: 3,
      rawLogMaxAttempts: 20_000,
      xp: {
        perCorrect: 1,
        completedLevelCorrectPerXp: 5,
        completionBonus: { quick: 10, practice: 25, rush: 100 },
        completedLevelBonusMultiplier: 0.2,
        perfectBonusFraction: 0.5,
        factMastered: 5,
        levelCompleted: 100,
        recordBeaten: 25,
        recordBeatenMaxPerDay: 1,
        levelCurveFactor: 25,
      },
      rulesVersion: 1,
    })
  })

  it('has no revision-3 leftovers', () => {
    const keys = Object.keys(RULES)
    for (const gone of ['provisionalEnabled', 'provisionalMinCorrect', 'confirmDelayRange', 'slowness', 'mixedWindow']) {
      expect(keys).not.toContain(gone)
    }
  })

  it('is deeply frozen', () => {
    expect(Object.isFrozen(RULES)).toBe(true)
    expect(Object.isFrozen(RULES.xp)).toBe(true)
    expect(Object.isFrozen(RULES.xp.completionBonus)).toBe(true)
    expect(Object.isFrozen(RULES.reintroduceDelayRange)).toBe(true)
    expect(Object.isFrozen(SPEC_CONSTANTS.playerTitles[0])).toBe(true)
    expect(() => {
      ;(RULES as { windowSize: number }).windowSize = 5
    }).toThrow()
  })

  it('D6 level curve examples', () => {
    const f = RULES.xp.levelCurveFactor
    const toReach = (l: number) => f * l * (l - 1)
    expect([2, 5, 10, 20, 30].map(toReach)).toEqual([50, 500, 2250, 9500, 21750])
  })
})

describe('frozen ID formats', () => {
  it('level IDs are L<index>', () => {
    expect(levelIdOf(1)).toBe('L1')
    expect(levelIdOf(10)).toBe('L10')
    expect(levelIndexOf('L9')).toBe(9)
    expect(isLevelId('L0')).toBe(false)
    expect(isLevelId('L01')).toBe(false)
    expect(() => levelIndexOf('9')).toThrow()
    expect(() => levelIdOf(0)).toThrow()
  })

  it('record key ID includes skill, level, mode and rulesVersion', () => {
    expect(
      recordKeyId({ skillId: 'multiplication', levelId: 'L3', mode: 'quick', rulesVersion: 1 }),
    ).toBe('multiplication|L3|quick|v1')
  })
})
