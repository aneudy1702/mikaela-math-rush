import { useEffect, useState } from 'react'
import type { Question } from '../../engine/contracts'
import { createAlgebraSkill } from '../../engine/content/algebra/plugin'
import { ALGEBRA_SKILL_ID } from '../../engine/content/algebra/catalog'
import { createDivisionSkill } from '../../engine/content/division/plugin'
import { DIVISION_SKILL_ID } from '../../engine/content/division/concepts'
import { createFractionsSkill } from '../../engine/content/fractions/plugin'
import { FRACTIONS_SKILL_ID } from '../../engine/content/fractions/catalog'
import { MULTIPLICATION_SKILL_ID, createMultiplicationSkill } from '../../engine/content/multiplication/plugin'
import { SharedQuestion } from './SharedQuestion'
import '../math-rush.css'

function isFraction(value: unknown): value is { numerator: number; denominator: number } {
  if (!value || typeof value !== 'object') return false
  const fraction = value as { numerator?: unknown; denominator?: unknown }
  return typeof fraction.numerator === 'number' && typeof fraction.denominator === 'number'
}

function answerLabel(value: unknown): string {
  if (isFraction(value)) return `${value.numerator}/${value.denominator}`
  return String(value)
}

const questions: Question[] = [
  createMultiplicationSkill(() => 0).generateQuestion({
    skillId: MULTIPLICATION_SKILL_ID,
    targetConcepts: ['7x8'],
    cognitiveDifficulty: 0.5,
  }),
  createDivisionSkill(() => 0).generateQuestion({
    skillId: DIVISION_SKILL_ID,
    cognitiveDifficulty: 0.5,
  }),
  createFractionsSkill(() => 0).generateQuestion({
    skillId: FRACTIONS_SKILL_ID,
    targetConcepts: ['fractions.identify.visual'],
    cognitiveDifficulty: 0.5,
  }),
  createAlgebraSkill(() => 0).generateQuestion({
    skillId: ALGEBRA_SKILL_ID,
    targetConcepts: ['algebra.one-step.addition'],
    cognitiveDifficulty: 0.5,
  }),
]

function PlayableQuestion({ question }: { question: Question }) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <section>
      <SharedQuestion question={question} onAnswer={(value) => setSelected(answerLabel(value))} />
      <p>{selected ? `Selected ${selected}` : 'Waiting for an answer'}</p>
    </section>
  )
}

export function SharedPlayProof() {
  useEffect(() => {
    if (document.getElementById('mr-fonts')) return
    const link = document.createElement('link')
    link.id = 'mr-fonts'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@500;700&family=Space+Grotesk:wght@700&display=swap'
    document.head.appendChild(link)
  }, [])

  return (
    <main className="mr-root">
      <div className="mr-proof">
        <h1>Shared play</h1>
        {questions.map((question) => (
          <PlayableQuestion key={question.id} question={question} />
        ))}
      </div>
    </main>
  )
}
