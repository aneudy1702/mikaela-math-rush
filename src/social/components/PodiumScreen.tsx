import { Avatar } from '../../ui/primitives'
import type { PodiumFixture } from '../contracts'
import { rankEntries } from '../rank'
import { formatRaceTime, percent } from '../format'
import { ContextBar } from './ContextBar'

export function PodiumScreen({ podium }: { podium: PodiumFixture }) {
  const ranked = rankEntries(podium.entries)
  return (
    <section className="mr-tier-celebrate" aria-label="Race podium">
      <p className="mr-kicker">Room {podium.roomCode}</p>
      <h1>Race finished</h1>
      <p>A finished run comes first, then the more correct score, then speed. This podium is not saved.</p>
      <ContextBar context={podium.context} />
      <ol className="mr-podium">
        {ranked.map((entry, index) => (
          <li key={entry.nickname}>
            <span>{index + 1}</span>
            <Avatar name={entry.nickname} />
            <span>{entry.nickname}</span>
            <span>{percent(entry.correct, entry.answered)}</span>
            <span>
              {entry.correct}/{entry.answered}
            </span>
            <span>{formatRaceTime(entry.elapsedMs)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
