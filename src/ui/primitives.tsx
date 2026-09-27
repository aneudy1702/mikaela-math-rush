import type { EvidenceMarksView } from '../engine/contracts'
import type { ReactNode } from 'react'

export function ArcadeCard({ children }: { children: ReactNode }) {
  return <section className="mr-card">{children}</section>
}

export function GlowButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className="mr-glow" onClick={onClick}>
      {children}
    </button>
  )
}

export function ProgressBar({ filled }: { filled: number }) {
  const width = `${Math.min(1, Math.max(0, filled)) * 100}%`
  return (
    <div className="mr-bar" role="presentation">
      <span style={{ width }} />
    </div>
  )
}

export function EvidencePips({ marks, mastered }: EvidenceMarksView) {
  if (mastered) {
    return (
      <span className="mr-pips" aria-label="Currently mastered">
        <span className="mr-star" aria-hidden="true">★</span>
      </span>
    )
  }
  return (
    <span className="mr-pips" role="img" aria-label={`${marks} of 3 marks`}>
      {[0, 1, 2].map((index) => (
        <span key={index} className={index < marks ? 'mr-pip on' : 'mr-pip'} />
      ))}
    </span>
  )
}

export function Avatar({ name }: { name: string }) {
  const initials = name.slice(0, 1).toUpperCase()
  return (
    <span className="mr-avatar" aria-hidden="true">
      {initials}
    </span>
  )
}
