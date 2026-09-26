import type { LevelProgressFact } from '../engine'

export interface FactProgressProps {
  facts: readonly LevelProgressFact[]
  compact?: boolean
}

const MARKS_MAX = 3

function factLabel(factId: string): string {
  return factId.replace('x', ' × ')
}

export function FactProgress({ facts, compact = false }: FactProgressProps) {
  return (
    <div
      className={`fact-progress${compact ? ' compact' : ''}`}
      role="list"
      aria-label="Fact progress"
    >
      {facts.map((fact) => {
        const mastered = fact.displayValue === 4
        const evidenceMarks = Math.max(0, Math.min(MARKS_MAX, Math.trunc(fact.displayValue)))
        const label = factLabel(fact.factId)
        const progressLabel = mastered
          ? `${label}: mastered`
          : `${label}: ${evidenceMarks} of ${MARKS_MAX} evidence marks`

        return (
          <div
            key={fact.factId}
            className={`fact-progress-item ${mastered ? 'mastered' : `marks-${evidenceMarks}`} status-${fact.status}${fact.gating ? ' gating' : ' intro'}`}
            role="listitem"
            data-fact-id={fact.factId}
            data-display-value={mastered ? 4 : evidenceMarks}
            data-status={fact.status}
            data-gating={fact.gating}
          >
            <span className="fact-progress-label">{label}</span>
            {mastered ? (
              <span className="fact-progress-mastered" aria-label={progressLabel}>
                Mastered
              </span>
            ) : (
              <span className="fact-progress-marks" aria-label={progressLabel}>
                {Array.from({ length: MARKS_MAX }, (_, index) => (
                  <span
                    key={index}
                    className={`fact-progress-mark${index < evidenceMarks ? ' filled' : ''}`}
                    aria-hidden="true"
                  />
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
