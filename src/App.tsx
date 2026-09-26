import { useEffect, useRef, useState } from 'react'
import type { PersistenceNoticeItem } from './components/PersistenceBanner'
import {
  PERSISTENCE_NOTICE_MESSAGES,
  LevelSessionEngine,
  applyStartLevelInference,
  canStartLevel,
  createLocalStorageStore,
  createMultiplicationSkill,
  dropDownOffer,
  factDisplayValue,
  getCurriculum,
  getLevel,
  inferStartLevel,
  levelIndexOf,
  recordKey,
  recordKeyId,
  type LearnerProfile,
  type LevelId,
  type LevelProgressFact,
  type LevelSessionSnapshot,
  type LocalProfileStore,
  type PendingNotice,
  type PersistenceAlert,
  type ProfileLoadResult,
  type SaveResult,
  type SessionMode,
  type SessionResultSummaryV2,
  type StartLevelInference,
} from './engine'
import {
  gameAudio,
  isMuted as readMuted,
  playSfx,
  toggleMuted,
  unlockAudio,
  type SfxEvent,
} from './audio/engine'
import {
  HomeScreen,
  type DropDownPrompt,
  type StartPrompt,
} from './screens/HomeScreen'
import { PlacementScreen } from './screens/PlacementScreen'
import { PlayScreen } from './screens/PlayScreen'
import { ResultsScreen } from './screens/ResultsScreen'

type Screen = 'home' | 'placement' | 'play' | 'results'

export const UI_PREFS_KEY = 'mikaela-math-rush:ui-prefs'

export interface UiPreferences {
  inferenceHandledMigrationAtMs?: number
  startPrompt?: StartPrompt
  dropDownDismissedFor?: string
  practiceNudgeDismissedLevelId?: LevelId
}

export type InferenceRunner = (
  profile: LearnerProfile,
  nowMs?: number,
  load?: ProfileLoadResult | null,
) => StartLevelInference

interface AppBootstrap {
  profile: LearnerProfile
  load: ProfileLoadResult | null
  preferences: UiPreferences
  pendingNotices: PendingNotice[]
  bootstrapSaveResults: SaveResult[]
}

interface ActiveSession {
  engine: LevelSessionEngine
  snapshot: LevelSessionSnapshot
  levelProgress: LevelProgressFact[]
  bestTimeMs?: number
}

interface ResultState {
  summary: SessionResultSummaryV2
  levelProgress: LevelProgressFact[]
  levelTitle: string
}

export interface AppProps {
  store?: LocalProfileStore
  uiStorage?: Storage | null
  inferenceRunner?: InferenceRunner
}

const skill = createMultiplicationSkill()
const defaultStore = createLocalStorageStore()
const defaultUiStorage = browserStorage()
let noticeSequence = 0

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readUiPreferences(storage: Storage | null): UiPreferences {
  if (!storage) return {}
  try {
    const parsed = JSON.parse(storage.getItem(UI_PREFS_KEY) ?? '{}') as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as UiPreferences : {}
  } catch {
    return {}
  }
}

function writeUiPreferences(storage: Storage | null, preferences: UiPreferences) {
  if (!storage) return
  try {
    storage.setItem(UI_PREFS_KEY, JSON.stringify(preferences))
  } catch {
    // UI preferences are optional and must never block learning progress.
  }
}

/**
 * Load/migrate exactly once per App mount. The migration timestamp marker in UI prefs
 * also prevents an insufficient/contradictory inference from repeating on later loads.
 */
