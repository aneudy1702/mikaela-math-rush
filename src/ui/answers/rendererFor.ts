import type { ReactNode } from 'react'
import type { AnswerType } from '../../engine/contracts'
import type { AnswerRendererProps } from './registry'
import {
  FractionAnswer,
  MultipleChoiceAnswer,
  NumericAnswer,
  TextAnswer,
  VisualSelectionAnswer,
} from './registry'

const RENDERERS: Record<AnswerType, (props: AnswerRendererProps) => ReactNode> = {
  'multiple-choice': MultipleChoiceAnswer,
  'visual-selection': VisualSelectionAnswer,
  fraction: FractionAnswer,
  numeric: NumericAnswer,
  text: TextAnswer,
}

export function rendererFor(answerType: AnswerType): (props: AnswerRendererProps) => ReactNode {
  return RENDERERS[answerType]
}
