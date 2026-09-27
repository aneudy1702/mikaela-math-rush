import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { gameAssets } from '../assets'
import { ChoicePad } from '../components/ChoicePad'
import {
  PersistenceBanner,
  type PersistenceNoticeItem,
} from '../components/PersistenceBanner'
import {
  applyAttemptToEvidence,
  applyPlacementResult,
  emptyFactEvidence,
  generateForFact,
  multiplicationChoices,
  getLevel,
  nextProbe,
  placementRawAttempt,
  placementResult,
  recordProbe,
  startPlacement,
  type LearnerProfile,
  type PlacementProbe,
  type PlacementResult,
  type PlacementState,
  type Question,
  type SessionRecord,
} from '../engine'

interface PlacementScreenProps {
  profile: LearnerProfile
  notices?: readonly PersistenceNoticeItem[]
  onDismissNotice?: (id: string) => void
  persistenceWarning?: string | null
  onCheckpoint: (profile: LearnerProfile) => void
  onDone: (profile: LearnerProfile) => void
  onBack: () => void
  muted: boolean
  onToggleMute: () => void
}

interface PlacementRound {
  probe: PlacementProbe
  question: Question
  shownAtMs: number
}

interface PendingAdvance {
  state: PlacementState
  profile: LearnerProfile
}

interface PlacementCompletion {
  profile: LearnerProfile
  result: PlacementResult
}

