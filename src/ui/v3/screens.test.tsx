import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Question } from '../../engine/contracts'
import { HomeHub, PlayStage } from './screens'

const fraction: Question = {
  id: 'q1',
  skillId: 'fractions',
  conceptIds: ['fractions.compare.same-denominator'],
  instanceKey: 'fractions.compare.same-denominator:3/8|5/8',
  difficulty: 0.5,
  answerType: 'fraction',
  prompt: { type: 'text', text: 'Which is greater?' },
  correctAnswer: { numerator: 5, denominator: 8 },
  choices: [
    { id: 'a', value: { numerator: 3, denominator: 8 } },
    { id: 'b', value: { numerator: 5, denominator: 8 } },
  ],
}

describe('V3 screens', () => {
  it('shows continue and recommended next as different cards', () => {
    const html = renderToStaticMarkup(
      <HomeHub
        name="Mikaela"
        continueLabel="Multiplication"
        continueDetail="Level L3"
        recommendedTitle="Fractions"
        recommendedReason="Fits grade 4."
        onContinue={() => undefined}
        onRecommended={() => undefined}
        onOpenSkill={() => undefined}
        onChangeLearner={() => undefined}
      />,
    )
    expect(html).toContain('Continue')
    const empty = renderToStaticMarkup(
      <HomeHub
        name="Adrian"
        continueLabel="Choose a skill"
        continueDetail="Your last session shows up here."
        recommendedTitle="Fractions"
        recommendedReason="Fits grade 4."
        onRecommended={() => undefined}
        onOpenSkill={() => undefined}
        onChangeLearner={() => undefined}
      />,
    )
    expect(empty).toContain('Choose a skill')
    expect(empty).toContain('Start recommended')
    expect(empty).not.toContain('mr-glow')
    expect(html).toContain('Recommended next')
    expect(html).toContain('Multiplication')
    expect(html).toContain('Fractions')
    expect(html).toContain('One-Step Equations')
    expect(html).toContain('Coming later')
    expect(html).not.toContain('password')
    expect(html).not.toContain('email')
  })

  it('renders a shared answer type inside the play shell', () => {
    const html = renderToStaticMarkup(
      <PlayStage
        question={fraction}
        evidence={{ marks: 2, mastered: false }}
        elapsed="0:12"
        streak={1}
        reveal={null}
        onAnswer={() => undefined}
        onContinue={() => undefined}
        onExit={() => undefined}
      />,
    )
    expect(html).toContain('data-answer-type="fraction"')
    expect(html).toContain('mr-pip on')
    expect(html.match(/class="mr-pip on"/g)).toHaveLength(2)
    expect(html).not.toContain('mr-pip on"></span><span class="mr-pip on"></span><span class="mr-pip on"></span><span class="mr-pip on"')
  })
})
