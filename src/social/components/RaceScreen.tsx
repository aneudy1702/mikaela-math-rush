import { useState } from 'react'
import type { Question } from '../../engine/contracts'
import { SharedQuestion } from '../../ui/answers/SharedQuestion'
import { EvidencePips } from '../../ui/primitives'
import type { RaceFixture } from '../contracts'
import { ContextBar } from './ContextBar'

export function RaceScreen({ race, question }: { race: RaceFixture; question: Question }) {
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <section className="mr-tier-active mr-social-race" aria-label="Multiplayer race preview">
      <p className="mr-kicker">Family preview</p>
      <ContextBar context={race.context} />
      <p>
        Question {race.questionIndex} of {race.total}
      </p>
      <EvidencePips {...race.evidence} />
      <SharedQuestion
        question={question}
        onAnswer={(value) => setPicked(String(value))}
      />
      {picked ? <p>You picked {picked}. This preview is not saved.</p> : null}
      <ul className="mr-lanes" aria-label="Other racers">
        {race.lanes.map((lane) => (
          <li key={lane.nickname}>
            <span>{lane.you ? 'You' : lane.nickname}</span>
            <span className="mr-lane">
              <span style={{ width: `${(lane.answered / lane.total) * 100}%` }} />
            </span>
            <span>
              {lane.answered}/{lane.total}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