function newSessionId(nowMs: number): string {
  return `placement-${nowMs.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

function roundFor(probe: PlacementProbe): PlacementRound {
  return {
    probe,
    question: generateForFact(probe.factId),
    shownAtMs: Date.now(),
  }
}

function closePlacementSession(
  profile: LearnerProfile,
  sessionId: string,
  endReason: 'finished' | 'abandoned',
  endedAtMs: number,
): LearnerProfile {
  return {
    ...profile,
    updatedAtMs: Math.max(profile.updatedAtMs, endedAtMs),
    rawLog: {
      ...profile.rawLog,
      sessions: profile.rawLog.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, endedAtMs, endReason }
          : session,
      ),
    },
  }
}

export function PlacementScreen({
  profile,
  notices = [],
  onDismissNotice,
  persistenceWarning,
  onCheckpoint,
  onDone,
  onBack,
  muted,
  onToggleMute,
}: PlacementScreenProps) {
  const [placement, setPlacement] = useState<PlacementState | null>(null)
  const [round, setRound] = useState<PlacementRound | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [workingProfile, setWorkingProfile] = useState<LearnerProfile>(profile)
  const [locked, setLocked] = useState(false)
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null)
  const choices = useMemo(
    () => (round ? multiplicationChoices(round.question) : []),
    [round],
  )
  const [pendingAdvance, setPendingAdvance] = useState<PendingAdvance | null>(null)
  const [completion, setCompletion] = useState<PlacementCompletion | null>(null)
  const advanceTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!feedback || feedback.correct) return
    function handleRevealKey(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.target instanceof HTMLButtonElement) return
      event.preventDefault()
      continueAfterAnswer()
    }
    window.addEventListener('keydown', handleRevealKey)
    return () => window.removeEventListener('keydown', handleRevealKey)
  })

  function begin() {
    const now = Date.now()
    const id = newSessionId(now)
    const state = startPlacement()
    const probe = nextProbe(state)
    if (!probe) return
    const session: SessionRecord = {
      id,
      kind: 'placement',
      startedAtMs: now,
      endedAtMs: null,
      mode: null,
      levelId: null,
      inferred: false,
      endReason: null,
      isReplay: false,
      pauses: [],
      discardedOnHide: [],
    }
    const startedProfile: LearnerProfile = {
      ...profile,
      updatedAtMs: Math.max(profile.updatedAtMs, now),
      rawLog: {
        attempts: profile.rawLog.attempts.slice(),
        sessions: [...profile.rawLog.sessions, session],
      },
    }
    setSessionId(id)
    setPlacement(state)
    setWorkingProfile(startedProfile)
    setRound(roundFor(probe))
    onCheckpoint(startedProfile)
  }

  function finishPlacement(
    state: PlacementState,
    answeredProfile: LearnerProfile,
  ) {
    if (!sessionId) return
    const result = placementResult(state)
    if (!result) return
    const now = Date.now()
    const closed = closePlacementSession(answeredProfile, sessionId, 'finished', now)
    const finalProfile = applyPlacementResult(closed, result, now)
    setWorkingProfile(finalProfile)
    setRound(null)
    setFeedback(null)
    setPendingAdvance(null)
    setCompletion({ profile: finalProfile, result })
    onCheckpoint(finalProfile)
  }

  function advance(state: PlacementState, answeredProfile: LearnerProfile) {
    setLocked(false)
    setFeedback(null)
    setPendingAdvance(null)
    if (state.finished) {
      finishPlacement(state, answeredProfile)
      return
    }
    const probe = nextProbe(state)
    if (!probe) return
    setRound(roundFor(probe))
  }

  function continueAfterAnswer() {
    if (!pendingAdvance) return
    advance(pendingAdvance.state, pendingAdvance.profile)
  }

  function submit(given: number) {
    if (!placement || !round || !sessionId || locked) return
    if (!Number.isFinite(given)) return
    setLocked(true)

    const atMs = Date.now()
    const expected = Number(round.question.correctAnswer)
    const correct = given === expected
    const metadataA = round.question.metadata?.a
    const metadataB = round.question.metadata?.b
    const attempt = placementRawAttempt(
      round.probe,
      {
        correct,
        given,
        latencyMs: Math.max(0, atMs - round.shownAtMs),
        atMs,
        a: typeof metadataA === 'number' ? metadataA : undefined,
        b: typeof metadataB === 'number' ? metadataB : undefined,
      },
      sessionId,
    )
    const counted = !workingProfile.rawLog.attempts.some(
      (candidate) =>
        candidate.sessionId === sessionId &&
        candidate.factId === attempt.factId &&
        !candidate.correct,
    )
    const previousEvidence =
      workingProfile.progress.factEvidence[attempt.factId] ??
      emptyFactEvidence(attempt.factId)
    const evidence = applyAttemptToEvidence(previousEvidence, attempt, counted)
    const answeredProfile: LearnerProfile = {
      ...workingProfile,
      updatedAtMs: Math.max(workingProfile.updatedAtMs, atMs),
      rawLog: {
        ...workingProfile.rawLog,
        attempts: [...workingProfile.rawLog.attempts, attempt],
      },
      progress: {
        ...workingProfile.progress,
        factEvidence: {
          ...workingProfile.progress.factEvidence,
          [attempt.factId]: evidence,
        },
      },
    }
    const nextState = recordProbe(placement, round.probe, correct)
    const expression =
      round.question.prompt.type === 'expression'
        ? round.question.prompt.expression
        : round.probe.factId.replace('x', ' × ')
    const nextFeedback = correct
      ? { correct: true, text: 'Nice!' }
      : { correct: false, text: `${expression} = ${expected}` }

    setPlacement(nextState)
    setWorkingProfile(answeredProfile)
    setFeedback(nextFeedback)
    setPendingAdvance({ state: nextState, profile: answeredProfile })
    onCheckpoint(answeredProfile)

    if (correct) {
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null
        advance(nextState, answeredProfile)
      }, 260)
    }
  }

  function leave() {
    if (sessionId && placement && !placement.finished) {
      const abandoned = closePlacementSession(
        workingProfile,
        sessionId,
        'abandoned',
        Date.now(),
      )
      onCheckpoint(abandoned)
    }
    onBack()
  }

  if (completion) {
    const level = getLevel(completion.result.startLevelId)
    return (
      <section className="placement-complete">
        <motion.img
          src={gameAssets.characters.victory}
          alt=""
          className="placement-complete-runner"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
        />
        <PersistenceBanner notices={notices} onDismiss={onDismissNotice} />
        <span className="section-eyebrow">Warm-up complete</span>
        <h1>Start at Level {level.index}</h1>
        <p className="placement-result-title">{level.title}</p>
        <p>
          This is a good place to begin. You can still pick any lower unlocked level
          from the ladder.
        </p>
        <button
          type="button"
          className="mode-btn mode-quick placement-finish"
          onClick={() => onDone(completion.profile)}
        >
          <span className="mode-copy"><span className="mode-title">Go to my levels</span></span>
        </button>
      </section>
    )
  }

  if (!placement || !round) {
    return (
      <section className="placement-intro">
        <div className="play-toolbar">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back home">←</button>
          <h1 className="placement-title">Warm-up run</h1>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '×' : '♪'}
          </button>
        </div>
        <PersistenceBanner notices={notices} onDismiss={onDismissNotice} />
        {persistenceWarning ? (
          <div className="save-warning" role="status">
            <strong>Progress is not being saved.</strong> {persistenceWarning}
          </div>
        ) : null}
        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="placement-runner"
          draggable={false}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <p className="placement-lead">Let&apos;s find a comfortable starting level.</p>
        <p className="placement-bubble">
          This optional warm-up feels just like play. There is no timer and no score—take
          all the time you need.
        </p>
        <motion.button
          type="button"
          className="mode-btn mode-quick placement-start"
          onClick={begin}
          whileTap={{ scale: 0.98 }}
        >
          <img src={gameAssets.icons.practiceTarget} alt="" className="mode-icon" draggable={false} />
          <span className="mode-copy">
            <span className="mode-title">Start warm-up</span>
            <span className="mode-desc">Up to 12 questions</span>
          </span>
        </motion.button>
      </section>
    )
  }

  const expression =
    round.question.prompt.type === 'expression'
      ? round.question.prompt.expression
      : round.probe.factId.replace('x', ' × ')

  return (
    <section className="play placement-run" aria-label="Warm-up run">
      <div className="play-toolbar">
        <button type="button" className="icon-btn" onClick={leave} aria-label="Back home">←</button>
        <div className="play-level-name">
          <span>Warm-up</span>
          <strong>Question {round.probe.questionNumber} · up to 12</strong>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '×' : '♪'}
        </button>
      </div>

      <PersistenceBanner notices={notices} onDismiss={onDismissNotice} />
      {persistenceWarning ? (
        <div className="save-warning" role="status">
          <strong>Progress is not being saved.</strong> {persistenceWarning}
        </div>
      ) : null}

      <div className="placement-question-progress">
        <span style={{ width: `${(round.probe.questionNumber / 12) * 100}%` }} />
      </div>

      <div className="prompt-stage">
        <motion.img
          src={gameAssets.characters.runner}
          alt=""
          className="play-runner small"
          draggable={false}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {feedback && !feedback.correct ? (
          <motion.button
            type="button"
            className="reveal-card"
            onClick={continueAfterAnswer}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <span className="reveal-eyebrow">Almost!</span>
            <strong>{feedback.text}</strong>
            <span className="reveal-got-it">Got it</span>
          </motion.button>
        ) : (
          <div className="problem-card">
            <h2 className="prompt-expression">{expression}</h2>
            {feedback?.correct ? <div className="placement-correct">Nice!</div> : null}
          </div>
        )}
      </div>

      {!feedback || feedback.correct ? (
        <ChoicePad choices={choices} disabled={locked} onChoose={submit} />
      ) : null}
    </section>
  )
}
