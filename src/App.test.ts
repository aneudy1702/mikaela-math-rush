// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  App,
  UI_PREFS_KEY,
  type AppProps,
  type InferenceRunner,
} from './App'
import {
  PENDING_NOTICES_KEY,
  PERSISTENCE_NOTICE_MESSAGES,
  PROFILE_STORAGE_KEY,
  createEmptyProfile,
  createLocalStorageStore,
  emptyFactEvidence,
  getCurriculum,
  getLevel,
  serializeProfile,
  type FactEvidence,
  type LearnerProfile,
  type LocalProfileStore,
  type StartLevelInference,
} from './engine'

const NOW = Date.UTC(2026, 8, 26, 15, 0, 0)
const AppComponent = App as React.ComponentType<AppProps>

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value))
  }
}

interface AppHarness {
  profileStorage: MemoryStorage
  uiStorage: MemoryStorage
  store: LocalProfileStore
}

function storedHarness(profile: LearnerProfile): AppHarness {
  const profileStorage = new MemoryStorage()
  const writer = createLocalStorageStore(profileStorage, { now: () => NOW })
  const saved = writer.save(profile)
  if (saved.status === 'failed') {
    throw new Error(`Could not seed test profile: ${saved.reason}`)
  }
  return {
    profileStorage,
    uiStorage: new MemoryStorage(),
    store: createLocalStorageStore(profileStorage, { now: () => NOW + 1 }),
  }
}

function renderHarness(
  harness: AppHarness,
  inferenceRunner?: InferenceRunner,
) {
  return render(
    React.createElement(AppComponent, {
      store: harness.store,
      uiStorage: harness.uiStorage,
      inferenceRunner,
    }),
  )
}

function startQuickRun(): void {
  fireEvent.click(screen.getByRole('button', { name: /Quick 10/i }))
}

function submitChoice(value: number): void {
  fireEvent.click(screen.getByRole('button', { name: `Answer ${value}` }))
}

function submitWrongChoice(): void {
  const correct = answerOnScreen()
  const wrong = screen
    .getAllByRole('button', { name: /^Answer \d+$/ })
    .find((button) => button.getAttribute('aria-label') !== `Answer ${correct}`)
  if (!wrong) throw new Error('No wrong answer choice on screen')
  fireEvent.click(wrong)
}

function answerOnScreen(): number {
  const expression = document.querySelector('.prompt-expression')?.textContent ?? ''
  const factors = expression.match(/(\d+)\s*[x×*]\s*(\d+)/)
  if (!factors) throw new Error(`Could not read multiplication prompt: ${expression}`)
  return Number(factors[1]) * Number(factors[2])
}

function finishPerfectQuickRun(): void {
  for (let answer = 0; answer < 10; answer += 1) {
    submitChoice(answerOnScreen())
  }
}

function masteredEvidence(factId: string): FactEvidence {
  const first = {
    correct: true,
    sessionId: 'mastery-a',
    sessionInferred: false,
    atMs: NOW - 2_000,
  }
  const second = {
    correct: true,
    sessionId: 'mastery-b',
    sessionInferred: false,
    atMs: NOW - 1_000,
  }
  return {
    ...emptyFactEvidence(factId),
    countedAttempts: 2,
    countedCorrect: 2,
    window: [first, second],
    correctSessionIds: [first.sessionId, second.sessionId],
    liveCorrectSession: true,
    recentCorrectLatenciesMs: [1_200, 1_100],
    lastAttemptAtMs: second.atMs,
    everMastered: true,
  }
}

