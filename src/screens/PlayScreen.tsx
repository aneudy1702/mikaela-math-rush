import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FeedbackTier, SessionSnapshot } from '../engine'
import { Keypad } from '../components/Keypad'

interface PlayScreenProps {
  snapshot: SessionSnapshot
  bestMs: number | undefined
  onSubmit: (value: number) => void
}

function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000
  const m = Math.floor(s / 60)
  const rem = (s % 60).toFixed(1)
  return m > 0 ? `${m}:${rem.padStart(4, '0')}` : `${s.toFixed(1)}s`
}

function feedbackLabel(tier: FeedbackTier | null, reveal: string | null): {
  text: string
  kind: 'ok' | 'miss' | 'celeb' | ''
} {
  if (!tier) return { text: '', kind: '' }
  if (tier === 'soft-miss') {
    return { text: reveal ? `Almost! ${reveal}` : 'Almost!', kind: 'miss' }
  }
  if (tier === 'correct-subtle') return { text: '', kind: 'ok' }
  if (tier === 'new-record') return { text: 'New record!', kind: 'celeb' }
  const map: Record<string, string> = {
    'streak-5': 'Nice!',
    'streak-10': 'On Fire',
    'streak-25': 'Incredible',
    'streak-50': 'Unstoppable',
    'streak-100': 'Perfect Run',
  }
  return { text: map[tier] ?? '', kind: 'celeb' }
}

export function PlayScreen({ snapshot, bestMs, onSubmit }: PlayScreenProps) {
  const [draft, setDraft] = useState('')
  const [locked, setLocked] = useState(false)
  const question = snapshot.current?.question
  const expression =
    question?.prompt.type === 'expression' ? question.prompt.expression : '—'

  useEffect(() => {
    setDraft('')
    setLocked(false)
  }, [question?.id])

  const progress = snapshot.total > 0 ? snapshot.index / snapshot.total : 0
  const fb = feedbackLabel(snapshot.lastFeedback, snapshot.lastReveal)

  function appendDigit(d: string) {
    if (locked) return
    setDraft((prev) => (prev.length >= 4 ? prev : prev + d))
  }

  function backspace() {
    if (locked) return
    setDraft((prev) => prev.slice(0, -1))
  }

  function submit() {
    if (locked || draft === '') return
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    setLocked(true)
    onSubmit(value)
  }

  return (
    <section className="play">
      <div className="play-top">
        <span>
          Q <strong>{Math.min(snapshot.index + 1, snapshot.total)}</strong> /{' '}
          {snapshot.total}
        </span>
        <span>
          Streak <strong>{snapshot.streak}</strong>
        </span>
        <span>
          TIME <strong>{formatTime(snapshot.elapsedMs)}</strong>
          {bestMs != null ? (
            <>
              {' '}
              · BEST <strong>{formatTime(bestMs)}</strong>
            </>
          ) : null}
        </span>
      </div>

      <div className="play-progress" aria-hidden>
        <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>

      <div
        className={`prompt-stage${snapshot.current?.isBossPresentation ? ' boss' : ''}`}
      >
        <AnimatePresence mode="wait">
          <motion.h2
            key={question?.id ?? 'empty'}
            className="prompt-expression"
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.04, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {expression}
          </motion.h2>
        </AnimatePresence>

        <motion.div
          className={`answer-draft${draft ? '' : ' empty'}`}
          animate={
            snapshot.lastFeedback === 'correct-subtle'
              ? { scale: [1, 1.06, 1] }
              : { scale: 1 }
          }
          transition={{ duration: 0.22 }}
        >
          {draft || '·'}
        </motion.div>

        <div className={`feedback-line ${fb.kind}`}>{fb.text}</div>
        {snapshot.streak > 0 ? (
          <div className="streak-chip">×{snapshot.streak} streak</div>
        ) : null}
      </div>

      <Keypad
        disabled={locked}
        onDigit={appendDigit}
        onBackspace={backspace}
        onEnter={submit}
      />
    </section>
  )
}
