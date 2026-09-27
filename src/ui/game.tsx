import type { ReactNode } from 'react'
import { EvidencePips } from './primitives'
import type { EvidenceMarksView } from '../engine/contracts'

export type AnswerVisual =
  | { kind: 'numeric'; text: string }
  | { kind: 'fraction'; numerator: string; denominator: string }
  | { kind: 'algebra'; text: string }
  | { kind: 'visual'; cells: number }

export function AnswerChoice({
  visual,
  state = 'default',
}: {
  visual: AnswerVisual
  state?: 'default' | 'correct' | 'miss'
}) {
  return (
    <button
      type="button"
      className={`mr-answer ${state === 'default' ? '' : state}`}
      aria-label={visual.kind === 'visual' ? `${visual.cells} tiles` : undefined}
    >
      <AnswerFace visual={visual} />
    </button>
  )
}

function AnswerFace({ visual }: { visual: AnswerVisual }) {
  if (visual.kind === 'fraction') {
    return (
      <span className="mr-fraction">
        <span>{visual.numerator}</span>
        <i />
        <span>{visual.denominator}</span>
      </span>
    )
  }
  if (visual.kind === 'visual') {
    return (
      <span className="mr-tile" aria-hidden="true">
        {Array.from({ length: visual.cells }, (_, index) => (
          <span key={index} />
        ))}
      </span>
    )
  }
  return <span>{visual.text}</span>
}

export function QuestionCard({ prompt, children }: { prompt: string; children?: ReactNode }) {
  return (
    <section className="mr-card">
      <p className="mr-question">{prompt}</p>
      {children}
    </section>
  )
}

export function GameHUD({
  elapsed,
  streak,
  evidence,
}: {
  elapsed: string
  streak: number
  evidence: EvidenceMarksView
}) {
  return (
    <div className="mr-hud">
      <span>{elapsed}</span>
      <EvidencePips {...evidence} />
      <span>{streak} streak</span>
    </div>
  )
}

export function LevelNode({
  label,
  state,
}: {
  label: string
  state: 'done' | 'current' | 'locked'
}) {
  return <div className={`mr-node ${state}`}>{label}</div>
}

export function XpBar({ filled }: { filled: number }) {
  return <div className="mr-bar" role="presentation"><span style={{ width: `${filled * 100}%` }} /></div>
}

export function BadgeTile({ title }: { title: string }) {
  return <span className="mr-badge">{title}</span>
}
