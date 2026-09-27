import { useState } from 'react'
import '../ui/math-rush.css'
import { FAMILY_BOARD, FAMILY_LOBBY, FAMILY_PODIUM, FAMILY_RACE, FAMILY_RACE_QUESTION } from './fixtures'
import { LeaderboardScreen } from './components/LeaderboardScreen'
import { LobbyScreen } from './components/LobbyScreen'
import { PodiumScreen } from './components/PodiumScreen'
import { RaceScreen } from './components/RaceScreen'

type SocialScreen = 'board' | 'lobby' | 'race' | 'podium'

const SCREENS: readonly { id: SocialScreen; label: string }[] = [
  { id: 'board', label: 'Leaderboard' },
  { id: 'lobby', label: 'Lobby' },
  { id: 'race', label: 'Race' },
  { id: 'podium', label: 'Podium' },
]

export function SocialPreview() {
  const [screen, setScreen] = useState<SocialScreen>('board')

  return (
    <main className="mr-root mr-social">
      <nav className="mr-social-nav" aria-label="Social previews">
        {SCREENS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={screen === item.id ? 'page' : undefined}
            onClick={() => setScreen(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {screen === 'board' ? <LeaderboardScreen entries={FAMILY_BOARD} /> : null}
      {screen === 'lobby' ? <LobbyScreen lobby={FAMILY_LOBBY} /> : null}
      {screen === 'race' ? <RaceScreen race={FAMILY_RACE} question={FAMILY_RACE_QUESTION} /> : null}
      {screen === 'podium' ? <PodiumScreen podium={FAMILY_PODIUM} /> : null}
    </main>
  )
}
