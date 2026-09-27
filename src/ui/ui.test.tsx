import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnswerChoice, GameHUD, QuestionCard } from './game'
import { EvidencePips } from './primitives'
import { colors, motion } from './tokens'

describe('design foundation', () => {
  it('keeps Stitch colors and reduced motion in the stylesheet', () => {
    const css = readFileSync(new URL('./math-rush.css', import.meta.url), 'utf8')
    expect(css).toContain(colors.canvas.toLowerCase())
    expect(css).toContain(colors.academic.toLowerCase())
    expect(css).toContain(colors.mastery.toLowerCase())
    expect(css).toContain(motion.press)
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('renders evidence from marks and mastered, with no fourth pip', () => {
    const two = renderToStaticMarkup(<EvidencePips marks={2} mastered={false} />)
    expect(two.match(/class="mr-pip on"/g)).toHaveLength(2)
    expect(two.match(/class="mr-pip"/g)).toHaveLength(1)
    const mastered = renderToStaticMarkup(<EvidencePips marks={0} mastered={true} />)
    expect(mastered).toContain('Currently mastered')
    expect(mastered).not.toMatch(/class="mr-pip[" ]/)
  })

  it('shows numeric, fraction, algebra, and visual answers from fixtures', () => {
    const html = renderToStaticMarkup(
      <QuestionCard prompt="Compare">
        <AnswerChoice visual={{ kind: 'numeric', text: '56' }} />
        <AnswerChoice visual={{ kind: 'fraction', numerator: '3', denominator: '8' }} />
        <AnswerChoice visual={{ kind: 'algebra', text: 'x = 7' }} />
        <AnswerChoice visual={{ kind: 'visual', cells: 4 }} />
      </QuestionCard>,
    )
    expect(html).toContain('56')
    expect(html).toContain('3')
    expect(html).toContain('8')
    expect(html).toContain('x = 7')
    expect(html).toContain('4 tiles')
    expect(html).toContain('Compare')
  })

  it('displays the evidence it is given', () => {
    const html = renderToStaticMarkup(
      <GameHUD elapsed="1:00" streak={4} evidence={{ marks: 1, mastered: false }} />,
    )
    expect(html).toContain('1 of 3 marks')
    expect(html).toContain('4 streak')
  })
})
