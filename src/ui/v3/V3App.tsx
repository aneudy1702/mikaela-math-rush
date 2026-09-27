import { useEffect, useState } from 'react'
import type {
  LearnerProfileV3,
  LevelId,
  SessionMode,
  SessionResultSummaryV2,
  SkillProgress,
} from '../../engine/contracts'
import { completionGatingIds } from '../../engine/curriculum'
import { getCurriculum } from '../../engine/curriculum/curriculum'
import { evidenceMarksView } from '../../engine/learning/advancement'
import { createEmptyProfile } from '../../engine/learning/selection'
import { loadHousehold, saveHousehold, upsertLearner } from '../../engine/persistence/householdStore'
import { LevelSessionEngine } from '../../engine/session/levelSession'
import '../math-rush.css'
import { skillFor } from './playable'
import { recommendedSkill, skillTitle } from './recommend'
import { sessionProfile, writeSessionBack } from './sessionProfile'
import { formatElapsed } from './format'
import { HomeHub, PlayStage, ResultsScreen, SkillJourney, WhoIsPlaying } from './screens'

type Screen =
  | { name: 'who' }
  | { name: 'home' }
  | { name: 'journey'; skillId: string }
  | { name: 'play'; skillId: string; levelId: LevelId; mode: SessionMode }
  | { name: 'results'; summary: SessionResultSummaryV2 }

function householdNow(): { activeLearnerId: string | null; learners: Record<string, LearnerProfileV3> } {
  return loadHousehold(localStorage, { nowMs: Date.now(), learnerId: 'learner-migrated' }).household
}

function evidenceAt(progress: SkillProgress | undefined, id: string) {
  if (!progress) return undefined
  if (progress.factEvidence[id]) return progress.factEvidence[id]
  return Object.values(progress.factEvidence).find(
    (entry) => entry.factId === id || entry.factId.endsWith(`.${id}`),
  )
}

export function V3App() {
  const [household, setHousehold] = useState(householdNow)
  const [screen, setScreen] = useState<Screen>({ name: 'who' })

  useEffect(() => {
    if (document.getElementById('mr-fonts')) return
    const link = document.createElement('link')
    link.id = 'mr-fonts'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&family=Space+Grotesk:wght@700&display=swap'
    document.head.appendChild(link)
  }, [])

  function persist(next: typeof household) {
    setHousehold(next)
    saveHousehold(localStorage, next)
  }

  function learner(): LearnerProfileV3 | undefined {
    const id = household.activeLearnerId
    return id ? household.learners[id] : undefined
  }

  function replaceLearner(next: LearnerProfileV3) {
    persist({ ...upsertLearner(household, next), activeLearnerId: next.identity.id })
  }

  const active = learner()

  return (
    <main className="mr-root mr-v3">
      {screen.name === 'who' || !active ? (
        <WhoIsPlaying
          learners={Object.values(household.learners).map((item) => item.identity)}
          onChoose={(id) => {
            persist({ ...household, activeLearnerId: id })
            setScreen({ name: 'home' })
          }}
          onAdd={(name, grade) => {
            const shell = createEmptyProfile(name)
            const created: LearnerProfileV3 = {
              identity: { id: `learner-${crypto.randomUUID()}`, displayName: name, grade },
              skills: {},
              player: shell.player,
              records: {},
              rawLog: { attempts: [], sessions: [] },
              sessionLog: [],
              pendingReinforcements: [],
            }
            replaceLearner(created)
            setScreen({ name: 'home' })
          }}
        />
      ) : null}
      {screen.name === 'home' && active ? (
        <HomeScreen
          learner={active}
          onChangeLearner={() => setScreen({ name: 'who' })}
          onOpenSkill={(skillId) => setScreen({ name: 'journey', skillId })}
          onPlay={(skillId, levelId) => {
            replaceLearner({ ...active, lastActivePath: { skillId, levelId } })
            setScreen({ name: 'play', skillId, levelId, mode: 'practice' })
          }}
        />
      ) : null}
      {screen.name === 'journey' && active ? (
        <JourneyScreen
          learner={active}
          skillId={screen.skillId}
          onBack={() => setScreen({ name: 'home' })}
          onPlay={(levelId, mode) => {
            const level = levelId as LevelId
            replaceLearner({ ...active, lastActivePath: { skillId: screen.skillId, levelId: level } })
            setScreen({ name: 'play', skillId: screen.skillId, levelId: level, mode })
          }}
        />
      ) : null}
      {screen.name === 'play' && active ? (
        <PlaySession
          key={`${active.identity.id}:${screen.skillId}:${screen.levelId}:${screen.mode}`}
          learner={active}
          skillId={screen.skillId}
          levelId={screen.levelId}
          mode={screen.mode}
          onLearner={replaceLearner}
          onExit={() => setScreen({ name: 'home' })}
          onFinish={(summary) => setScreen({ name: 'results', summary })}
        />
      ) : null}
      {screen.name === 'results' ? (
        <ResultsScreen
          skillTitle={skillTitle(screen.summary.skillId)}
          accuracy={`${Math.round(screen.summary.accuracy * 100)}%`}
          elapsed={formatElapsed(screen.summary.elapsedMs)}
          xp={screen.summary.xp.total}
          streak={screen.summary.longestStreak}
          recordLabel={recordLabel(screen.summary)}
          mastered={screen.summary.factsMasteredThisSession}
          playerLevel={screen.summary.playerLevelAfter}
          onHome={() => setScreen({ name: 'home' })}
        />
      ) : null}
    </main>
  )
}

