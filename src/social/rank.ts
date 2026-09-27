import { accuracy, modeUsesSpeed, sameContext, type LeaderboardEntry } from './contracts'

/**
 * Rank one competition only.
 * Completion comes first, then accuracy, then speed when the mode uses it.
 * A faster time never outranks a more correct finished run.
 */
export function rankEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const context = entries[0]?.context
  if (context && entries.some((entry) => !sameContext(entry.context, context))) {
    throw new Error('Leaderboard entries must share one skill, level, and mode')
  }
  const speed = context ? modeUsesSpeed(context.mode) : false
  return entries.toSorted((a, b) => {
    if (a.completed !== b.completed) return a.completed ? -1 : 1
    const accuracyGap = accuracy(b) - accuracy(a)
    if (accuracyGap !== 0) return accuracyGap
    if (!speed) return 0
    return (a.elapsedMs ?? Number.POSITIVE_INFINITY) - (b.elapsedMs ?? Number.POSITIVE_INFINITY)
  })
}
