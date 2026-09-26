import { describe, expect, it } from 'vitest'
import * as engine from './index'

/**
 * T0 pre-creates every export T1–T6 implement, so later tickets never edit a barrel.
 * This only checks presence (implementations replace the stubs later).
 */
const EXPECTED_FUNCTIONS: Record<string, string[]> = {
  T0: [
    'canonicalFactId',
    'parseFactId',
    'isCanonicalFactId',
    'isCoreFactId',
    'levelIdOf',
    'levelIndexOf',
    'isLevelId',
    'recordKeyId',
    'createEmptyProfile',
    'createEmptySkillProgress',
    'createEmptyPlayerProgress',
    'createLocalStorageStore',
    'loadProfileFromStorage',
    'migrateV1ToV2',
    'capRawLog',
    'encodeRawLog',
    'decodeRawLog',
  ],
  T1: [
    'buildMultiplicationLevels',
    'getCurriculum',
    'getLevel',
    'nextLevel',
    'levelsUpTo',
    'ownerLevelOf',
    'reviewFactIds',
    'scopeFactIds',
  ],
  T2: [
    'recordKey',
    'buildSessionLogEntry',
    'appendSessionLog',
    'evaluateRecord',
    'applyRecordEvaluation',
  ],
  T3: [
    'xpForSession',
    'levelForXp',
    'xpToReachLevel',
    'titleForLevel',
    'progressLevelId',
    'getBadgeDefs',
    'evaluateBadges',
  ],
  T4: [
    'countedFlags',
    'countedAttempts',
    'emptyFactEvidence',
    'applyAttemptToEvidence',
    'factStatus',
    'factMarks',
    'isLikelyCorrect',
    'levelAllowance',
    'evaluateTableLevel',
    'evaluateMixedLevel',
    'rebuildEvidence',
    'detectComebacks',
    'levelMarksTotal',
    'evaluateAdvancement',
  ],
  T5: [
    'levelSelectionPools',
    'selectLevelFact',
    'fluencySlownessWeight',
    'filterPendingToScope',
  ],
  T6: [
    'startPlacement',
    'nextProbe',
    'recordProbe',
    'placementResult',
    'applyPlacementResult',
    'inferStartLevel',
    'applyStartLevelInference',
  ],
}

describe('engine barrel', () => {
  for (const [ticket, names] of Object.entries(EXPECTED_FUNCTIONS)) {
    it(`exports ${ticket} functions`, () => {
      const exports = engine as unknown as Record<string, unknown>
      for (const name of names) {
        expect(typeof exports[name], name).toBe('function')
      }
    })
  }

  it('exports RULES and SPEC_CONSTANTS', () => {
    expect(engine.RULES.windowSize).toBe(4)
    expect(engine.SPEC_CONSTANTS.sessionLogMax).toBe(200)
  })
})
