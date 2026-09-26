import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LearnerProfile, PlacementItem } from '../engine'
import {
  completePlacement,
  generateForFact,
  seedPlacementAttempt,
} from '../engine'
import { Keypad } from '../components/Keypad'

interface PlacementScreenProps {
  items: PlacementItem[]
  profile: LearnerProfile
  onUpdateProfile: (profile: LearnerProfile) => void
  onDone: (profile: LearnerProfile) => void
}

export function PlacementScreen({
  items,
  profile,
  onUpdateProfile,
  onDone,
}: PlacementScreenProps) {
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [hint, setHint] = useState<string | null>(null)

  const item = items[index]
  const question = useMemo(
    () => (item ? generateForFact(item.factId, () => 0.25, 0.5) : null),
    [item],
  )

  useEffect(() => {
    setDraft('')
    setLocked(false)
    setHint(null)
    setStartedAt(Date.now())
  }, [index])

  if (!item || !question) {
    return null
  }

  const expression =
    question.prompt.type === 'expression' ? question.prompt.expression : '—'

  function submit() {
    if (locked || draft === '' || !item || !question) return
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    setLocked(true)
    const latencyMs = Math.max(0, Date.now() - startedAt)
    const correct = value === item.product
    if (!correct) {
      setHint(`Almost! ${item.a}×${item.b}=${item.product}`)
    }
    const next = seedPlacementAttempt(
      profile,
      item.factId,
      correct,
      latencyMs,
    )
    onUpdateProfile(next)

    window.setTimeout(() => {
      const nextIndex = index + 1
      if (nextIndex >= items.length) {
        const done = completePlacement(next)
        onUpdateProfile(done)
        onDone(done)
      } else {
        setIndex(nextIndex)
      }
    }, correct ? 180 : 700)
  }

  return (
    <section className="play">
      <div className="play-top">
        <span>
          Placement <strong>{index + 1}</strong> / {items.length}
        </span>
        <span>Seeding your fact map</span>
      </div>
      <div className="play-progress" aria-hidden>
        <span style={{ width: `${((index + 1) / items.length) * 100}%` }} />
      </div>
      <div className="prompt-stage">
        <p className="streak-chip">Quick warm-up across the tables</p>
        <AnimatePresence mode="wait">
          <motion.h2
            key={item.factId}
            className="prompt-expression"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {expression}
          </motion.h2>
        </AnimatePresence>
        <div className={`answer-draft${draft ? '' : ' empty'}`}>{draft || '·'}</div>
        <div className={`feedback-line${hint ? ' miss' : ''}`}>{hint ?? ''}</div>
      </div>
      <Keypad
        disabled={locked}
        onDigit={(d) => setDraft((p) => (p.length >= 4 ? p : p + d))}
        onBackspace={() => setDraft((p) => p.slice(0, -1))}
        onEnter={submit}
      />
    </section>
  )
}
