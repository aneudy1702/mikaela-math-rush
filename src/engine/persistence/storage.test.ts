import { describe, expect, it } from 'vitest'
import {
  createMemoryStore,
  rehydrateProfile,
  PROFILE_STORAGE_KEY,
} from './storage'
import { createEmptyProfile, applyAttempt } from '../learning'

describe('learner profile persistence', () => {
  it('saves and reloads through memory store', () => {
    const store = createMemoryStore()
    const profile = store.load()
    profile.facts['7x8'] = applyAttempt(profile.facts['7x8']!, {
      correct: true,
      latencyMs: 900,
      atMs: 100,
    })
    profile.gameXp = 42
    store.save(profile)

    const loaded = store.load()
    expect(loaded.facts['7x8']!.attempts).toBe(1)
    expect(loaded.gameXp).toBe(42)
    expect(loaded.gameXp).not.toBe(loaded.facts['7x8']!.mastery)
  })

  it('rehydrates partial JSON without wiping core facts', () => {
    const raw = createEmptyProfile('Mikaela', 1)
    raw.facts['7x8'] = applyAttempt(raw.facts['7x8']!, {
      correct: true,
      latencyMs: 1000,
      atMs: 5,
    })
    // Simulate older/partial payload missing some keys.
    const partial = JSON.parse(JSON.stringify(raw)) as ReturnType<
      typeof createEmptyProfile
    >
    delete (partial as { bestStreakByMode?: unknown }).bestStreakByMode
    const restored = rehydrateProfile({
      ...partial,
      bestStreakByMode: {},
    })
    expect(restored.facts['7x8']!.attempts).toBe(1)
    expect(restored.facts['2x2']).toBeDefined()
    expect(restored.version).toBe(1)
  })

  it('uses a stable storage key', () => {
    expect(PROFILE_STORAGE_KEY).toContain('mikaela-math-rush')
  })

  it('clear resets profile', () => {
    const store = createMemoryStore()
    const p = store.load()
    p.gameXp = 99
    store.save(p)
    store.clear()
    expect(store.load().gameXp).toBe(0)
  })
})
