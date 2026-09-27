import { describe, expect, it } from 'vitest'
import { multiplicationConceptId } from '../contracts'
import { buildMultiplicationLevels } from '../content/multiplication/levels'
import { evaluateTableLevel } from '../learning/advancement'
import { emptyFactEvidence } from '../learning/advancement'
import { completionGatingIds } from './bridge'
import { getRegisteredSkill, listRegisteredSkills, ownerLevelOfConcept } from './registry'
import { getCurriculum } from './curriculum'

describe('skill registry', () => {
  it('registers multiplication through concept levels only', () => {
    expect(listRegisteredSkills().map((skill) => skill.id)).toEqual(['multiplication'])
    const skill = getRegisteredSkill('multiplication')
    const live = getCurriculum('multiplication')
    expect(skill.levels).toHaveLength(live.levels.length)
    const l7 = skill.levels.find((level) => level.id === 'L7')!
    expect(l7.gatingConceptIds).toEqual([
      multiplicationConceptId('7x7'),
      multiplicationConceptId('7x8'),
      multiplicationConceptId('7x9'),
    ])
    expect(JSON.stringify(skill)).not.toContain('gatingFactIds')
    expect(ownerLevelOfConcept('multiplication', multiplicationConceptId('7x8'))?.id).toBe('L7')
  })

  it('matches the live multiplication ladder concept for concept', () => {
    const registered = getRegisteredSkill('multiplication').levels
    const built = buildMultiplicationLevels()
    expect(registered.map((level) => [...level.gatingConceptIds])).toEqual(
      built.map((level) => level.gatingFactIds.map(multiplicationConceptId)),
    )
  })
})

describe('completionGatingIds', () => {
  it('uses fact ids for multiplication and concept ids for every other skill', () => {
    const level = buildMultiplicationLevels()[6]!
    expect(completionGatingIds(level)).toEqual(level.gatingFactIds)
    expect(completionGatingIds(level)).not.toEqual(level.gatingConceptIds)

    const other = {
      ...level,
      skillId: 'division',
      gatingFactIds: ['should-not-be-read'],
      gatingConceptIds: ['division.fact.56÷7'],
      conceptIds: ['division.fact.56÷7'],
      tableFactIds: [],
    }
    const evidence = emptyFactEvidence('division.fact.56÷7')
    evidence.countedAttempts = 2
    evidence.countedCorrect = 2
    evidence.liveCorrectSession = true
    evidence.correctSessionIds = ['a', 'b']
    evidence.window = [
      { correct: true, sessionId: 'a', sessionInferred: false, atMs: 1 },
      { correct: true, sessionId: 'b', sessionInferred: false, atMs: 2 },
    ]
    const checks = evaluateTableLevel(
      other,
      { 'division.fact.56÷7': evidence },
      Array.from({ length: 20 }, () => ({
        factId: 'division.fact.56÷7',
        correct: true,
        sessionId: 'b',
        dayKey: '2026-09-01',
      })),
      2,
    )
    expect(checks.r1).toMatchObject({ n: 1, mastered: 1, allowance: 0, pass: true })
  })
})