function migratedProfile(): LearnerProfile {
  return {
    ...createEmptyProfile('Mikaela', NOW - 10_000),
    migration: {
      fromVersion: 1,
      migratedAtMs: NOW,
      v1Attempts: 0,
      migratedAttempts: 0,
      inferredSessions: 0,
      mergedFactKeys: [],
      droppedFactKeys: [],
      droppedPendingReinforcements: 0,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('T8 app wiring and screens', () => {
  it('holds a miss reveal without Next, then continues by card click and by Enter', () => {
    const harness = storedHarness(createEmptyProfile('Mikaela', NOW))
    renderHarness(harness)
    startQuickRun()

    submitWrongChoice()
    expect(screen.getByText('Got it')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/\bNext\b/i)

    fireEvent.click(screen.getByText('Got it').closest('button')!)
    expect(screen.queryByText('Got it')).not.toBeInTheDocument()
    expect(document.querySelector('.prompt-expression')).toBeInTheDocument()

    submitWrongChoice()
    expect(screen.getByText('Got it')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/\bNext\b/i)

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.queryByText('Got it')).not.toBeInTheDocument()
    expect(document.querySelector('.prompt-expression')).toBeInTheDocument()
  })

  it('calls the first eligible completed-level record a Baseline set', () => {
    const profile = createEmptyProfile('Mikaela', NOW)
    profile.progress.completedLevelIds = ['L1']
    profile.progress.unlockedLevelIds = ['L1', 'L2']
    profile.progress.currentLevelId = 'L1'
    const harness = storedHarness(profile)
    renderHarness(harness)

    startQuickRun()
    finishPerfectQuickRun()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Baseline set' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('New record!')).not.toBeInTheDocument()
    expect(screen.getByText('Your time')).toBeInTheDocument()
  })

  it('shows every pending persistence notice, then acknowledges the store on dismiss', () => {
    const harness = storedHarness(createEmptyProfile('Mikaela', NOW))
    harness.profileStorage.setItem(
      PENDING_NOTICES_KEY,
      JSON.stringify([
        { notice: 'damaged-history-backed-up', atMs: NOW - 2 },
        { notice: 'unreadable-v1-save', atMs: NOW - 1 },
      ]),
    )
    harness.store = createLocalStorageStore(harness.profileStorage, {
      now: () => NOW + 1,
    })
    const acknowledge = vi.spyOn(harness.store, 'acknowledgeNotices')
    renderHarness(harness)

    expect(
      screen.getByText(PERSISTENCE_NOTICE_MESSAGES['damaged-history-backed-up']),
    ).toBeInTheDocument()
    expect(
      screen.getByText(PERSISTENCE_NOTICE_MESSAGES['unreadable-v1-save']),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getAllByRole('button', { name: /Dismiss notice:/i })[0]!,
    )

    expect(acknowledge).toHaveBeenCalledTimes(1)
    expect(harness.store.pendingNotices()).toEqual([])
    expect(harness.profileStorage.getItem(PENDING_NOTICES_KEY)).toBeNull()
    expect(screen.queryByLabelText('Storage notices')).not.toBeInTheDocument()
  })

  it('never renders deferred L10, even when it appears in persisted unlock state', () => {
    const profile = createEmptyProfile('Mikaela', NOW)
    profile.progress.unlockedLevelIds = getCurriculum().levels.map((level) => level.id)
    profile.progress.currentLevelId = 'L9'
    const harness = storedHarness(profile)
    renderHarness(harness)

    expect(screen.queryByText('Speed challenge')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Level 10,/i }),
    ).not.toBeInTheDocument()
  })

  it('requires the full 1500ms parent hold to unlock a locked level', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const harness = storedHarness(createEmptyProfile('Mikaela', NOW))
    renderHarness(harness)
    const levelTwo = screen.getByRole('button', {
      name: /Level 2, .*Locked/i,
    })

    fireEvent.pointerDown(levelTwo, {
      button: 0,
      isPrimary: true,
      pointerId: 1,
    })
    act(() => vi.advanceTimersByTime(1_499))
    expect(levelTwo).toHaveAttribute('data-state', 'locked')

    act(() => vi.advanceTimersByTime(1))
    expect(levelTwo).toHaveAttribute('data-state', 'unlocked')
    fireEvent.pointerUp(levelTwo, { pointerId: 1 })

    const persisted = createLocalStorageStore(harness.profileStorage).load()
    expect(persisted.progress.unlockedLevelIds).toContain('L2')
    expect(persisted.progress.completedLevelIds).not.toContain('L2')
  })

  it('shows the underway-level Practice nudge and persists its dismissal', () => {
    const profile = createEmptyProfile('Mikaela', NOW)
    const masteredFactId = getLevel('L1').gatingFactIds[0]!
    profile.progress.factEvidence[masteredFactId] = masteredEvidence(masteredFactId)
    const harness = storedHarness(profile)
    const view = renderHarness(harness)

    expect(screen.getByText('Want to build progress faster?')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss practice suggestion' }),
    )
    expect(
      screen.queryByText('Want to build progress faster?'),
    ).not.toBeInTheDocument()
    expect(JSON.parse(harness.uiStorage.getItem(UI_PREFS_KEY)!)).toMatchObject({
      practiceNudgeDismissedLevelId: 'L1',
    })

    view.unmount()
    harness.store = createLocalStorageStore(harness.profileStorage, {
      now: () => NOW + 2,
    })
    renderHarness(harness)
    expect(
      screen.queryByText('Want to build progress faster?'),
    ).not.toBeInTheDocument()
  })

  it('keeps a newer-version profile visibly read-only on Home and Play', () => {
    const profileStorage = new MemoryStorage()
    const newer = JSON.parse(
      serializeProfile(createEmptyProfile('Mikaela', NOW)),
    ) as Record<string, unknown>
    newer.version = 3
    const newerBlob = JSON.stringify(newer)
    profileStorage.setItem(PROFILE_STORAGE_KEY, newerBlob)
    const harness: AppHarness = {
      profileStorage,
      uiStorage: new MemoryStorage(),
      store: createLocalStorageStore(profileStorage, { now: () => NOW }),
    }
    renderHarness(harness)

    expect(screen.getByRole('alert')).toHaveTextContent(
      PERSISTENCE_NOTICE_MESSAGES['newer-version-read-only'],
    )

    startQuickRun()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Progress is not being saved.',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      PERSISTENCE_NOTICE_MESSAGES['newer-version-read-only'],
    )
    expect(profileStorage.getItem(PROFILE_STORAGE_KEY)).toBe(newerBlob)
  })

  it('runs migration inference once across rerender and remount using UI prefs', () => {
    const harness = storedHarness(migratedProfile())
    const insufficient: StartLevelInference = {
      outcome: 'insufficient',
      recommendedLevelId: null,
      verdicts: [],
      attemptsConsidered: 0,
      masteredFactIds: [],
    }
    const inferenceRunner = vi.fn(() => insufficient)
    const view = renderHarness(harness, inferenceRunner)

    expect(inferenceRunner).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('heading', { name: 'Want help choosing a level?' }),
    ).toBeInTheDocument()

    view.rerender(
      React.createElement(AppComponent, {
        store: harness.store,
        uiStorage: harness.uiStorage,
        inferenceRunner,
      }),
    )
    expect(inferenceRunner).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(JSON.parse(harness.uiStorage.getItem(UI_PREFS_KEY)!)).toMatchObject({
      inferenceHandledMigrationAtMs: NOW,
      startPrompt: { kind: 'warm-up' },
    })

    harness.store = createLocalStorageStore(harness.profileStorage, {
      now: () => NOW + 2,
    })
    renderHarness(harness, inferenceRunner)
    expect(inferenceRunner).toHaveBeenCalledTimes(1)
  })

  it('retries start-level inference when the recommended profile could not be saved', () => {
    const harness = storedHarness(migratedProfile())
    const recommend: StartLevelInference = {
      outcome: 'recommend',
      recommendedLevelId: 'L3',
      verdicts: [],
      attemptsConsidered: 12,
      masteredFactIds: [],
    }
    const inferenceRunner = vi.fn(() => recommend)
    const failingStore: LocalProfileStore = {
      ...harness.store,
      save: () => ({ status: 'failed', reason: 'quota' }),
    }
    const view = renderHarness({ ...harness, store: failingStore }, inferenceRunner)

    expect(inferenceRunner).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('heading', { name: 'We picked Level 3 for you' }),
    ).toBeInTheDocument()
    expect(harness.uiStorage.getItem(UI_PREFS_KEY)).toBeNull()

    view.unmount()
    harness.store = createLocalStorageStore(harness.profileStorage, {
      now: () => NOW + 2,
    })
    renderHarness(harness, inferenceRunner)
    expect(inferenceRunner).toHaveBeenCalledTimes(2)
  })
})