function initializeApp(
  store: LocalProfileStore,
  uiStorage: Storage | null,
  inferenceRunner: InferenceRunner = inferStartLevel,
): AppBootstrap {
  const loadedProfile = store.load()
  const load = store.lastLoad()
  let profile = loadedProfile
  const preferences = readUiPreferences(uiStorage)
  const migrationAtMs = profile.migration?.migratedAtMs
  const hasStartDecision =
    profile.progress.inferredStartLevelId !== undefined ||
    profile.progress.placementStartLevelId !== undefined
  const alreadyHandled =
    migrationAtMs !== undefined &&
    preferences.inferenceHandledMigrationAtMs === migrationAtMs
  let changedByInference = false

  let ranInference = false
  if (migrationAtMs !== undefined && !hasStartDecision && !alreadyHandled) {
    ranInference = true
    const inference = inferenceRunner(profile, undefined, load)
    preferences.inferenceHandledMigrationAtMs = migrationAtMs
    if (inference.outcome === 'recommend' && inference.recommendedLevelId) {
      profile = applyStartLevelInference(profile, inference)
      preferences.startPrompt = {
        kind: 'recommend',
        levelId: inference.recommendedLevelId,
      }
      changedByInference = true
    } else {
      preferences.startPrompt = { kind: 'warm-up' }
    }
  }

  const bootstrapSaveResults: SaveResult[] = []
  // A V1 migration must be written even when inference cannot recommend a level, or
  // every reload would migrate the same V1 backup again.
  const needsSave = load?.source === 'v1-migrated' || changedByInference
  if (needsSave) {
    bootstrapSaveResults.push(store.save(profile))
  }
  // The "already handled" marker is what stops inference from running again. Write it
  // only after a required save succeeds, so a failed save retries instead of dropping
  // the unlock. This session still keeps the prompt in memory.
  const saveFailed = bootstrapSaveResults.some((result) => result.status === 'failed')
  if (ranInference && !saveFailed) {
    writeUiPreferences(uiStorage, preferences)
  }

  return {
    profile,
    load,
    preferences,
    pendingNotices: store.pendingNotices(),
    bootstrapSaveResults,
  }
}

function pendingNoticeItems(notices: readonly PendingNotice[]): PersistenceNoticeItem[] {
  return notices.map((entry) => ({
    id: `pending-${entry.notice}-${entry.atMs}`,
    message: PERSISTENCE_NOTICE_MESSAGES[entry.notice],
  }))
}

function alertMessage(alert: PersistenceAlert): string {
  switch (alert.kind) {
    case 'notice':
      return PERSISTENCE_NOTICE_MESSAGES[alert.notice]
    case 'read-only':
      return PERSISTENCE_NOTICE_MESSAGES['newer-version-read-only']
    case 'evidence-stale-damaged-log':
      return 'Some older answer evidence was damaged. We rebuilt the progress we could recover.'
    case 'save-trimmed':
      return `Progress was saved, but ${alert.droppedAttempts} older answers and ${alert.droppedSessions} older sessions were removed to make room.`
    case 'save-failed':
      switch (alert.reason) {
        case 'newer-version':
          return PERSISTENCE_NOTICE_MESSAGES['newer-version-read-only']
        case 'storage-unavailable':
          return PERSISTENCE_NOTICE_MESSAGES['storage-unavailable']
        case 'quota':
          return 'Storage is full. This run is still on screen, but new progress could not be saved.'
        case 'backup-required':
          return 'Saved data needs a safe backup before new progress can be written.'
        case 'error':
          return 'The browser could not save this progress.'
      }
  }
}

function alertsForSaveResult(result: SaveResult): PersistenceAlert[] {
  if (result.status === 'failed') return [{ kind: 'save-failed', reason: result.reason }]
  const alerts: PersistenceAlert[] = []
  if (result.status === 'saved-trimmed') {
    alerts.push({
      kind: 'save-trimmed',
      droppedAttempts: result.droppedAttempts,
      droppedSessions: result.droppedSessions,
    })
  }
  if (result.notice) alerts.push({ kind: 'notice', notice: result.notice })
  return alerts
}

function persistentLoadWarning(load: ProfileLoadResult | null): string | null {
  if (load?.readOnly) return PERSISTENCE_NOTICE_MESSAGES['newer-version-read-only']
  if (load?.notice === 'storage-unavailable') {
    return PERSISTENCE_NOTICE_MESSAGES['storage-unavailable']
  }
  return null
}

