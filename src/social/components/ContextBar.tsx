import type { CompetitionContext } from '../contracts'

export function ContextBar({ context }: { context: CompetitionContext }) {
  return (
    <p className="mr-social-context">
      <span>{context.skillTitle}</span>
      <span>{context.levelTitle}</span>
      <span>{context.modeTitle}</span>
    </p>
  )
}
