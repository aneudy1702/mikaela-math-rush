import type { Question } from '../../engine/contracts'
import { AnswerChoice, type AnswerVisual } from '../game'

export interface AnswerRendererProps {
  question: Question
  onAnswer?: (value: unknown) => void
}

function isFraction(value: unknown): value is { numerator: number; denominator: number } {
  if (!value || typeof value !== 'object') return false
  const fraction = value as { numerator?: unknown; denominator?: unknown }
  return typeof fraction.numerator === 'number' && typeof fraction.denominator === 'number'
}

function numberFace(value: unknown): AnswerVisual {
  return { kind: 'numeric', text: String(value) }
}

function fractionFace(value: unknown): AnswerVisual {
  if (!isFraction(value)) return numberFace(value)
  return {
    kind: 'fraction',
    numerator: String(value.numerator),
    denominator: String(value.denominator),
  }
}

function visualFace(value: unknown): AnswerVisual {
  if (isFraction(value)) return { kind: 'visual', cells: value.numerator }
  if (typeof value === 'number' && value > 0) return { kind: 'visual', cells: value }
  return numberFace(value)
}

function ChoiceAnswers({
  question,
  onAnswer,
  face,
}: AnswerRendererProps & { face: (value: unknown) => AnswerVisual }) {
  return (
    <div className="mr-answers">
      {question.choices?.map((choice) => (
        <AnswerChoice
          key={choice.id}
          visual={face(choice.value)}
          onSelect={() => onAnswer?.(choice.value)}
        />
      ))}
    </div>
  )
}

export function MultipleChoiceAnswer(props: AnswerRendererProps) {
  return <ChoiceAnswers {...props} face={numberFace} />
}

export function FractionAnswer(props: AnswerRendererProps) {
  return <ChoiceAnswers {...props} face={fractionFace} />
}

export function VisualSelectionAnswer(props: AnswerRendererProps) {
  return <ChoiceAnswers {...props} face={visualFace} />
}

export function NumericAnswer({ question, onAnswer }: AnswerRendererProps) {
  return (
    <form
      className="mr-numeric-form"
      onSubmit={(event) => {
        event.preventDefault()
        const raw = String(new FormData(event.currentTarget).get('answer') ?? '').trim()
        if (!raw) return
        const numeric = Number(raw)
        onAnswer?.(Number.isFinite(numeric) ? numeric : raw)
      }}
    >
      <input
        className="mr-numeric"
        name="answer"
        aria-label="Numeric answer"
        inputMode="numeric"
        data-question-id={question.id}
      />
      <button type="submit">Check</button>
    </form>
  )
}

export function TextAnswer({ question, onAnswer }: AnswerRendererProps) {
  return (
    <form
      className="mr-numeric-form"
      onSubmit={(event) => {
        event.preventDefault()
        const raw = String(new FormData(event.currentTarget).get('answer') ?? '').trim()
        if (!raw) return
        onAnswer?.(raw)
      }}
    >
      <input
        className="mr-numeric"
        name="answer"
        aria-label="Text answer"
        data-question-id={question.id}
      />
      <button type="submit">Check</button>
    </form>
  )
}

