import { useEffect } from 'react'
import { AnswerChoice, BadgeTile, GameHUD, LevelNode, QuestionCard, XpBar } from '../game'
import { ArcadeCard, Avatar, EvidencePips, GlowButton } from '../primitives'
import type { EvidenceMarksView } from '../../engine/contracts'
import '../math-rush.css'

const pipStates: EvidenceMarksView[] = [
  { marks: 0, mastered: false },
  { marks: 1, mastered: false },
  { marks: 2, mastered: false },
  { marks: 3, mastered: false },
  { marks: 0, mastered: true },
]

export function DesignGallery() {
  useEffect(() => {
    if (document.getElementById('mr-fonts')) return
    const link = document.createElement('link')
    link.id = 'mr-fonts'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800;900&family=Space+Grotesk:wght@700&display=swap'
    document.head.appendChild(link)
  }, [])
  return (
    <main className="mr-root">
      <ArcadeCard>
        <Avatar name="Mikaela" />
        <h1>Math Rush</h1>
        <p>Design foundation. Not a play screen.</p>
        <GlowButton>Continue</GlowButton>
      </ArcadeCard>
      <div className="mr-pips" style={{ margin: '1rem 0' }}>
        {pipStates.map((state) => (
          <EvidencePips key={`${state.marks}-${state.mastered}`} {...state} />
        ))}
      </div>
      <GameHUD elapsed="0:42" streak={3} evidence={{ marks: 2, mastered: false }} />
      <QuestionCard prompt="7 × 8">
        <div className="mr-answers">
          <AnswerChoice visual={{ kind: 'numeric', text: '56' }} state="correct" />
          <AnswerChoice visual={{ kind: 'fraction', numerator: '3', denominator: '8' }} />
          <AnswerChoice visual={{ kind: 'algebra', text: 'x = 7' }} />
          <AnswerChoice visual={{ kind: 'visual', cells: 8 }} state="miss" />
        </div>
      </QuestionCard>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <LevelNode label="1" state="done" />
        <LevelNode label="2" state="current" />
        <LevelNode label="3" state="locked" />
      </div>
      <div style={{ marginTop: 16 }}>
        <XpBar filled={0.4} />
        <BadgeTile title="First Run" />
      </div>
    </main>
  )
}
