import type { Question } from '../../engine/contracts'
import { QuestionCard } from '../game'
import type { AnswerRendererProps } from './registry'
import { rendererFor } from './rendererFor'

function promptText(question: Question): string {
  const prompt = question.prompt
  if (prompt.type === 'expression') return prompt.expression
  if (prompt.type === 'text') return prompt.text
  return prompt.alt
}

export function SharedQuestion({ question, onAnswer }: AnswerRendererProps) {
  const render = rendererFor(question.answerType)
  return (
    <QuestionCard prompt={promptText(question)}>
      <div data-answer-type={question.answerType}>
        {render({ question, onAnswer })}
      </div>
    </QuestionCard>
  )
}
