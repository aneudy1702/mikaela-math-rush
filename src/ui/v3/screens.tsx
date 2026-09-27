import type { EvidenceMarksView, Question, SessionMode } from '../../engine/contracts'
import { EvidencePips, GlowButton } from '../primitives'
import { GameHUD } from '../game'
import { SharedQuestion } from '../answers/SharedQuestion'
import { COMING_LATER, SHIPPED_SKILLS } from './recommend'

export function WhoIsPlaying({
  learners,
  onChoose,
  onAdd,
}: {
  learners: readonly { id: string; displayName: string }[]
  onChoose: (id: string) => void
  onAdd: (name: string, grade: number) => void
}) {
  return (
    <section className="mr-tier-quiet">
      <p className="mr-kicker">Math Rush</p>
      <h1>Who&apos;s playing?</h1>
      <div className="mr-roster">
        {learners.map((learner) => (
          <GlowButton key={learner.id} onClick={() => onChoose(learner.id)}>
            {learner.displayName}
          </GlowButton>
        ))}
      </div>
      <AddLearner onAdd={onAdd} />
    </section>
  )
}

function AddLearner({ onAdd }: { onAdd: (name: string, grade: number) => void }) {
  return (
    <form
      className="mr-add"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const name = String(data.get('name') ?? '').trim()
        const grade = Number(data.get('grade'))
        if (!name || !Number.isInteger(grade)) return
        onAdd(name, grade)
        event.currentTarget.reset()
      }}
    >
      <label>
        Learner name
        <input name="name" aria-label="Learner name" autoComplete="off" />
      </label>
      <label>
        Grade
        <select name="grade" aria-label="Grade" defaultValue="3">
          <option value="3">Grade 3</option>
          <option value="4">Grade 4</option>
          <option value="5">Grade 5</option>
          <option value="6">Grade 6</option>
        </select>
      </label>
      <button type="submit">+ Add learner</button>
    </form>
  )
}

export function HomeHub({
  name,
  continueLabel,
  continueDetail,
  recommendedTitle,
  recommendedReason,
  onContinue,
  onRecommended,
  onOpenSkill,
  onChangeLearner,
}: {
  name: string
  continueLabel: string
  continueDetail: string
  recommendedTitle: string
  recommendedReason: string
  onContinue?: () => void
  onRecommended: () => void
  onOpenSkill: (skillId: string) => void
  onChangeLearner: () => void
}) {
  return (
    <div className="mr-hub">
      <header className="mr-tier-quiet mr-hub-bar">
        <div>
          <p className="mr-kicker">Math Rush</p>
          <h1>Hi, {name}</h1>
        </div>
        <button type="button" onClick={onChangeLearner}>
          Change
        </button>
      </header>
      <section className="mr-tier-active mr-hero" aria-label="Continue">
        <p className="mr-kicker">Continue</p>
        <h2>{continueLabel}</h2>
        <p>{continueDetail}</p>
        {onContinue ? <GlowButton onClick={onContinue}>Continue</GlowButton> : null}
      </section>
      <section className="mr-tier-quiet mr-hero" aria-label="Recommended next">
        <p className="mr-kicker">Recommended next</p>
        <h2>{recommendedTitle}</h2>
        <p>{recommendedReason}</p>
        <button type="button" onClick={onRecommended}>
          Start recommended
        </button>
      </section>
      <section className="mr-tier-quiet" aria-label="Skills">
        <h2>Skills</h2>
        <div className="mr-skills">
          {SHIPPED_SKILLS.map((skill) => (
            <button key={skill.id} type="button" onClick={() => onOpenSkill(skill.id)}>
              {skill.title}
              <span>Grade {skill.grade}</span>
            </button>
          ))}
          {COMING_LATER.map((skill) => (
            <p key={skill.title} className="mr-later">
              {skill.title}
              <span>Coming later</span>
            </p>
          ))}
        </div>
      </section>
    </div>
  )
}

export function SkillJourney({
  title,
  levels,
  concepts,
  onPlay,
  onBack,
}: {
  title: string
  levels: readonly { id: string; label: string; state: 'done' | 'current' | 'locked' }[]
  concepts: readonly { id: string; view: EvidenceMarksView }[]
  onPlay: (levelId: string, mode: SessionMode) => void
  onBack: () => void
}) {
  const current = levels.find((level) => level.state === 'current') ?? levels[0]
  return (
    <section className="mr-tier-quiet">
      <button type="button" onClick={onBack}>
        Home
      </button>
      <h1>{title}</h1>
      <div className="mr-levels">
        {levels.map((level) => (
          <button
            key={level.id}
            type="button"
            className={`mr-node ${level.state}`}
            disabled={level.state === 'locked'}
            onClick={() => onPlay(level.id, 'practice')}
          >
            {level.label}
          </button>
        ))}
      </div>
      {current ? (
        <div className="mr-modes">
          <button type="button" onClick={() => onPlay(current.id, 'quick')}>
            Quick 10
          </button>
          <button type="button" onClick={() => onPlay(current.id, 'practice')}>
            Practice 25
          </button>
          <button type="button" onClick={() => onPlay(current.id, 'rush')}>
            Rush 100
          </button>
        </div>
      ) : null}
      <h2>Concept progress</h2>
      <ul className="mr-concepts">
        {concepts.map((concept) => (
          <li key={concept.id}>
            <span>{concept.id}</span>
            <EvidencePips {...concept.view} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PlayStage({
  question,
  evidence,
  elapsed,
  streak,
  reveal,
  onAnswer,
  onContinue,
  onExit,
}: {
  question: Question | null
  evidence: EvidenceMarksView
  elapsed: string
  streak: number
  reveal: string | null
  onAnswer: (value: unknown) => void
  onContinue: () => void
  onExit: () => void
}) {
  return (
    <section className="mr-tier-active mr-play">
      <button type="button" onClick={onExit}>
        Exit
      </button>
      <GameHUD elapsed={elapsed} streak={streak} evidence={evidence} />
      {question && !reveal ? (
        <SharedQuestion key={question.id} question={question} onAnswer={onAnswer} />
      ) : null}
      {reveal ? (
        <div className="mr-miss" role="status">
          <p>{reveal}</p>
          <button type="button" onClick={onContinue}>
            Keep going
          </button>
        </div>
      ) : null}
    </section>
  )
}

export function ResultsScreen({
  skillTitle,
  accuracy,
  elapsed,
  xp,
  streak,
  recordLabel,
  mastered,
  playerLevel,
  onHome,
}: {
  skillTitle: string
  accuracy: string
  elapsed: string
  xp: number
  streak: number
  recordLabel: string
  mastered: readonly string[]
  playerLevel: number
  onHome: () => void
}) {
  return (
    <section className="mr-tier-celebrate">
      <p className="mr-kicker">{skillTitle}</p>
      <h1>Results</h1>
      <dl>
        <div>
          <dt>Accuracy</dt>
          <dd>{accuracy}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{elapsed}</dd>
        </div>
        <div>
          <dt>XP earned</dt>
          <dd>{xp}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{streak}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>{recordLabel}</dd>
        </div>
        <div>
          <dt>Player level</dt>
          <dd>{playerLevel}</dd>
        </div>
      </dl>
      <h2>Academic progress</h2>
      {mastered.length > 0 ? (
        <ul>
          {mastered.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      ) : (
        <p>No new concepts mastered this run.</p>
      )}
      <GlowButton onClick={onHome}>Back home</GlowButton>
    </section>
  )
}