function warningFromAlerts(alerts: readonly PersistenceAlert[]): string | null {
  const failed = [...alerts].reverse().find((alert) =>
    alert.kind === 'save-failed' || alert.kind === 'read-only',
  )
  return failed ? alertMessage(failed) : null
}

function runtimeItems(alerts: readonly PersistenceAlert[]): PersistenceNoticeItem[] {
  return alerts
    .filter((alert) => alert.kind !== 'notice')
    .map((alert) => ({
      id: `runtime-${++noticeSequence}`,
      message: alertMessage(alert),
    }))
}

function playableLevelId(profile: LearnerProfile): LevelId {
  const curriculum = getCurriculum(profile.progress.skillId)
  if (canStartLevel(profile, profile.progress.currentLevelId, curriculum)) {
    return profile.progress.currentLevelId
  }
  const unlocked = new Set(profile.progress.unlockedLevelIds)
  return [...curriculum.levels]
    .reverse()
    .find((level) => level.kind !== 'speed' && unlocked.has(level.id))?.id ?? 'L1'
}

function bestTime(
  profile: LearnerProfile,
  levelId: LevelId,
  mode: SessionMode,
): number | undefined {
  const key = recordKeyId(recordKey(profile.progress.skillId, levelId, mode))
  return profile.records[key]?.bestMs
}

function practiceNudgeVisible(
  profile: LearnerProfile,
  preferences: UiPreferences,
): boolean {
  const levelId = playableLevelId(profile)
  const level = getLevel(levelId)
  if (
    level.gatingFactIds.length === 0 ||
    profile.progress.completedLevelIds.includes(levelId) ||
    preferences.practiceNudgeDismissedLevelId === levelId
  ) {
    return false
  }
  const mastered = level.gatingFactIds.filter(
    (factId) => factDisplayValue(profile.progress.factEvidence[factId]) === 4,
  ).length
  return mastered > 0 && mastered < level.gatingFactIds.length
}

function streakSfx(streak: number): SfxEvent | null {
  if (streak === 5) return 'streak-5'
  if (streak === 10) return 'streak-10'
  if (streak === 25) return 'streak-25'
  if (streak === 50) return 'streak-50'
  if (streak === 100) return 'streak-100'
  return null
}