function recordLabel(summary: SessionResultSummaryV2): string {
  const key = summary.record.key
  const where = `${key.skillId} · ${key.levelId} · ${key.mode}`
  if (summary.record.isNewRecord) return `New record · ${where}`
  if (summary.record.isBaseline) return `Saved · ${where}`
  return where
}

function HomeScreen({
  learner,
  onChangeLearner,
  onOpenSkill,
  onPlay,
}: {
  learner: LearnerProfileV3
  onChangeLearner: () => void
  onOpenSkill: (skillId: string) => void
  onPlay: (skillId: string, levelId: LevelId) => void
}) {
  const recommended = recommendedSkill(learner.identity.grade)
  const path = learner.lastActivePath
  return (
    <HomeHub
      name={learner.identity.displayName}
      continueLabel={path ? skillTitle(path.skillId) : 'Choose a skill'}
      continueDetail={path ? `Level ${path.levelId}` : 'Your last session shows up here.'}
      recommendedTitle={recommended.title}
      recommendedReason={
        learner.identity.grade == null
          ? 'Grade is not set yet. Multiplication is the starting recommendation.'
          : `Fits grade ${learner.identity.grade}.`
      }
      onContinue={path ? () => onPlay(path.skillId, path.levelId) : undefined}
      onRecommended={() => onPlay(recommended.id, 'L1')}
      onOpenSkill={onOpenSkill}
      onChangeLearner={onChangeLearner}
    />
  )
}

/** `locked` is curriculum access, not a permanent mastery state. */
function levelState(
  levelId: string,
  currentId: string,
  completed: Set<string>,
  unlocked: Set<string>,
): 'done' | 'current' | 'locked' {
  if (completed.has(levelId)) return 'done'
  if (levelId === currentId || unlocked.has(levelId)) return 'current'
  return 'locked'
}

function JourneyScreen({
  learner,
  skillId,
  onBack,
  onPlay,
}: {
  learner: LearnerProfileV3
  skillId: string
  onBack: () => void
  onPlay: (levelId: string, mode: SessionMode) => void
}) {
  const curriculum = getCurriculum(skillId)
  const progress = learner.skills[skillId]
  const currentId = progress?.currentLevelId ?? 'L1'
  const unlocked = new Set(progress?.unlockedLevelIds ?? ['L1'])
  const completed = new Set(progress?.completedLevelIds ?? [])
  const currentLevel = curriculum.levels.find((level) => level.id === currentId) ?? curriculum.levels[0]
  const concepts = currentLevel
    ? completionGatingIds(currentLevel).map((id) => ({
        id,
        view: evidenceMarksView(evidenceAt(progress, id)),
      }))
    : []
  return (
    <SkillJourney
      title={skillTitle(skillId)}
      levels={curriculum.levels.map((level) => ({
        id: level.id,
        label: level.id,
        state: levelState(level.id, currentId, completed, unlocked),
      }))}
      concepts={concepts}
      onPlay={onPlay}
      onBack={onBack}
    />
  )
}

function PlaySession({
  learner,
  skillId,
  levelId,
  mode,
  onLearner,
  onExit,
  onFinish,
}: {
  learner: LearnerProfileV3
  skillId: string
  levelId: LevelId
  mode: SessionMode
  onLearner: (learner: LearnerProfileV3) => void
  onExit: () => void
  onFinish: (summary: SessionResultSummaryV2) => void
}) {
  const [engine] = useState(
    () =>
      new LevelSessionEngine({
        profile: sessionProfile(learner, skillId),
        skill: skillFor(skillId),
        mode,
        levelId,
        learnerId: learner.identity.id,
        clock: () => Date.now(),
      }),
  )
  const [question, setQuestion] = useState(() => engine.nextQuestion()?.question ?? null)
  const [reveal, setReveal] = useState<string | null>(null)
  const [snap, setSnap] = useState(() => engine.snapshot())

  function sync() {
    onLearner(writeSessionBack(learner, skillId, engine.getProfile()))
    setSnap(engine.snapshot())
  }

  function finish() {
    const summary = engine.finish()
    onLearner(writeSessionBack(learner, skillId, engine.getProfile()))
    onFinish(summary)
  }

  const factId = snap.current?.factId ?? snap.reveal?.factId ?? ''
  const evidence = evidenceMarksView(engine.getProfile().progress.factEvidence[factId])

  return (
    <PlayStage
      question={question}
      evidence={evidence}
      elapsed={formatElapsed(snap.elapsedMs)}
      streak={snap.streak}
      reveal={reveal}
      onAnswer={(value) => {
        if (!question) return
        const outcome = engine.answer(question.id, value)
        sync()
        if (outcome.reveal) {
          setReveal(outcome.reveal.text)
          return
        }
        if (outcome.sessionComplete) {
          finish()
          return
        }
        setQuestion(engine.nextQuestion()?.question ?? null)
      }}
      onContinue={() => {
        if (engine.snapshot().answered >= engine.snapshot().total) {
          finish()
          return
        }
        setReveal(null)
        setQuestion(engine.nextQuestion()?.question ?? null)
        setSnap(engine.snapshot())
      }}
      onExit={onExit}
    />
  )
}
