import { Avatar } from '../../ui/primitives'
import type { RaceLobbyFixture } from '../contracts'
import { ContextBar } from './ContextBar'

export function LobbyScreen({ lobby }: { lobby: RaceLobbyFixture }) {
  const ready = lobby.participants.filter((racer) => racer.ready).length
  const code = `${lobby.roomCode.slice(0, 3)} ${lobby.roomCode.slice(3)}`
  return (
    <section className="mr-tier-quiet" aria-label="Private race lobby">
      <p className="mr-kicker">Private race room</p>
      <h1>Lobby</h1>
      <p className="mr-social-code" aria-label={`Room code ${code}`}>{code}</p>
      <p>Preview only. This room is not live, and nothing is sent.</p>
      <ContextBar context={lobby.context} />
      <p>
        {ready} of {lobby.participants.length} ready
      </p>
      <ul className="mr-social-list">
        {lobby.participants.map((racer) => (
          <li key={racer.nickname}>
            <Avatar name={racer.nickname} />
            <span>
              {racer.nickname}
              <small>{racer.host ? 'Host' : 'Racer'}</small>
            </span>
            <span>{racer.ready ? 'Ready' : 'Not ready'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
