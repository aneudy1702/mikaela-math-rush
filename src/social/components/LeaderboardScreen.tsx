import { Avatar } from '../../ui/primitives'
import type { LeaderboardEntry } from '../contracts'
import { rankEntries } from '../rank'
import { formatRaceTime, percent } from '../format'
import { ContextBar } from './ContextBar'

export function LeaderboardScreen({ entries }: { entries: readonly LeaderboardEntry[] }) {
  const ranked = rankEntries(entries)
  const context = ranked[0]?.context
  return (
    <section className="mr-tier-quiet" aria-label="Family leaderboard">
      <p className="mr-kicker">Family board</p>
      <h1>Trophy ranks</h1>
      <p>A private preview for this household. It is not a public board.</p>
      {context ? <ContextBar context={context} /> : null}
      <p>Finished, more correct runs come first. A faster time breaks a tie.</p>
      <ol className="mr-social-list">
        {ranked.map((entry, index) => (
          <li key={entry.nickname}>
            <span>{index + 1}</span>
            <Avatar name={entry.nickname} />
            <span>
              {entry.nickname}
              <small>{entry.completed ? 'Finished' : 'Still going'}</small>
            </span>
            <span>{entry.completed ? percent(entry.correct, entry.answered) : 'Not finished'}</span>
            <span>{entry.correct}/{entry.answered}</span>
            <span>{formatRaceTime(entry.elapsedMs)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
