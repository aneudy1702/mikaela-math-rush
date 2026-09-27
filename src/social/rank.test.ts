import { describe, expect, it } from 'vitest'
import { FAMILY_BOARD, FAMILY_RUSH_CONTEXT } from './fixtures'
import { rankEntries } from './rank'
import type { LeaderboardEntry } from './contracts'

describe('social rank', () => {
  it('puts a perfect finish ahead of a faster, less accurate finish', () => {
    const ranked = rankEntries(FAMILY_BOARD)
    expect(ranked.map((entry) => entry.nickname)).toEqual(['Mikaela', 'Adrian', 'Noa', 'Sam'])
    expect(ranked[0]?.elapsedMs).toBeGreaterThan(ranked[2]?.elapsedMs ?? 0)
    expect(ranked.every((entry) => entry.context.skillId === 'multiplication')).toBe(true)
    expect(ranked.every((entry) => entry.context.levelId === 'L7')).toBe(true)
    expect(ranked.every((entry) => entry.context.mode === 'rush')).toBe(true)
  })

  it('does not rank a different skill, level, or mode on the same board', () => {
    const other: LeaderboardEntry = {
      nickname: 'Other',
      avatarLabel: 'O',
      context: { ...FAMILY_RUSH_CONTEXT, skillId: 'division', skillTitle: 'Division' },
      correct: 100,
      answered: 100,
      completed: true,
      elapsedMs: 1,
    }
    expect(() => rankEntries([...FAMILY_BOARD, other])).toThrow(/skill, level, and mode/)
  })
})