export function App({
  store = defaultStore,
  uiStorage = defaultUiStorage,
  inferenceRunner = inferStartLevel,
}: AppProps = {}) {
  const [bootstrap] = useState(() => initializeApp(store, uiStorage, inferenceRunner))
  const [screen, setScreen] = useState<Screen>('home')
  const [profile, setProfile] = useState<LearnerProfile>(bootstrap.profile)
  const [preferences, setPreferences] = useState<UiPreferences>(bootstrap.preferences)
  const [pendingNotices, setPendingNotices] = useState<PendingNotice[]>(bootstrap.pendingNotices)
  const [runtimeNotices, setRuntimeNotices] = useState<PersistenceNoticeItem[]>(() =>
    bootstrap.bootstrapSaveResults.flatMap((result) => runtimeItems(alertsForSaveResult(result))),
  )
  const [saveWarning, setSaveWarning] = useState<string | null>(() => {
    for (const result of [...bootstrap.bootstrapSaveResults].reverse()) {
      const warning = warningFromAlerts(alertsForSaveResult(result))
      if (warning) return warning
    }
    return null
  })
  const [muted, setMuted] = useState(() => readMuted())
  const [active, setActive] = useState<ActiveSession | null>(null)
  const [result, setResult] = useState<ResultState | null>(null)
  const [installHint, setInstallHint] = useState(false)
  const deferredPrompt = useRef<{ prompt: () => Promise<void> } | null>(null)
  const activeEngine = active?.engine ?? null

  const loadWarning = persistentLoadWarning(bootstrap.load)
  const persistenceWarning = loadWarning ?? saveWarning
  const curriculum = getCurriculum(profile.progress.skillId)
  const visibleLevels = curriculum.levels.filter((level) => level.kind !== 'speed')

  function commitPreferences(next: UiPreferences) {
    setPreferences(next)
    writeUiPreferences(uiStorage, next)
  }

  function surfaceAlerts(alerts: readonly PersistenceAlert[]) {
    const localItems = runtimeItems(alerts)
    if (localItems.length > 0) {
      setRuntimeNotices((current) => [...current, ...localItems])
    }
    const warning = warningFromAlerts(alerts)
    if (warning) setSaveWarning(warning)
    setPendingNotices(store.pendingNotices())
  }

  function saveProfile(next: LearnerProfile, engine?: LevelSessionEngine) {
    const saveResult = store.save(next)
    const alerts = engine
      ? engine.reportSaveResult(saveResult)
      : alertsForSaveResult(saveResult)
    surfaceAlerts(alerts)
    return saveResult
  }

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      deferredPrompt.current = event as unknown as { prompt: () => Promise<void> }
      setInstallHint(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  useEffect(() => {
    if (screen !== 'play' || !activeEngine) return
    const engine = activeEngine
    const id = window.setInterval(() => {
      setActive((current) =>
        current?.engine === engine
          ? { ...current, snapshot: engine.snapshot() }
          : current,
      )
    }, 200)
    return () => window.clearInterval(id)
  }, [activeEngine, screen])

  useEffect(() => {
    if (screen !== 'play' || !activeEngine) return
    const engine = activeEngine
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        engine.hide()
        const checkpoint = engine.checkpoint()
        const saveResult = store.save(checkpoint)
        const alerts = engine.reportSaveResult(saveResult)
        const items = runtimeItems(alerts)
        if (items.length > 0) setRuntimeNotices((current) => [...current, ...items])
        const warning = warningFromAlerts(alerts)
        if (warning) setSaveWarning(warning)
        setPendingNotices(store.pendingNotices())
        setProfile(structuredClone(checkpoint))
      } else {
        engine.resume()
      }
      setActive((current) =>
        current?.engine === engine
          ? {
              ...current,
              snapshot: engine.snapshot(),
              levelProgress: engine.levelProgress(),
            }
          : current,
      )
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [activeEngine, screen, store])

  function ensureAudio() {
    void unlockAudio()
  }

  function handleToggleMute() {
    ensureAudio()
    setMuted(toggleMuted())
  }

  async function handleInstall() {
    if (!deferredPrompt.current) return
    await deferredPrompt.current.prompt()
    deferredPrompt.current = null
    setInstallHint(false)
  }

  function startSession(mode: SessionMode, requestedLevelId?: LevelId) {
    const levelId = requestedLevelId ?? playableLevelId(profile)
    if (!canStartLevel(profile, levelId, curriculum)) return

    ensureAudio()
    playSfx('start')
    gameAudio.resetSessionFlags()
    gameAudio.startMusic()
    const engine = new LevelSessionEngine({
      profile,
      skill,
      mode,
      levelId,
      load: store.lastLoad(),
    })
    engine.nextQuestion()
    const initialAlerts = engine.persistenceAlerts()
    if (initialAlerts.length > 0) surfaceAlerts(initialAlerts)
    setProfile(structuredClone(engine.getProfile()))
    setActive({
      engine,
      snapshot: engine.snapshot(),
      levelProgress: engine.levelProgress(),
      bestTimeMs: bestTime(profile, levelId, mode),
    })
    setResult(null)
    setScreen('play')
  }

  function finishSession(engine: LevelSessionEngine) {
    const summary = engine.finish()
    const finishedProfile = engine.getProfile()
    saveProfile(finishedProfile, engine)
    const cloned = structuredClone(finishedProfile)
    setProfile(cloned)
    setResult({
      summary,
      levelProgress: engine.levelProgress(),
      levelTitle: engine.level.title,
    })
    setActive(null)
    setScreen('results')
    gameAudio.stopMusic()
    if (summary.advancement.newlyCompleted) playSfx('new-record')
    else if (summary.recordVisible && summary.record.isNewRecord) playSfx('new-record')
    else playSfx('milestone')
  }

  function handleSubmit(value: number) {
    if (!active?.snapshot.current) return
    const { engine } = active
    const outcome = engine.answer(active.snapshot.current.question.id, value)
    if (outcome.correct) {
      const streakSound = streakSfx(outcome.streak)
      if (streakSound) playSfx(streakSound)
      else playSfx('correct')
    } else {
      playSfx('miss')
    }
    gameAudio.setIntensity(outcome.answered / outcome.total)
    gameAudio.maybeProgressMilestone(outcome.answered, outcome.total)

    if (outcome.saveRecommended) saveProfile(engine.checkpoint(), engine)

    if (outcome.sessionComplete && !outcome.reveal) {
      finishSession(engine)
      return
    }
    if (!outcome.reveal) engine.nextQuestion()

    setProfile(structuredClone(engine.getProfile()))
    setActive({
      ...active,
      snapshot: engine.snapshot(),
      levelProgress: engine.levelProgress(),
    })
  }

  function dismissReveal() {
    if (!active) return
    const { engine } = active
    if (engine.isComplete()) {
      finishSession(engine)
      return
    }
    engine.nextQuestion()
    setProfile(structuredClone(engine.getProfile()))
    setActive({
      ...active,
      snapshot: engine.snapshot(),
      levelProgress: engine.levelProgress(),
    })
  }

  function leavePlay() {
    if (!active) return
    active.engine.abandon()
    const abandonedProfile = active.engine.getProfile()
    saveProfile(abandonedProfile, active.engine)
    setProfile(structuredClone(abandonedProfile))
    setActive(null)
    gameAudio.stopMusic()
    setScreen('home')
  }

  function selectLevel(levelId: LevelId) {
    const level = getLevel(levelId, curriculum)
    if (level.kind === 'speed' || !profile.progress.unlockedLevelIds.includes(levelId)) return
    const now = Date.now()
    const next: LearnerProfile = {
      ...profile,
      updatedAtMs: Math.max(profile.updatedAtMs, now),
      progress: { ...profile.progress, currentLevelId: levelId },
    }
    setProfile(next)
    saveProfile(next)
  }

  function parentUnlock(levelId: LevelId) {
    const level = getLevel(levelId, curriculum)
    if (level.kind === 'speed' || profile.progress.unlockedLevelIds.includes(levelId)) return
    const now = Date.now()
    const unlockedLevelIds = [...profile.progress.unlockedLevelIds, levelId]
      .filter((id) => getLevel(id, curriculum).kind !== 'speed')
      .sort((a, b) => levelIndexOf(a) - levelIndexOf(b))
    const next: LearnerProfile = {
      ...profile,
      updatedAtMs: Math.max(profile.updatedAtMs, now),
      progress: {
        ...profile.progress,
        unlockedLevelIds,
      },
    }
    setProfile(next)
    saveProfile(next)
    playSfx('milestone')
  }

  function dismissNotice(id: string) {
    if (id.startsWith('pending-')) {
      if (store.acknowledgeNotices()) setPendingNotices([])
      else {
        setRuntimeNotices((current) => [
          ...current,
          { id: `runtime-${++noticeSequence}`, message: 'This notice could not be dismissed from browser storage.' },
        ])
      }
      return
    }
    setRuntimeNotices((current) => current.filter((notice) => notice.id !== id))
  }

  function startPlacementRun() {
    ensureAudio()
    playSfx('start')
    gameAudio.resetSessionFlags()
    gameAudio.startMusic()
    setScreen('placement')
  }

  function checkpointPlacement(next: LearnerProfile) {
    setProfile(next)
    saveProfile(next)
  }

  function finishPlacement(next: LearnerProfile) {
    setProfile(next)
    gameAudio.stopMusic()
    playSfx('milestone')
    const nextPreferences: UiPreferences = {
      ...preferences,
      startPrompt: undefined,
      dropDownDismissedFor: undefined,
    }
    commitPreferences(nextPreferences)
    setScreen('home')
  }

  function leavePlacement() {
    gameAudio.stopMusic()
    setScreen('home')
  }

  const offeredDrop = dropDownOffer(profile)
  const dropKey = offeredDrop.fromLevelId && offeredDrop.toLevelId
    ? `${offeredDrop.fromLevelId}->${offeredDrop.toLevelId}`
    : null
  const dropDownPrompt: DropDownPrompt | null =
    offeredDrop.offer &&
    offeredDrop.fromLevelId &&
    offeredDrop.toLevelId &&
    preferences.dropDownDismissedFor !== dropKey
      ? {
          fromLevelId: offeredDrop.fromLevelId,
          toLevelId: offeredDrop.toLevelId,
        }
      : null

  function acceptDropDown() {
    if (!dropDownPrompt) return
    selectLevel(dropDownPrompt.toLevelId)
    commitPreferences({ ...preferences, dropDownDismissedFor: dropKey ?? undefined })
  }

  function dismissDropDown() {
    commitPreferences({ ...preferences, dropDownDismissedFor: dropKey ?? undefined })
  }

  const notices = [
    ...pendingNoticeItems(pendingNotices),
    ...runtimeNotices,
  ].filter(
    (notice, index, all) =>
      all.findIndex((candidate) => candidate.message === notice.message) === index &&
      notice.message !== persistenceWarning,
  )

  if (screen === 'placement') {
    return (
      <div className="app-shell">
        <PlacementScreen
          profile={profile}
          notices={notices}
          onDismissNotice={dismissNotice}
          persistenceWarning={persistenceWarning}
          onCheckpoint={checkpointPlacement}
          onDone={finishPlacement}
          onBack={leavePlacement}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      </div>
    )
  }

  if (screen === 'play' && active) {
    const playKey = active.snapshot.reveal
      ? `reveal-${active.snapshot.answered}`
      : active.snapshot.current?.question.id ?? 'play'
    return (
      <div className="app-shell">
        <PlayScreen
          key={playKey}
          snapshot={active.snapshot}
          levelTitle={active.engine.level.title}
          levelProgress={active.levelProgress}
          showRecordInfo={active.engine.isReplay}
          bestTimeMs={active.bestTimeMs}
          notices={notices}
          onDismissNotice={dismissNotice}
          persistenceWarning={persistenceWarning}
          onSubmit={handleSubmit}
          onDismissReveal={dismissReveal}
          onBack={leavePlay}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      </div>
    )
  }

  if (screen === 'results' && result) {
    return (
      <div className="app-shell">
        <ResultsScreen
          summary={result.summary}
          levelTitle={result.levelTitle}
          levelProgress={result.levelProgress}
          notices={notices}
          onDismissNotice={dismissNotice}
          persistenceWarning={persistenceWarning}
          onAgain={() => startSession(result.summary.mode, result.summary.levelId)}
          onHome={() => setScreen('home')}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <HomeScreen
        profile={profile}
        levels={visibleLevels}
        notices={notices}
        persistentWarning={persistenceWarning}
        startPrompt={preferences.startPrompt}
        dropDownPrompt={dropDownPrompt}
        showPracticeNudge={practiceNudgeVisible(profile, preferences)}
        muted={muted}
        onToggleMute={handleToggleMute}
        onQuick={() => startSession('quick')}
        onPractice={() => startSession('practice')}
        onRush={() => startSession('rush')}
        onPlacement={startPlacementRun}
        onSelectLevel={selectLevel}
        onParentUnlock={parentUnlock}
        onDismissNotices={dismissNotice}
        onDismissStartPrompt={() => commitPreferences({ ...preferences, startPrompt: undefined })}
        onAcceptDropDown={acceptDropDown}
        onDismissDropDown={dismissDropDown}
        onDismissPracticeNudge={() =>
          commitPreferences({
            ...preferences,
            practiceNudgeDismissedLevelId: playableLevelId(profile),
          })
        }
        showInstallHint={installHint}
        onInstallHint={() => void handleInstall()}
      />
    </div>
  )
}
